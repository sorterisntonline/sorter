(ns app.http
  (:require [reitit.ring :as ring]
            [reitit.swagger-ui :as swagger-ui]
            [reitit.openapi :as openapi]
            [clojure.tools.logging :as log]
            [ring.adapter.jetty :as jetty]
            [ring.middleware.params :as params]
            [ring.middleware.session :as session]
            [ring.middleware.resource :refer [wrap-resource]]
            [ring.middleware.content-type :refer [wrap-content-type]]
            [ring.util.response :as resp]
            [clojure.string :as string]

            [io.staticweb.rate-limit.storage :as storage]
            [io.staticweb.rate-limit.middleware :refer [ip-rate-limit wrap-rate-limit]]
            [io.staticweb.rate-limit.limits :refer [RateLimit]]


            [app.database :as db]
            [muuntaja.middleware :as mw]
            [muuntaja.core :as m]
            [honey.sql.helpers :as h]
            [sluj.core :refer [sluj]]
            [hato.client :as hc]
            
            
            [app.login :as login]
            [app.spotify :as spotify]
            [app.item :as item]
            [app.vote :as vote]

            [app.permissions :as perms]
            [app.youtube :as youtube]
            [app.integrations :as integrations]
            [app.linear :as linear]
            [app.feed :as feed]
            [app.comments :as comments]
            [app.reddit :as reddit]
            [app.twitter :as twitter]
            [app.groups :as groups]
            [app.health :as health]
            [app.oauth :as oauth]
            [app.discord :as discord]
            [app.discord-oauth :as discord-oauth])
  (:import
   [java.net URLEncoder]))

(defn get-html-file [request]
  (log/debug "get-html-file called with host:" (-> request :headers (get "host")))
  (let [is-music (or (= "music.sorter.social" (-> request :headers (get "host")))
                     (= "/music" (:uri request)))
        html-file (if is-music "index2.html" "index.html")]
    (log/debug "Selected HTML file:" html-file)
    (str "public/" html-file)))

;; Replace the existing test functions with a single handler
(defn serve-index [request]
  (let [html-file (get-html-file request)]
    (-> (resp/resource-response html-file)
        (resp/content-type "text/html")
        (assoc :status 200))))

(defn count-votes [tag]
  (let [subquery (-> (h/select :items_in_tags/item_id)
                     (h/from :items_in_tags)
                     (h/where [:= :items_in_tags/tag_id (:tags/id tag)]))
        votes (-> (h/select [[:count :votes/id]])
                  (h/from :votes)
                  (h/where [:or
                            [:in :votes/left_item_id subquery]
                            [:in :votes/right_item_id subquery]])
                  db/exec! first :count)]
    (assoc tag :vote_count votes)))

(defn query-tags [r]
  {:status 200 :body
   {:public (->> (db/exec! (-> (h/select :tags/*
                                         [[:count :items_in_tags/item_id] :item_count])
                               (h/join :perms [:= :perms/tag_id :tags/id])
                               (h/where [:and
                                         [:= :perms/capability "view"]
                                         [:= :perms/user_id "all"]
                                         [:= :tags/unlisted false]])
                               (h/from :tags)

                               (h/left-join :items_in_tags [:= :items_in_tags/tag_id :tags/id])
                               (h/group-by :tags/id)))
                 (map count-votes))
    :private
    (let [groups (map :users_in_usergroups/usergroup_id
                      (db/exec! (-> {:select :* :from :users_in_usergroups
                                     :where [:= :user_id (-> r :session :user_name)]})))]
      (->> (db/exec! (-> (h/select :tags/*)
                         (h/from :tags)
                         (h/join :perms [:= :perms/tag_id :tags/id])
                         (h/where [:or
                                   [:and
                                    [:= :perms/capability "view"]
                                    (if (-> r :session :user_name)
                                      [:or
                                       [:like :perms/user_id (str "%" (-> r :session :user_name) "%")]
                                       (into [:or] (map #(vector :like :perms/user_id (str "%" % "%")) groups))]
                                      false)]
                                   [:and
                                    [:and
                                     [:= :perms/capability "view"]
                                     [:not [:= :perms/user_id "all"]]]
                                    (if (-> r :session :user_name)
                                      [:= :tags/owner (-> r :session :user_name)]
                                      false)]])))
           (map count-votes)))
    :unlisted
    (->> (db/exec! (-> (h/select :tags/*)
                       (h/from :tags)
                       (h/where [:and
                                 [:= :tags/unlisted true]
                                 (if (-> r :session :user_name)
                                   [:= :tags/owner (-> r :session :user_name)]
                                   false)])))
         (map count-votes))
    :namespaces (db/exec! "select domain_pk_namespace, count(*) from items group by domain_pk_namespace")}})

(comment
  (db/exec! (-> (h/select :*)
                (h/from :tags)
                (h/where [:= :tags/domain_pk_namespace "spotify.playlist"]))))

(defn get-admin-users []
  (when-let [admins (System/getenv "BORTER_STATIC_ADMINS")]
    (set (clojure.string/split admins #","))))

(defn post-tag [r]
  (log/debug "post-tag called with body-params:" (:body-params r))
  (when (nil? (-> r :session :user_name))
    (log/warn "Unauthorized attempt to create tag")
    (throw (ex-info "need to be logged in to make tag" {:status 401})))

  ;; Check for Discord context
  (let [has-discord-context (boolean (:discord r))
        domain-pk-ns (-> r :body-params :domain_pk_namespace)
        domain-pk (-> r :body-params :domain_pk)
        is-discord-channel (and domain-pk-ns domain-pk 
                                (= domain-pk-ns "discord.channel"))
        
        ;; Check if tag already exists for this Discord channel
        existing-tag (when (and is-discord-channel 
                                (or has-discord-context 
                                    (db/exec! {:select 1 
                                               :from :users 
                                               :where [:and 
                                                       [:= :user_name (-> r :session :user_name)]
                                                       [:not= :discord_id nil]]})))
                       (first (db/exec! {:select :*
                                         :from :tags
                                         :where [:and
                                                 [:= :tags/domain_pk_namespace domain-pk-ns]
                                                 [:= :tags/domain_pk domain-pk]]})))]
    
    (cond
      ;; Case 1: Explicit tag_id in request (standard update)
      (-> r :body-params :tag_id)
      (do (when-not (perms/owns (-> r :body-params :tag_id)
                                (-> r :session :user_name))
            (log/warn "User" (-> r :session :user_name) "attempted to edit tag they don't own:" (-> r :body-params :tag_id))
            (throw (ex-info "you can not edit tags you do not own" {:status 403})))

          (let [ret (db/exec! (-> (h/update :tags)
                                  (h/set (-> (-> r :body-params)
                                             (assoc :edited_at [:now])
                                             (dissoc :tag_id)))
                                  (h/where [:= :tags/id (-> r :body-params :tag_id)])))]
            (log/info "Tag updated:" (-> r :body-params :tag_id))
            (log/debug "Updated tag result:" ret)
            {:status 200 :body (first ret)}))
      
      ;; Case 2: Discord channel tag exists (update)
      (and is-discord-channel existing-tag)
      (do (when-not (perms/owns (:tags/id existing-tag)
                              (-> r :session :user_name))
            (log/warn "User" (-> r :session :user_name) "attempted to edit Discord channel tag they don't own:" (:tags/id existing-tag))
            (throw (ex-info "you can not edit tags you do not own" {:status 403})))

          (let [ret (db/exec! (-> (h/update :tags)
                                  (h/set (-> (-> r :body-params)
                                             (assoc :edited_at [:now])))
                                  (h/where [:= :tags/id (:tags/id existing-tag)])))]
            (log/info "Discord channel tag updated:" (:tags/id existing-tag))
            (log/debug "Updated Discord channel tag result:" ret)
            {:status 200 :body (first ret)}))
      
      ;; Case 3: Create new tag
      :else
      (let [ret (db/exec! (-> (h/insert-into :tags)
                              (h/values [(merge
                                          (-> r :body-params)
                                          {:tags/slug (sluj (-> r :body-params :title))
                                           :tags/owner (-> r :session :user_name)})])
                              (h/returning :*)))
            tagid (-> ret first :tags/id)]
        (db/exec! (-> (h/insert-into :perms)
                      (h/values (perms/public-permissions tagid))))
        (log/info "New tag created:" tagid "by user:" (-> r :session :user_name))
        {:status 200 :body (first ret)}))))


(defn delete-tag [req]
  (let [tagid (-> req :params (get "id") Integer/parseInt)]
    (when-not (perms/owns tagid (-> req :session :user_name))
      (throw (ex-info "must own tag" {:status 401})))

    (db/exec! {:delete-from :perms :where [:= :tag_id tagid]})
    (db/exec! {:delete-from :items_in_tags :where [:= :tag_id tagid]})
    (db/exec! {:delete-from :tags :where [:= :id tagid]})
    {:status 200 :body {:deleted true}}))

(defn urlencode-params [params]
  (clojure.string/join "&" (map (fn [[k v]] (str k "=" (URLEncoder/encode (str v) "UTF-8"))) params)))

(comment
  (urlencode-params {:a 3 :b 4}))

(defn tag-info-request [r]
  {:status 200 :body (:body (hc/request {:as :json
                                         :url (str "http://localhost:8081/api/tag/page?"
                                                   (urlencode-params (cond-> (-> r :params)
                                                                       (-> r :session :user_name) (assoc "user_name" (-> r :session :user_name)))))
                                         :method :get}))
   :headers {"Content-Type" "application/json"}})

(defn tag-info-request2 [r]
  {:status 200 :body (:body (hc/request {:as :json
                                         :url (str "http://localhost:8081/api/tag/page2?"
                                                   (urlencode-params (cond-> (-> r :params)
                                                                       (-> r :session :user_name)
                                                                       (assoc "user_name" (-> r :session :user_name)))))
                                         :method :get}))
   :headers {"Content-Type" "application/json"}})


(defn tag-slug-check [r]
  (let [title (-> r :query-params (get "title"))
        ns (sluj (or (-> r :query-params (get "ns")) ""))
        slug (sluj title)
        existing-tag (first (db/exec! {:select :*
                                       :from :tags
                                       :where [:and
                                               [:= :tags/slug slug]
                                               [:= :tags/ns ns]]}))]
    {:status 200 :body (if existing-tag
                         (assoc existing-tag :exists true)
                         {:slug slug
                          :exists false})}))

(defn tag-exists-check [r]
  (let [body (:body-params r)
        title (:title body)
        ns (sluj (or (:ns body) ""))
        domain-pk-ns (:domain_pk_namespace body)
        domain-pk (:domain_pk body)
        
        query (cond
                ;; Use title + ns if available
                title
                {:select :*
                 :from :tags
                 :where [:and
                         [:= :tags/slug (sluj title)]
                         [:= :tags/ns ns]]}
                
                ;; Use domain identifiers if no title
                (and domain-pk-ns domain-pk)
                {:select :*
                 :from :tags
                 :where [:and
                         [:= :tags/domain_pk_namespace domain-pk-ns]
                         [:= :tags/domain_pk domain-pk]]}
                
                :else
                (throw (ex-info "Either title or domain_pk_namespace+domain_pk are required" {:status 400})))]
        
    (let [existing-tag (first (db/exec! query))]
      {:status 200 
       :body (if existing-tag
               (assoc existing-tag :exists true)
               {:exists false})})))

(defn vote-delete [r]
  (let [admin-users (get-admin-users)
        username (-> r :session :user_name)
        vote-owner (-> (db/exec! (-> (h/select :owner) 
                                     (h/from :votes)
                                     (h/where [:= :votes/id (-> r :body-params :vote_id)])))
                       first 
                       :votes/owner)]
    (when-not (or (and admin-users (contains? admin-users username))
                  (= username vote-owner))
      (throw (ex-info "must own vote" {:status 401}))))

  (db/exec! (-> (h/delete-from :votes)
                (h/where [:= :votes/id (-> r :body-params :vote_id)])))
  {:status 200 :body {:ok true}})


(defn item-owner [id] (-> {:select [:owner] :from :items :where [:= :items/id id]}
                          db/exec! first :items/owner))
(defn item-post [req]
  (let [username (-> req :session :user_name)
        tagids [(-> req :body-params :tag_id)]
        admin-users (get-admin-users)
        is-admin (and admin-users (contains? admin-users username))]

    {:status 200 :body (if (-> req :body-params :id)
                         (do
                           (when-not (or is-admin
                                         (= (item-owner (-> req :body-params :id)) username))
                             (throw (ex-info "must own item to update it" {:status 403})))

                           (item/update-item req))
                         (item/create-item req))}))

(defn item-m-get [r]
  (let [itemid (-> r :query-params (get "item_id"))]
    (if (= -1 itemid)
      {:status 200 :body {:membership [] :skips []}}
      {:status 200 :body (let [itemid (Integer/parseInt itemid)]
                           {:membership
                            (db/exec! (-> (h/select :*)
                                          (h/from :items_in_tags)
                                          (h/where [:= :item_id itemid]) (h/join :tags [:= :items_in_tags.tag_id :tags.id])))
                            :skips
                            (db/exec! (-> (h/select :*)
                                          (h/from :skipped)
                                          (h/where [:and
                                                    [:= :item_id itemid]
                                                    [:= :owner (-> r :session :user_name)]])))})})))

(defn item-m-delete [r]
  (let [admin-users (get-admin-users)
        username (-> r :session :user_name)
        item-owner (-> (db/exec! (-> (h/select :owner) 
                                     (h/from :items)
                                     (h/where [:= :items/id (-> r :body-params :item_id)])))
                       first 
                       :items/owner)]
    (when-not (or (and admin-users (contains? admin-users username))
                  (= username item-owner))
      (throw (ex-info "must own item to remove it from tag" {:status 401}))))

  (db/exec! (-> (h/delete-from :items_in_Tags)
                (h/where [:and
                          [:= :item_id (-> r :body-params :item_id)]
                          [:= :tag_id (-> r :body-params :tag_id)]])))
  {:status 200 :body {:ok true}})

(defn item-m-post [req]
  ;; TODO change so that you just need add permission on that tag?
  (when-not (perms/can-tag (-> req :body-params :tag_id) "add" (-> req :session :user_name))
    (throw (ex-info "must have add permission on target tag" {:status 401})))

  (db/exec! (-> (h/insert-into :items_in_tags)
                (h/values [(-> req :body-params)])))
  {:status 200 :body {:ok true}})

(defn item-skip [req]
  (when-not (-> req :session :user_name)
    (throw (ex-info "must be logged in to skip" {:status 401})))

  (db/exec! {:insert-into :skipped
             :values [{:owner (-> req :session :user_name)
                       :item_id (-> req :body-params :item_id)}]})

  {:status 200 :body {:ok true}})

(defn item-skip-delete [req]
  (when-not (-> req :session :user_name)
    (throw (ex-info "must be logged in to skip" {:status 401})))

  (db/exec! (-> (h/delete-from :skipped)
                (h/where [:and
                          [:= :item_id (-> req :body-params :item_id)]
                          [:= :owner (-> req :session :user_name)]])))
  {:status 200 :body {:ok true}})

(def muntaja (m/create  (assoc-in m/default-options [:formats "application/json" :encoder-opts] {:encode-key-fn name})))

(defn wrap-exception [handler]
  (fn [request]
    (try
      (handler request)
      (catch Exception e
        (log/error "Exception in request handling" e)
        (merge {:status 500
                :body {:message (ex-message e)}}
               (ex-data e))))))

(defn wrap-request-logging [handler]
  (fn [request]
    (log/info "Request:" (:request-method request) (:uri request))
    (log/debug "Full request details:" 
               {:uri (:uri request)
                :request-method (:request-method request)
                :params (:params request)
                :query-params (:query-params request)
                :body-params (:body-params request)
                :session (:session request)})
    (let [response (handler request)]
      (log/info "Response:" (:status response))
      (log/debug "Full response details:" 
                {:status (:status response)
                 :headers (:headers response)
                 :body (if (and (map? (:body response))
                               (not (instance? java.io.InputStream (:body response))))
                        (str "Body: " (:body response))
                        "Body: [binary or stream]")})
      response)))

(comment 
  ;; deprecated! this is not secure and so there is no longer an endpoint for it
  )
(defn get-users [req]
  {:status 200 :body (->> (-> (db/exec! (-> {:select [:users/user_name :owner] :from :users :where true}
                                            (h/left-join :usergroups [:= :users/user_name
                                                                      :usergroups/user_name])))))})

(defn get-leaderboard [req]
  {:status 200 :body (db/exec! (-> {:select [:users/user_name [[:count :votes/*]]] :from :users}
                                   (h/group-by :users/user_name)
                                   (h/join :votes [:= :votes/owner :users/user_name])))})

(defn get-viz-items [req]
  (let [limit (when-let [limit-str (-> req :query-params (get "limit"))]
                (Integer/parseInt limit-str))
        query (-> (h/select-distinct :items.id :items.title
                                     :items.domain_pk_namespace
                                     :items.owner
                                     :items.created_at)
                  (h/from :items)
                  (h/join :items_in_tags [:= :items.id :items_in_tags.item_id]))
        query-with-limit (if limit
                           (h/limit query limit)
                           query)
        items (db/exec! query-with-limit)]
    {:status 200
     :body items}))

(defn get-viz-votes [req]
  (let [limit (when-let [limit-str (-> req :query-params (get "limit"))]
                (Integer/parseInt limit-str))
        query (-> (h/select :votes.left_item_id
                            :votes.right_item_id
                            :votes.magnitude
                            :votes.owner
                            :votes.created_at
                            [:attributes.title :attribute_name])
                  (h/from :votes)
                  (h/left-join :attributes [:= :votes.attribute :attributes.id])
                  (h/join [:items :left_items] [:= :votes.left_item_id :left_items.id])
                  (h/join [:items :right_items] [:= :votes.right_item_id :right_items.id]))
        query-with-limit (if limit
                           (h/limit query limit)
                           query)
        votes (db/exec! query-with-limit)]
    {:status 200
     :body votes}))




(def storage (storage/local-storage))
(comment
  (storage/clear-counters storage))

(defrecord UserRateLimit [id quota ttl]
  RateLimit
  (get-key [self req]
    (str (.getName (type self)) id
         "-"
         (:template (:reitit.core/match req))
         "-"
         (:user_name (:session req))))

  (get-quota [self req]
    (let [username (get-in req [:session :user_name])
          always-unlimited (-> (System/getenv "BORTER_STATIC_ADMINS")
                               (clojure.string/split #",")
                               (into []))]
      (cond
        ;; All users are unlimited when NO_RATE_LIMITS is true
        (= "true" (System/getenv "NO_RATE_LIMITS")) Integer/MAX_VALUE
        ;; Check if the username is in the always unlimited set
        (contains? always-unlimited username) Integer/MAX_VALUE
        ;; default case - use the specified quota
        :else quota)))

  (get-ttl [self req]
    ttl))

(def one-per-second {:storage storage :limit (UserRateLimit. 1 1 (java.time.Duration/ofSeconds 1))})
(def one-per-minute {:storage storage :limit (UserRateLimit. 2 1 (java.time.Duration/ofMinutes 1))})
(def five-per-minute {:storage storage :limit (UserRateLimit. 3 5 (java.time.Duration/ofMinutes 1))})
(def three-per-five-minutes {:storage storage :limit (UserRateLimit. 4 3 (java.time.Duration/ofMinutes 5))})

(defn wrap-discord-user-auth
  "Middleware that adds user context for Discord requests"
  [handler]
  (fn [request]
    (try
      (log/info "DISCORD USER AUTH START" (:discord request))
      (if-let [discord-context (:discord request)]
        (let [user-id (:user-id discord-context)
              username (:username discord-context)
              user (discord/get-or-create-discord-user user-id username)
              request-with-user (assoc-in request [:session :user_name] (:users/user_name user))]
          (handler request-with-user))
        (do
          (handler request)))
      (catch Exception e
        (log/error e "CRITICAL: Unhandled exception in wrap-discord-user-auth")
        (handler request)))))

(defn wrap-discord-auth
  "Middleware that authenticates requests from the Discord bot"
  [handler]
  (fn [request]
    (let [auth-header (get-in request [:headers "authorization"])
          discord-user-id (get-in request [:headers "x-discord-user-id"])
          discord-username (get-in request [:headers "x-discord-username"])]
      (log/debug "Discord auth attempt with user-id:" discord-user-id "username:" discord-username)
      (if (and (discord/validate-discord-request auth-header)
               discord-user-id
               discord-username)
        (do
          (log/info "Discord authentication successful for discord user:" discord-username)
          ;; Add Discord context to the request
          (handler (assoc request :discord {:user-id discord-user-id
                                            :username discord-username})))
        ;; Continue without Discord context
        (do
          (when auth-header
            (log/debug "Discord authentication failed or incomplete"))
          (handler request))))))

(defn get-namespaces [r]
  (let [username (-> r :session :user_name)
        groups (when username
                 (map :users_in_usergroups/usergroup_id
                      (db/exec! {:select :* 
                                 :from :users_in_usergroups
                                 :where [:= :user_id username]})))]
    
    {:status 200 
     :body 
     {:namespaces 
      (->> (db/exec! 
            (-> (h/select-distinct :tags/ns)
                (h/from :tags)
                (h/join :perms [:= :perms/tag_id :tags/id])
                (h/where [:or
                          ;; Public namespaces
                          [:and 
                           [:= :perms/capability "view"]
                           [:= :perms/user_id "all"]]
                          ;; User owned namespaces
                          (when username
                            [:= :tags/owner username])
                          ;; Namespaces with explicit permission for user
                          (when username
                            [:like :perms/user_id (str "%" username "%")])
                          ;; Namespaces with permission for user's groups
                          (when (seq groups)
                            (into [:or] 
                                  (map #(vector :like :perms/user_id (str "%" % "%")) 
                                       groups)))])))
           (map :tags/ns)
           (filter identity) ;; Remove nil namespaces
           (sort))}}))

(defn get-user [req]
  (let [user-name (get-in req [:query-params "user_name"])
        email (get-in req [:query-params "email"])
        loginid (get-in req [:query-params "login_id"])
        discord-id (get-in req [:query-params "discord_id"])
        
        user (cond
               ;; Direct lookup by user_name
               user-name
               (first (db/exec! (-> (h/select :*)
                                    (h/from :users)
                                    (h/where [:= :user_name user-name]))))
               
               ;; Direct lookup by email
               email
               (first (db/exec! (-> (h/select :*)
                                    (h/from :users)
                                    (h/where [:= :email email]))))
               
               ;; Lookup by loginid (could be username or email)
               loginid
               (first (db/exec! (-> (h/select :*)
                                    (h/from :users)
                                    (h/where [:or
                                              [:= :user_name loginid]
                                              [:= :email loginid]]))))
               
               ;; Lookup by discord_id
               discord-id
               (first (db/exec! (-> (h/select :*)
                                    (h/from :users)
                                    (h/where [:= :discord_id discord-id]))))
               
               :else nil)]
    
    (if user
      ;; Check if this is a temporary Discord user
      (let [is-temp-discord-user (string/starts-with? (:users/user_name user) "@discord_")
            ;; Return only user_name and temporary flag for security
            sanitized-user {:user_name (:users/user_name user)}
            user-with-temp-flag (cond
                                  is-temp-discord-user
                                  (assoc sanitized-user :temporary true)
                                  
                                  (and discord-id (not is-temp-discord-user))
                                  (assoc sanitized-user :temporary false)
                                  
                                  :else
                                  sanitized-user)]
        {:status 200 :body user-with-temp-flag})
      
      ;; User not found
      {:status 404 :body {:message "user not found"}})))

(def default-handler
  (fn [_] (resp/content-type (resp/resource-response "public/index.html") "text/html")))

(def routes
  [["/openapi.json"
    {:get {:no-doc true
           :openapi {:info {:title "my-api"
                            :description "openapi3 docs with [malli](https://github.com/metosin/malli) and reitit-ring"
                            :version "0.0.1"}
                     ;; used in /secure APIs below
                     :components {:securitySchemes {"auth" {:type :apiKey
                                                            :in :header
                                                            :name "Example-Api-Key"}}}}
           :handler (openapi/create-openapi-handler)}}]
   (swagger-ui/create-swagger-ui-handler
    {:path "/"
     :config {:validatorUrl nil
              :urls [{:name "openapi", :url "openapi.json"}]
              :urls.primaryName "openapi"
              :operationsSorter "alpha"}})
   ["/" {:handler default-handler}]
   
   ["/api"
    ["/health" {:get {:handler #'health/check-health}}]
    ["/feed" {:get {:handler #'feed/get-feed}}]
    ["/frontpage" {:get {:handler #'feed/get-frontpage-feed}}]
    ["/hierarchy" {:get {:handler #'feed/get-heirarchy}}]
    ["/leaderboard" {:get {:handler #'get-leaderboard}}]
    ["/users" {:get {:handler #'get-user}}]
    ["/tag" {:get {:handler #'query-tags}
             :post {:middleware [[wrap-rate-limit one-per-minute]]
                    :handler #'post-tag}
             :delete {:handler #'delete-tag}}]
    ["/tag/namespace" {:get {:handler #'get-namespaces}}]
    ["/tag/exists" {:get {:handler #'tag-slug-check}
                    :post {:handler #'tag-exists-check}}]
    ["/tag/page" {:get {:handler #'tag-info-request}}]
    ["/tag/page2" {:get {:handler #'tag-info-request2}}]
    ["/tag/permissions" {:get {:handler #'perms/get-perms}
                         :post {:middleware [[wrap-rate-limit one-per-minute]]
                                :handler #'perms/post-perms}}]
    ["/vote" {:post {:middleware [[wrap-rate-limit one-per-second]]
                     :handler #'vote/vote-post}
              :delete {:handler #'vote-delete}}]
    ["/item" {:middleware [[wrap-rate-limit one-per-second]]
              :post {:handler #'item-post}}]
    ["/item/membership" {:get {:handler #'item-m-get}
                         :delete {:handler #'item-m-delete}
                         :post {:handler #'item-m-post}}]
    ["/item/skip" {:post {:handler #'item-skip}
                   :delete {:handler #'item-skip-delete}}]
    ["/register" {:post {:handler #'login/handle-register}}]
    ["/login" {:post {:handler #'login/handle-login}
               :get {:handler #'login/current-session}}]
    ["/logout" {:post {:handler #'login/handle-logout}}]
    ["/send-confirmation" {:post {:middleware [[wrap-rate-limit three-per-five-minutes]]
                                  :handler #'login/handle-resend-verification}}]
    ["/verify" {:get {:middleware [[wrap-rate-limit five-per-minute]]
                      :handler #'login/handle-verify-email}}]
    ["/update-email" {:post {:middleware [[wrap-rate-limit three-per-five-minutes]]
                             :handler #'login/handle-update-email}}]
    ["/forgot-password" {:post {:middleware [[wrap-rate-limit three-per-five-minutes]]
                                :handler #'login/handle-forgot-password}}]
    ["/reset-password" {:post {:middleware [[wrap-rate-limit three-per-five-minutes]]
                               :handler #'login/handle-reset-password}}]

    ["/spotify" spotify/routes]
    ["/youtube" youtube/routes]
    ["/linear" linear/routes]
    ["/reddit" reddit/routes]
    ["/twitter" twitter/routes]
    ["/discord" discord/routes]

    ["/integrations" integrations/routes]
    ["/comments" comments/routes]
    ["/user_group" groups/routes]
    ["/viz"
     ["/items" {:get {:middleware [[wrap-rate-limit five-per-minute]]
                      :handler #'get-viz-items}}]
     ["/votes" {:get {:middleware [[wrap-rate-limit five-per-minute]]
                      :handler #'get-viz-votes}}]]]])

(defn wrap-dev-session
  "Middleware that injects a dev session when AUTO_LOGIN=true"
  [handler]
  (fn [request]
    (if (= (System/getenv "AUTO_LOGIN") "true")
      (handler (assoc request :session {:user_name "admin"}))
      (handler request))))

(def app
  (-> (ring/ring-handler
       (ring/router routes)
       default-handler)
      (wrap-request-logging) 
      (wrap-discord-user-auth)
      (wrap-discord-auth) 
      (wrap-dev-session)
      (session/wrap-session)
      (wrap-exception)
      (mw/wrap-params)
      (params/wrap-params)
      (mw/wrap-format muntaja)
      (wrap-resource "public")
      (wrap-content-type)))

(defn start [{:keys [port]}]
  (log/info "Starting HTTP server on port" port)
  (jetty/run-jetty #'app {:port port :join? false :host "0.0.0.0"})
  (log/info "HTTP server running on port" port)
  (println (str "http server running on port " port)))
