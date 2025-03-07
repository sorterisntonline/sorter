(ns app.http
  (:require [reitit.ring :as ring]
            [reitit.ring.malli]
            [reitit.coercion.malli]
            [reitit.ring.coercion :as coercion]
            [reitit.ring.spec :as spec]
            [reitit.swagger :as swagger]
            [reitit.swagger-ui :as swagger-ui]
            [reitit.openapi :as openapi]
            [reitit.dev.pretty :as pretty] 
            [clojure.tools.logging :as log]
            [ring.adapter.jetty :as jetty]
            [ring.middleware.params :as params]
            
            [ring.middleware.session :as session]
            [ring.middleware.resource :refer [wrap-resource]]
            [ring.middleware.content-type :refer [wrap-content-type]]
            [ring.middleware.reload :refer [wrap-reload]]
            
            [ring.util.response :as resp]
            [clojure.string :as string]
            
            [reitit.ring.middleware.muuntaja :as muuntaja]
            [reitit.ring.middleware.exception :as exception]
            [reitit.ring.middleware.multipart :as multipart]
            [reitit.ring.middleware.parameters :as parameters]
            [muuntaja.core :as m]
            [malli.util :as mu]

            [io.staticweb.rate-limit.storage :as storage]
            [io.staticweb.rate-limit.middleware :refer [ip-rate-limit wrap-rate-limit]]
            [io.staticweb.rate-limit.limits :refer [RateLimit]]


            [app.database :as db]
            [muuntaja.middleware :as mw]
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
            [app.discord-oauth :as discord-oauth]
            [com.rpl.specter :refer :all]
            [app.api-keys :as api-keys])
  (:import
   [java.net URLEncoder]))

;; Replace the existing test functions with a single handler
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
    #_:namespaces #_(db/exec! "select domain_pk_namespace count(*) from items group_by domain_pk_namespace")}})

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
            
            ;; Get tag ID (preferring 'id' over 'tag_id')
        tag-id (or (-> r :body-params :id)
                   (-> r :body-params :tag_id))
            
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
          ;; Case 1: Explicit tag id in request (standard update)
      tag-id
      (do (when-not (perms/owns tag-id (-> r :session :user_name))
            (log/warn "User" (-> r :session :user_name) "attempted to edit tag they don't own:" tag-id)
            (throw (ex-info "you can not edit tags you do not own" {:status 403})))

          (let [ret (db/exec! (-> (h/update :tags)
                                  (h/set (-> (-> r :body-params)
                                             (assoc :edited_at [:now])
                                             (dissoc :tag_id :id)))
                                  (h/where [:= :tags/id tag-id])))]
            (log/info "Tag updated:" tag-id)
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
                                             (assoc :edited_at [:now])
                                             (dissoc :tag_id :id)))
                                  (h/where [:= :tags/id (:tags/id existing-tag)])))]
            (log/info "Discord channel tag updated:" (:tags/id existing-tag))
            (log/debug "Updated Discord channel tag result:" ret)
            {:status 200 :body (first ret)}))
          
          ;; Case 3: Create new tag
      :else
      (let [body-params (-> r :body-params)
            ns (-> body-params :ns)
            tag-values (merge
                        (dissoc body-params :ns :tag_id :id)
                        (when (and ns (not= ns "")) {:tags/ns ns})
                        {:tags/slug (sluj (-> body-params :title))
                         :tags/owner (-> r :session :user_name)})
            ret (db/exec! (-> (h/insert-into :tags)
                              (h/values [tag-values])
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
                         (assoc existing-tag 
                                :exists true)
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

(comment) 
  ;; deprecated! this is not secure and so there is no longer an endpoint for it
  
(defn get-users [req]
  {:status 200 :body (db/exec! (-> {:select [:users/user_name :owner] :from :users :where true}
                                   (h/left-join :usergroups [:= :users/user_name
                                                             :usergroups/user_name])))})

(defn get-leaderboard [req]
  {:status 200 :body (db/exec! (-> {:select [:users/user_name [[:count :votes/*]]] :from :users}
                                   (h/group-by :users/user_name)
                                   (h/join :votes [:= :votes/owner :users/user_name])))})

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
          static-admins (System/getenv "BORTER_STATIC_ADMINS")
          always-unlimited (if static-admins
                             (-> static-admins
                                 (clojure.string/split #",")
                                 (into []))
                             ["tommy" "jason" "zod" "zodsuper" "admin"])]
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
      ;;(log/info "DISCORD USER AUTH START" (:discord request))
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

;; Define schemas using malli syntax
(def ErrorSchema
  [:map 
   [:message :string]])

(def TagSchema
  [:map
   [:tags/id :int]
   [:tags/title :string]
   [:tags/description [:maybe :string]]
   [:tags/slug :string]
   [:tags/ns [:maybe :string]]
   [:tags/owner :string]
   [:tags/created_at inst?]
   [:tags/edited_at inst?]
   [:tags/unlisted :boolean]
   [:tags/domain_pk_namespace [:maybe :string]]
   [:tags/domain_pk [:maybe :string]]
   [:vote_count {:optional true} :int]])

(def ItemSchema
  [:map
   [:id :int]
   [:title :string]
   [:slug :string]
   [:body {:optional true} :string]
   [:url {:optional true} :string]
   [:owner :string]
   [:created_at :string]
   [:edited_at {:optional true} :string]
   [:domain_pk_namespace {:optional true} :string]
   [:domain_pk {:optional true} :string]])

(def VoteSchema
  [:map
   [:id :int]
   [:left_item_id :int]
   [:right_item_id :int]
   [:magnitude :int]
   [:owner :string]
   [:created_at :string]
   [:attribute {:optional true} :int]])

(def UserSchema
  [:map
   [:user_name :string]
   [:email {:optional true} :string]
   [:temporary {:optional true} :boolean]])

(def AttributeSchema
  [:map
   [:id :int]
   [:title :string]
   [:description {:optional true} :string]
   [:owner :string]
   [:created_at inst?]
   [:edited_at inst?]])

(def routes
  [["/openapi.json"
    {:get {:no-doc true
           :openapi {:info {:title "Sorter API"
                            :description "API for sorter.social - a platform for democratic consensus on any content"
                            :version "1.0.1"}
                     :tags [{:name "System" :description "System and health endpoints"}
                            {:name "Authentication" :description "User authentication endpoints"}
                            {:name "API Keys" :description "API key management endpoints"}
                            {:name "Tags" :description "Tag management endpoints"}
                            {:name "Items" :description "Item management endpoints"}
                            {:name "Votes" :description "Voting and attribute management endpoints"}
                            {:name "Users" :description "User management endpoints"}
                            {:name "Comments" :description "Comment management endpoints"}
                            {:name "Groups" :description "Group management endpoints"}
                            {:name "Feed" :description "Feed and frontpage endpoints"}
                            {:name "Integrations" :description "External service integration endpoints"}] 
                     :components {:securitySchemes {"apiKeyAuth" {:type :apiKey
                                                                  :in :header
                                                                  :name "x-api-key"}
                                                    "cookieAuth" {:type :apiKey
                                                                  :in :cookie
                                                                  :name "ring-session"}}}}
           :handler (openapi/create-openapi-handler)}}] 

   ["/api" 
    {:no-doc true}
    ["/health" {:get {:no-doc false
                      :summary "Health check endpoint"
                      :tags ["System"]
                      :description "Simple health check to verify the API is running"
                      :responses {200 {:description "Health status"
                                       :content {:default {:schema [:map
                                                                    [:status :string]
                                                                    [:version :string] 
                                                                    [:database :string]]}}}}
                      :handler health/check-health}}]
    ["/feed" {:get {:no-doc false
                    :summary "Get feed for a tag"
                    :tags ["Feed"]
                    :description "Retrieves feed items for a specific tag, including recent votes and activity"
                    :parameters {:query [:map
                                         [:tag_id {:description "ID of the tag to get feed for"} :int]]}
                    :responses {200 {:description "Feed items"
                                     :content {:default {:schema [:map
                                                                  [:items [:vector ItemSchema]]]
                                                         :examples {:ok {:description "Feed items retrieved"
                                                                         :value {:items [{:id 1 :title "Example Item" :description "Description" :owner "user1" :created_at "2023-01-01T12:00:00Z"}]
                                                                                 :votes [{:id 1 :left_item_id 1 :right_item_id 2 :magnitude 1 :owner "user1" :created_at "2023-01-01T12:00:00Z"}]
                                                                                 :users ["user1" "user2"]}}}}}}
                                400 {:description "Invalid tag ID"
                                     :content {:default {:schema ErrorSchema
                                                         :examples {:ok {:value {:message "Invalid tag ID"}}}}}}}
                    :handler feed/get-feed}}]
    ["/frontpage" {:get {:no-doc false
                         :summary "Get frontpage feed"
                         :tags ["Feed"]
                         :description "Retrieves a 'frontpage' feed showing recent activity across all accessible tags"
                         :responses {200 {:description "Frontpage feed items"
                                          :content {:default {:schema [:map
                                                                       [:items [:vector ItemSchema]]
                                                                       [:votes [:vector VoteSchema]]
                                                                       [:tags [:vector TagSchema]]]
                                                              :examples {:ok {:value {:items [{:id 1 :title "Example Item"}] 
                                                                                      :owner "user1"
                                                                                      :created_at "2023-01-01T12:00:00Z"
                                                                                      :votes [{:id 1 :left_item_id 1 :right_item_id 2 :magnitude 40}]
                                                                                      :tags [{:id 1 :title "Example Tag" 
                                                                                              :slug "example-tag"
                                                                                              :owner "user1"
                                                                                              :created_at "2023-01-01T12:00:00Z"}]}}}}}}}}
                   :handler feed/get-frontpage-feed}] 
    ["/leaderboard" {:get {:no-doc false
                           :summary "Get user leaderboard"
                           :tags ["Users"]
                           :description "Returns aggregated voting statistics by user, sorted by vote count"
                           :responses {200 {:description "User leaderboard"
                                            :content {:default {:schema [:vector [:map
                                                                                  [:users/user_name :string]
                                                                                  [:count :int]]]
                                                                :examples {:ok {:value [{:user_name "user1" :count 150}
                                                                                        {:user_name "user2" :count 120}]}}}}}}}
                     :handler get-leaderboard}]
    ["/users" {:get {:no-doc false
                     :summary "Lookup users"
                     :tags ["Users"]
                     :description "Lookup users by various identifiers (username, email, login ID, or Discord ID)"
                     :parameters {:query [:map                                         [:user_name {:description "Username to lookup" :optional true} :string]
                                          [:email {:description "Email to lookup" :optional true} :string]
                                          [:login_id {:description "Login ID (username or email) to lookup" :optional true} :string]
                                          [:discord_id {:description "Discord ID to lookup" :optional true} :string]]}
                     :responses {200 {:description "User found"
                                      :content {:default {:schema UserSchema
                                                          :examples {:ok {:value {:user_name "example_user" :temporary false}}}}}}
                                 404 {:description "User not found"
                                      :content {:default {:schema ErrorSchema
                                                          :examples {:ok {:value {:message "user not found"}}}}}}}
                     :handler get-user}}]
    ["/tag" {:get {:no-doc false 
                   :summary "List accessible tags" 
                   :tags ["Tags"] 
                   :description "Lists tags the user has access to, separated into public, private, and unlisted categories" 
                   :responses {200 {:description "Available tags"
                                    :content {:default {:schema [:map
                                                                 [:public [:vector TagSchema]]
                                                                 [:private [:vector TagSchema]]
                                                                 [:unlisted [:vector TagSchema]]]
                                                        :examples {:ok {:value {:public [{:id 1 :title "Public Tag" :slug "public-tag" :vote_count 10 :owner "user1" :created_at "2023-01-01T12:00:00Z"}]
                                                                                :private [{:id 2 :title "Private Tag" :slug "private-tag" :vote_count 5 :owner "user1" :created_at "2023-01-01T12:00:00Z"}]
                                                                                :unlisted [{:id 3 :title "Unlisted Tag" :slug "unlisted-tag" :vote_count 2 :owner "user1" :created_at "2023-01-01T12:00:00Z"}]}}}}}}} 
                   :handler query-tags} 
             :post {:no-doc false
                    :openapi {:security [{"apiKeyAuth" []
                                          "cookieAuth" []}]}
                    :middleware [[wrap-rate-limit one-per-minute]]
                    :summary "Create or update tag"
                    :tags ["Tags"]
                    :description "Creates a new tag or updates an existing one. For updates, include tag_id. For new tags, omit tag_id."
                    :parameters {:body [:map
                                        [:id {:description "ID of tag to update (omit for new tags)" :optional true} :int]
                                        [:title {:description "Title of the tag"} :string]
                                        [:description {:description "Description of the tag" :optional true} :string]
                                        [:ns {:description "Namespace for the tag" :optional true} :string]
                                        [:unlisted {:description "Whether the tag is unlisted" :optional true} :boolean]
                                        [:domain_pk_namespace {:description "Domain namespace (e.g., 'spotify.playlist')" :optional true} :string]
                                        [:domain_pk {:description "Domain primary key" :optional true} :string]]}
                    :responses {200 {:description "Tag created/updated successfully"
                                     :content {:default {:schema [:map
                                                                  [:id :int]
                                                                  [:title :string]
                                                                  [:slug :string]
                                                                  [:description {:optional true} :string]
                                                                  [:owner :string]
                                                                  [:created_at :string]
                                                                  [:edited_at :string]
                                                                  [:unlisted :boolean]
                                                                  [:ns {:optional true} [:maybe :string]]
                                                                  [:domain_pk_namespace {:optional true} [:maybe :string]]
                                                                  [:domain_pk {:optional true} [:maybe :string]]]
                                                         :examples {:ok {:value {:id 356
                                                                                 :title "r and b"
                                                                                 :slug "r-and-b"
                                                                                 :description "thje wekend"
                                                                                 :owner "admin"
                                                                                 :created_at "2025-03-06T02:05:44.483Z"
                                                                                 :edited_at "2025-03-06T02:05:44.483Z"
                                                                                 :unlisted false
                                                                                 :ns nil
                                                                                 :domain_pk_namespace "meta.genre"
                                                                                 :domain_pk ""}}}}}}
                                401 {:description "Authentication required"
                                     :content {:default {:schema ErrorSchema
                                                         :examples {:ok {:value {:message "need to be logged in to make tag"}}}}}}
                                403 {:description "Not authorized to edit this tag"
                                     :content {:default {:schema ErrorSchema
                                                         :examples {:ok {:value {:message "you can not edit tags you do not own"}}}}}}}
                    :handler post-tag}
             :delete {:no-doc false
                      :openapi {:security [{"apiKeyAuth" []
                                            "cookieAuth" []}]}
                      :summary "Delete tag"
                      :tags ["Tags"]
                      :description "Deletes an existing tag. User must be the owner of the tag."
                      :parameters {:query [:map
                                           [:id {:description "ID of the tag to delete"} :string]]}
                      :responses {200 {:description "Tag deleted successfully"
                                       :content {:default {:schema [:map [:deleted :boolean]]
                                                           :examples {:ok {:value {:deleted true}}}}}}
                                  401 {:description "Authentication required"
                                       :content {:default {:schema ErrorSchema
                                                           :examples {:ok {:value {:message "must own tag"}}}}}}} 
                      :handler delete-tag}}]
    ["/tag/namespace" {:get {:no-doc false
                             :summary "List available namespaces"
                             :tags ["Tags"]
                             :description "Returns a list of all namespaces the current user can view"
                             :responses {200 {:description "List of accessible namespaces"
                                              :content {:default {:schema [:map
                                                                           [:namespaces [:vector :string]]]
                                                                  :examples {:ok {:value {:namespaces ["music" "movies" "books"]}}}}}}} 
                             :handler get-namespaces}}]
    ["/tag/exists" {:get {:no-doc false
                          :summary "Check if tag exists by title and optionally namespace"
                          :tags ["Tags"]
                          :description "Checks if a tag with given title exists"
                          :parameters {:query [:map
                                               [:title {:description "Title to check"} :string]
                                               [:ns {:description "Namespace to check in" :optional true} :string]]}
                          :responses {200 {:description "Existence check results"
                                           :content {:default {:schema [:map
                                                                        [:slug :string]
                                                                        [:exists :boolean]
                                                                        [:id {:optional true} :int]
                                                                        [:title {:optional true} :string]]
                                                               :examples {:ok {:value {:slug "example-tag" :exists false}}}}}}}}
                    :handler tag-slug-check

                    :post {:no-doc false
                           :summary "Check if tag exists"
                           :tags ["Tags"]
                           :description "Checks if a tag exists by various identifiers"
                           :parameters {:body [:map
                                               [:title {:description "Title to check" :optional true} :string]
                                               [:ns {:description "Namespace to check in" :optional true} :string]
                                               [:domain_pk_namespace {:description "Domain namespace" :optional true} :string]
                                               [:domain_pk {:description "Domain primary key" :optional true} :string]]}
                           :responses {200 {:description "Existence check results"
                                            :content {:default {:schema [:map
                                                                         [:exists :boolean]
                                                                         [:id {:optional true} :int]
                                                                         [:title {:optional true} :string]]
                                                                :examples {:ok {:value {:exists false}}}}}}
                                       400 {:description "Invalid request parameters"
                                            :content {:default {:schema ErrorSchema
                                                                :examples {:ok {:value {:message "Either title or domain_pk_namespace+domain_pk are required"}}}}}}}
                           :handler tag-exists-check}}]
    ["/tag/page" {:get {:no-doc false
                        :tags ["Tags"]
                        :summary "Get tag info"
                        :description "Get the info for a tag"
                        :handler tag-info-request}}]
    ["/tag/page2" {:get {:no-doc false
                         :tags ["Tags"]
                         :summary "Get tag info"
                         :description "Get the info for a tag"
                         :handler tag-info-request2}}]
    ["/tag/permissions" {:get {:no-doc false
                               :tags ["Tags"]
                               :summary "Get tag permissions"
                               :description "Get the permissions for a tag"
                               :handler perms/get-perms}
                         :post {:no-doc false
                                :tags ["Tags"]
                                :middleware [[wrap-rate-limit one-per-minute]]
                                :summary "Update tag permissions"
                                :description "Update the permissions for a tag"
                                :handler perms/post-perms}}]
    ["/vote" {:post {:no-doc false
                     :openapi {:security [{"apiKeyAuth" []
                                           "cookieAuth" []}]}
                     :middleware [[wrap-rate-limit one-per-second]]
                     :summary "Record a vote"
                     :tags ["Votes"]
                     :description "Records a user's vote comparing two items. The magnitude indicates the strength of preference."
                     :parameters {:body [:map
                                         [:left_item_id {:description "ID of the left item in comparison"} :int]
                                         [:right_item_id {:description "ID of the right item in comparison"} :int]
                                         [:magnitude {:description "Strength of preference (1-5)"} :int]
                                         [:tag_id {:description "ID of the tag context for this vote"} :int]
                                         [:attribute {:description "Optional attribute ID for this vote" :optional true} :int]]}
                     :responses {200 {:description "Vote recorded"
                                      :content {:default {:schema VoteSchema
                                                          :examples {:ok {:value {:id 1
                                                                                  :left_item_id 1
                                                                                  :right_item_id 2
                                                                                  :magnitude 3
                                                                                  :owner "user1"
                                                                                  :created_at "2023-01-01T12:00:00Z"}}}}}}
                                 401 {:description "Authentication required"
                                      :content {:default {:schema ErrorSchema
                                                          :examples {:ok {:value {:message "must be logged in to vote"}}}}}}}
                     :handler vote/vote-post}
              :delete {:no-doc false
                       :openapi {:security [{"apiKeyAuth" []
                                             "cookieAuth" []}]}
                       :summary "Delete a vote"
                       :tags ["Votes"]
                       :description "Deletes a vote by ID. User must be the owner of the vote or an admin."
                       :parameters {:body [:map
                                           [:vote_id {:description "ID of the vote to delete"} :int]]}
                       :responses {200 {:description "Vote deleted"
                                        :content {:default {:schema [:map [:ok :boolean]]
                                                            :examples {:ok {:value {:ok true}}}}}}
                                   401 {:description "Not authorized to delete this vote"
                                        :content {:default {:schema ErrorSchema
                                                            :examples {:ok {:value {:message "must own vote"}}}}}}} 
                       :handler vote-delete}
              :get {:no-doc false
                    :openapi {:security [{"apiKeyAuth" []
                                          "cookieAuth" []}]}
                    :summary "Get votes for a tag"
                    :tags ["Votes"]
                    :description "Retrieves votes for items in a specific tag. User must have view permission for the tag."
                    :parameters {:query [:map
                                         [:tag {:description "Tag ID or slug to get votes for"} :string]
                                         [:attribute {:description "Optional attribute ID or title to filter by" :optional true} :string]
                                         [:until {:description "Optional timestamp to filter votes up until (ISO format)" :optional true} :string]]}
                    :responses {200 {:description "Votes retrieved"
                                     :content {:default {:schema [:map
                                                                  [:votes [:vector VoteSchema]]]
                                                         :examples {:ok {:value {:votes [{:id 1
                                                                                          :left_item_id 1
                                                                                          :right_item_id 2
                                                                                          :magnitude 3
                                                                                          :owner "user1"
                                                                                          :created_at "2023-01-01T12:00:00Z"
                                                                                          :attribute 1}]}}}}}}
                                404 {:description "Tag not found"
                                     :content {:default {:schema ErrorSchema
                                                         :examples {:ok {:value {:message "tag not found"}}}}}}
                                403 {:description "Not authorized to view this tag"
                                     :content {:default {:schema ErrorSchema
                                                         :examples {:ok {:value {:message "not authorized to view this tag"}}}}}}}
                    :handler vote/vote-get}}]
    ["/attribute" {:post {:no-doc false
                          :openapi {:security [{"apiKeyAuth" []
                                                "cookieAuth" []}]}
                          :middleware [[wrap-rate-limit one-per-second]]
                          :summary "Create attribute"
                          :tags ["Votes"]
                          :description "Creates a new attribute used for votes"
                          :parameters {:body [:map
                                              [:title {:description "Title of the attribute"} :string]
                                              [:description {:description "Description of the attribute" :optional true} :string]]}
                          :responses {200 {:description "Attribute created"
                                           :content {:default {:schema AttributeSchema
                                                               :examples {:ok {:value {:id 1
                                                                                       :title "quality"
                                                                                       :description "How good is this item"
                                                                                       :owner "user1"
                                                                                       :created_at "2023-01-01T12:00:00Z"
                                                                                       :edited_at "2023-01-01T12:00:00Z"}}}}}}
                                      400 {:description "Attribute already exists"
                                           :content {:default {:schema ErrorSchema
                                                               :examples {:ok {:value {:message "attribute with this title already exists"}}}}}}
                                      401 {:description "Authentication required"
                                           :content {:default {:schema ErrorSchema
                                                               :examples {:ok {:value {:message "need to be logged in to create attribute"}}}}}}}
                          :handler vote/attribute-post}
                    :get {:no-doc false
                          :summary "List attributes"
                          :tags ["Votes"]
                          :description "Retrieves all available attributes"
                          :responses {200 {:description "List of attributes"
                                           :content {:default {:schema [:map
                                                                        [:attributes [:vector AttributeSchema]]]
                                                               :examples {:ok {:value {:attributes [
                                                                                                    {:id 0
                                                                                                     :title "default"
                                                                                                     :description "default attribute, means what upvoting means on other sites"
                                                                                                     :owner "all"
                                                                                                     :created_at "2023-01-01T12:00:00Z"
                                                                                                     :edited_at "2023-01-01T12:00:00Z"},
                                                                                                    {:id 1
                                                                                                     :title "quality"
                                                                                                     :description "How good is this item"
                                                                                                     :owner "user1"
                                                                                                     :created_at "2023-01-01T12:00:00Z"
                                                                                                     :edited_at "2023-01-01T12:00:00Z"}]}}}}}}} 
                                      
                          :handler vote/attribute-get}}]
    ["/item" {:middleware [[wrap-rate-limit one-per-second]]
              :post {:no-doc false
                     :openapi {:security [{"apiKeyAuth" []
                                           "cookieAuth" []}]}
                     :summary "Create or update item"
                     :tags ["Items"]
                     :description "Creates a new item or updates an existing one"
                     :parameters {:body [:map
                                         [:id {:description "ID of item to update (omit for new items)" :optional true :jsonschema/example 123} :int]
                                         [:title {:description "Title of the item" :jsonschema/example "My Awesome Item"} :string]
                                         [:slug {:description "Slug of the item" :optional true :jsonschema/example "my-awesome-item"} :string]
                                         [:body {:description "Body of the item, can be markdown, will render images & code blocks" :optional true :jsonschema/example "This is the content of my item with **markdown** support."} :string]
                                         [:url {:description "URL of the item" :optional true :jsonschema/example "https://example.com/resource"} :string]
                                         [:tag_id {:description "ID of the tag to add this item to" :jsonschema/example 42} :int]
                                         [:domain_pk_namespace {:description "Domain namespace. If set to IMG, manual forced image rendering will be used for the URL." :optional true :jsonschema/example "IMG"} :string]
                                         [:domain_pk {:description "Domain primary key -- ie for spotify, the playlist id" :optional true :jsonschema/example "item-unique-id-123"} :string]]}
                     :responses {200 {:description "Item created/updated"
                                      :content {:default {:schema ItemSchema
                                                          :examples {:ok {:value {:id 1
                                                                                  :title "New Item"
                                                                                  :body ""
                                                                                  :description "An item description"
                                                                                  :owner "user1"
                                                                                  :created_at "2023-01-01T12:00:00Z"}}}}}}
                                 401 {:description "Authentication required"
                                      :content {:default {:schema ErrorSchema
                                                          :examples {:ok {:value {:message "must be logged in to create items"}}}}}}
                                 403 {:description "Not authorized to update this item"
                                      :content {:default {:schema ErrorSchema
                                                          :examples {:ok {:value {:message "must own item to update it"}}}}}}}}
              :handler item-post}]
    ["/item/exists" {:get {:no-doc false
                           :summary "Check if item exists by title and optionally tag_id"
                           :tags ["Items"]
                           :description "Checks if an item with given title exists and optionally if it belongs to the specified tag"
                           :parameters {:query [:map
                                                [:title {:description "Title to check"} :string]
                                                [:tag_id {:description "Tag ID to check if item belongs to" :optional true} :string]]}
                           :responses {200 {:description "Existence check results"
                                            :content {:default {:schema [:map
                                                                         [:slug :string]
                                                                         [:exists :boolean]
                                                                         [:in_tag {:optional true} :boolean]
                                                                         [:id {:optional true} :int]
                                                                         [:title {:optional true} :string]]
                                                                :examples {:ok {:value {:slug "example-item" 
                                                                                        :exists true
                                                                                        :in_tag true
                                                                                        :id 123
                                                                                        :title "Example Item"}}}}}}}}
                     :handler item/item-slug-check
                     :post {:no-doc false
                            :summary "Check if item exists by various parameters"
                            :tags ["Items"]
                            :description "Checks if an item exists by title, domain identifiers, and optionally checks if it belongs to a tag"
                            :parameters {:body [:map
                                                [:title {:description "Title to check" :optional true} :string]
                                                [:tag_id {:description "Tag ID to check if item belongs to" :optional true} :int]
                                                [:domain_pk_namespace {:description "Domain namespace" :optional true} :string]
                                                [:domain_pk {:description "Domain primary key" :optional true} :string]]}
                            :responses {200 {:description "Existence check results"
                                             :content {:default {:schema [:map
                                                                          [:exists :boolean]
                                                                          [:in_tag {:optional true} :boolean]
                                                                          [:id {:optional true} :int]
                                                                          [:title {:optional true} :string]]
                                                                 :examples {:ok {:value {:exists true
                                                                                         :in_tag false
                                                                                         :id 123
                                                                                         :title "Example Item"}}}}}}
                                        400 {:description "Invalid request parameters"
                                             :content {:default {:schema ErrorSchema
                                                                 :examples {:ok {:value {:message "Either title or domain_pk_namespace+domain_pk are required"}}}}}}}
                            :handler item/item-exists-check}}]
    ["/item/membership" {:get {:no-doc false
                               :tags ["Items"]
                               :handler item-m-get}
                         :delete {:no-doc false
                                  :tags ["Items"]
                                  :handler item-m-delete}
                         :post {:no-doc false
                                :tags ["Items"]
                                :handler item-m-post}}]
    ["/item/skip" {:post {:no-doc false
                          :tags ["Items"]
                          :handler item-skip}
                   :delete {:no-doc false
                            :tags ["Items"]
                            :handler item-skip-delete}}]
    ["/register" {:post {:no-doc false
                         :summary "Register user"
                         :tags ["Authentication"]
                         :description "Creates a new user account and sends verification email"
                         :parameters {:body [:map
                                             [:user_name {:description "Username for new account"} :string]
                                             [:email {:description "Email address for new account"} :string]
                                             [:password {:description "Password for new account"} :string]]}
                         :responses {200 {:description "Registration successful"
                                          :content {:default {:schema [:map
                                                                       [:success :boolean]
                                                                       [:message :string]]
                                                              :examples {:ok {:value {:success true :message "Verification email sent"}}}}}}
                                     400 {:description "Invalid registration data"
                                          :content {:default {:schema ErrorSchema
                                                              :examples {:ok {:value {:message "Username already taken"}}}}}}}}
                  :handler login/handle-register}]
    ["/login" {:post {:no-doc false
                      :summary "Login user"
                      :tags ["Authentication"]
                      :description "Authenticates user by username/email and password"
                      :parameters {:body [:map
                                          [:user_name {:description "Username or email"} :string]
                                          [:password {:description "Password"} :string]]}
                      :responses {200 {:description "Logged in successfully"
                                       :content {:default {:schema [:map
                                                                    [:success :boolean]
                                                                    [:user_name :string]]
                                                           :examples {:ok {:value {:success true :user_name "example_user"}}}}}}
                                  401 {:description "Invalid credentials"
                                       :content {:default {:schema ErrorSchema
                                                           :examples {:ok {:value {:message "Invalid username or password"}}}}}}
                                  403 {:description "Email verification required"
                                       :content {:default {:schema ErrorSchema
                                                           :examples {:ok {:value {:message "Please verify your email address"}}}}}}}
                      :handler login/handle-login}

               :get {:no-doc false
                     :summary "Get current session"
                     :tags ["Authentication"]
                     :description "Returns information about the current session"
                     :handler login/current-session}}]

    ["/logout" {:post {:no-doc false
                       :openapi {:security [{"cookieAuth" []}]}
                       :summary "Logout user"
                       :tags ["Authentication"]
                       :description "Ends the current session for user"
                       :responses {200 {:description "Logged out successfully"
                                        :content {:default {:schema [:map [:success :boolean]]
                                                            :examples {:ok {:value {:success true}}}}}}}
                       :handler login/handle-logout}}]

    ["/send-confirmation" {:post {:no-doc false
                                  :openapi {:security [{"cookieAuth" []}]}
                                  :summary "send/resend verification email" 
                                  :tags ["Authentication"]
                                  :description "Sends a verification email to the user's email address to confirm their email address / finish registration"
                                  :middleware [[wrap-rate-limit three-per-five-minutes]]
                                  :handler login/handle-resend-verification}}]
    ["/verify" {:get {:no-doc false
                      :openapi {:security [{"cookieAuth" []}]}
                      :tags ["Authentication"]
                      :summary "Verify email"
                      :description "Verifies the user's email address"
                      :middleware [[wrap-rate-limit five-per-minute]]
                      :handler login/handle-verify-email}}]
    ["/update-email" {:post {:no-doc false
                             :openapi {:security [{"cookieAuth" []}]}
                             :tags ["Authentication"]
                             :summary "Update email"
                             :description "Updates the user's email address"
                             :middleware [[wrap-rate-limit three-per-five-minutes]]
                             :handler login/handle-update-email}}]
    ["/forgot-password" {:post {:no-doc false
                                :openapi {:security [{"cookieAuth" []}]}
                                :tags ["Authentication"]
                                :summary "Forgot password"
                                :description "Sends a password reset email to the user's email address"
                                :middleware [[wrap-rate-limit three-per-five-minutes]]
                                :handler login/handle-forgot-password}}]
    ["/reset-password" {:post {:no-doc false
                               :openapi {:security [{"cookieAuth" []}]}
                               :tags ["Authentication"]
                               :summary "Reset password"
                               :description "Resets the user's password"
                               :middleware [[wrap-rate-limit three-per-five-minutes]]
                               :handler login/handle-reset-password}}]

    ["/spotify" {:tags ["Integrations"]} spotify/routes]
    ["/youtube" {:tags ["Integrations"]} youtube/routes]
    ["/linear" {:tags ["Integrations"]} linear/routes]
    ["/reddit" {:tags ["Integrations"]} reddit/routes]
    ["/twitter" {:tags ["Integrations"]} twitter/routes]
    ["/discord" {:tags ["Integrations"]} discord/routes]

    ["/integrations" {:tags ["Integrations"]} integrations/routes]
    ["/comments" {:tags ["Comments"]} comments/routes]
    ["/user_group" {:tags ["Groups"]} groups/routes]
    ;; ["/viz" 
    ;;  ["/items" {:get {:no-doc true
    ;;                   :middleware [[wrap-rate-limit five-per-minute]]
    ;;                   :handler get-viz-items}}]
    ;;  ["/votes" {:get {:no-doc true
    ;;                   :middleware [[wrap-rate-limit five-per-minute]]
    ;;                   :handler get-viz-votes}}]] 
    ["/keys" {:tags #{"API Keys"} 
              :openapi {:security [{"apiKeyAuth" []
                                    "cookieAuth" []}]}
              :middleware [[wrap-rate-limit five-per-minute]]} 
     api-keys/routes]
    ["/docs"
     {:get {:no-doc true
            :handler (fn [_] {:status 302
                              :headers {"Location" "/api/docs/"}
                              :body ""})}}]
    ["/docs/*"
     {:get {:no-doc true
            :handler (swagger-ui/create-swagger-ui-handler
                      {:url "/openapi.json"
                       :config {:validatorUrl nil 
                                :operationsSorter "alpha"}})}}]]])
   

(defn wrap-api-key-auth
  "Middleware that authenticates requests via API key if present"
  [handler]
  (fn [request]
    (let [api-key (get-in request [:headers "x-api-key"])] 
      (if api-key
        (if-let [username (api-keys/validate-api-key api-key)]
          ;; API key is valid, add user to session
          (do
            (log/debug "API key authentication successful for user:" username)
            (handler (assoc-in request [:session :user_name] username)))
          ;; Invalid API key
          (do
            (log/warn "Invalid API key attempt")
            {:status 403
             :body "no authorization"}))
        ;; No API key in request, continue with normal authentication
        (handler request)))))


(defn wrap-dev-session
  "Middleware that injects a dev session when AUTO_LOGIN=true"
  [handler]
  (fn [request]
    (if (= (System/getenv "AUTO_LOGIN") "true")
      (do
        (log/info "AUTO_LOGIN is true, injecting dev session")
        (handler (assoc request :session {:user_name "admin"})))
      (handler request))))

(defn error-response [exception request]
  (def exception exception)
  (cond
    (and (= (type exception) clojure.lang.ExceptionInfo)
     (= :reitit.coercion/response-coercion (:type (ex-data exception))))
    {:status 500
     :body {:exception (read-string (pr-str (first (:errors  (ex-data exception)))))
            :data (:body (:response (ex-data exception)))}}

    :else
    {:status 500
     :body {:exception (->> exception Throwable->map)}}))

(def exception-middleware
  (exception/create-exception-middleware
   (merge exception/default-handlers
          {::exception/wrap
           (fn [handler e request]
             (log/error "error" (:uri request) e)
             (error-response e request))})))

(def m-instance (m/create
                 (-> m/default-options
                     (assoc-in [:formats "application/json" :encoder-opts]
                               {:encode-key-fn name}))))
(def app
  (-> (ring/ring-handler
       (ring/router routes
                    {:validate spec/validate
                     :exception pretty/exception
                     :conflicts nil
                     :data {:coercion (reitit.coercion.malli/create)
                            :muuntaja m-instance
                            :middleware
                            [session/wrap-session
                             wrap-api-key-auth
                             wrap-dev-session 
                             swagger/swagger-feature
                             openapi/openapi-feature
                             parameters/parameters-middleware
                             muuntaja/format-negotiate-middleware
                             muuntaja/format-response-middleware
                             muuntaja/format-request-middleware
                             exception-middleware
                             coercion/coerce-response-middleware
                             coercion/coerce-request-middleware]}})
                             
       (-> #'default-handler
           (wrap-resource "public")
           (wrap-content-type)))))

(defn start [{:keys [port]}]
  (log/info "Starting HTTP server on port" port)
  (jetty/run-jetty #'app {:port port :join? false :host "0.0.0.0"})
  (log/info "HTTP server running on port" port)
  (println (str "http server running on port " port)))
