(ns app.http
  (:require [reitit.ring :as ring]
            [ring.adapter.jetty :as jetty]
            [ring.middleware.params :as params]
            [ring.middleware.session :as session]
            [ring.middleware.resource :refer [wrap-resource]]
            [ring.middleware.content-type :refer [wrap-content-type]]
            [ring.util.response :as resp]

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
            [app.discord :as discord]
            [app.health :as health])
  (:import
   [java.net URLEncoder]))

(defn test [r]
  (if (= "music.sorter.social" (-> r :headers (get "host")))
    (resp/content-type (resp/resource-response "public/index2.html") "text/html")
    (resp/content-type (resp/resource-response "public/index.html") "text/html")))

(defn test-2 [r]
  (resp/content-type (resp/resource-response "public/index2.html") "text/html"))

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





(defn post-tag [r]
  (when (nil? (-> r :session :user_name))
    (throw (ex-info "need to be logged in to make tag" {:status 401})))

  (if (-> r :body-params :tag_id)
    (do (when (not=
               (-> {:select :owner :from :tags
                    :where [:= :tags/id (-> r :body-params :tag_id)]}
                   db/exec! first :tags/owner)
               (-> r :session :user_name))
          (throw (ex-info "you can not edit tags you do not own" {:status 403})))

        (let [ret (db/exec! (-> (h/update :tags)
                                (h/set (-> (-> r :body-params)
                                           (assoc :edited_at [:now])
                                           (dissoc :tag_id)))
                                (h/where [:= :tags/id (-> r :body-params :tag_id)])))]
          {:status 200 :body (first ret)}))

    (do (let [ret (db/exec! (-> (h/insert-into :tags)
                                (h/values [(merge
                                            (-> r :body-params)
                                            {:tags/slug (sluj (-> r :body-params :title))
                                             :tags/owner (-> r :session :user_name)})])
                                (h/returning :*)))
              tagid (-> ret first :tags/id)]
          (db/exec! (-> (h/insert-into :perms)
                        (h/values (perms/public-permissions tagid))))
          {:status 200 :body (first ret)}))))


(defn delete-tag [req]
  (let [tagid (-> req :params (get "id") Integer/parseInt)
        tag (first (db/exec! {:select :tags/* :from :tags :where [:= :tags/id tagid]}))]

    (when-not (= (-> req :session :user_name)
                 (:tags/owner tag))
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
        slug (sluj title)]
    {:status 200 :body {:slug slug
                        :exists
                        (not (empty? (db/exec! {:select :slug
                                                :from :tags
                                                :where [:and
                                                        [:= :tags/slug slug]
                                                        [:= :tags/ns ns]]})))}}))

(defn vote-delete [r]
  (when-not (= (-> r :session :user_name)
               (-> (db/exec! (-> (h/select :owner) (h/from :votes)
                                 (h/where
                                  [:= :votes/id (-> r :body-params :vote_id)])))
                   first :votes/owner))
    (throw (ex-info "must own vote" {:status 401})))

  (db/exec! (-> (h/delete-from :votes)
                (h/where [:= :votes/id (-> r :body-params :vote_id)])))
  {:status 200 :body {:ok true}})


(defn item-owner [id] (-> {:select [:owner] :from :items :where [:= :items/id id]}
                          db/exec! first :items/owner))
(defn item-post [req]
  (let [username (-> req :session :user_name)
        tagids [(-> req :body-params :tag_id)]]

    {:status 200 :body (if (-> req :body-params :id)
                         (do
                           (when-not (= (item-owner (-> req :body-params :id)) username)
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
  (when-not (= (-> r :session :user_name)
               (-> (db/exec!
                    (-> (h/select :owner) (h/from :items)
                        (h/where [:= :items/id (-> r :body-params :item_id)])))
                   first :items/owner))
    (throw (ex-info "must own item to remove it from tag" {:status 401})))

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
    (try (handler request)
         (catch Exception e
           (def e e)
           (let [message (ex-message e)]
             message)
           (merge {:status 500
                   :body {:message (ex-message e)}}
                  (ex-data e))))))

(defn get-users [req]
  {:status 200 :body (->> (-> (db/exec! (-> {:select [:users/user_name :owner] :from :users :where true}
                                            (h/left-join :usergroups [:= :users/user_name
                                                                      :usergroups/user_name])))))})

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
    (if (= "tommy" (get-in req [:session :user_name]))
      Integer/MAX_VALUE  ; effectively no rate limit for tommy
      quota))

  (get-ttl [self req]
    ttl))

(def one-per-second {:storage storage :limit (UserRateLimit. 1 1 (java.time.Duration/ofSeconds 1))})
(def one-per-minute {:storage storage :limit (UserRateLimit. 2 1 (java.time.Duration/ofMinutes 1))})


(def routes [["/" {:handler #'test}]
             ["/music" {:handler #'test-2}]
             ["/api" {:middleware []}
              ["/health" {:get {:handler #'health/check-health}}]
              ["/feed" {:get {:handler #'feed/get-feed}}]
              ["/frontpage" {:get {:handler #'feed/get-frontpage-feed}}]
              ["/hierarchy" {:get {:handler #'feed/get-heirarchy}}]
              ["/leaderboard" {:get {:handler #'get-leaderboard}}]
              ["/tag" {:get {:handler #'query-tags}
                       :post {:middleware [[wrap-rate-limit one-per-minute]]
                              :handler #'post-tag}
                       :delete {:handler #'delete-tag}}]
              ["/users" {:get {:handler #'get-users}}]
              ["/tag/exists" {:get {:handler #'tag-slug-check}}]
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

              ["/spotify" spotify/routes]
              ["/youtube" youtube/routes]
              ["/linear" linear/routes]
              ["/reddit" reddit/routes]
              ["/twitter" twitter/routes]
              ["/discord" discord/routes]

              ["/integrations" integrations/routes]
              ["/comments" comments/routes]
              ["/user_group" groups/routes]]])

(def app
  (-> (ring/ring-handler
       (ring/router routes)
       #'test)


      (wrap-exception)
      (mw/wrap-params)
      (params/wrap-params)
      (mw/wrap-format muntaja)
      (session/wrap-session)
      (wrap-resource "public")
      (wrap-content-type)))

(defn start [{:keys [port]}]
  (jetty/run-jetty #'app {:port port :join? false :host "0.0.0.0"})
  (println (str "http server running on port " port)))