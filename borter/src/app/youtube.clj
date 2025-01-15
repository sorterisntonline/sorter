(ns app.youtube
  (:require [hato.client :as hc]
            [clojure.data.json :as json]
            [clojure.java.io :as io]
            [ring.util.codec :as codec]
            [ring.util.response :as response]
            [app.database :as db]
            [app.permissions :as perms]
            [honey.sql.helpers :as h]
            [sluj.core :refer [sluj]]))



;; https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps#httprest_1


(def api-key (System/getenv "BORTER_YOUTUBE_API_KEY"))

(def youtube-client-id (System/getenv "BORTER_YOUTUBE_CLIENT_ID"))
(def youtube-client-secret (System/getenv "BORTER_YOUTUBE_CLIENT_SECRET"))
(def youtube-redirect-uris (System/getenv "BORTER_YOUTUBE_REDIRECT_URIS")) ;; May need to parse if multiple
(def youtube-javascript-origins (System/getenv "BORTER_YOUTUBE_JAVASCRIPT_ORIGINS")) ;; May need to parse if multiple

(def scope "https://www.googleapis.com/auth/youtube.readonly")

(defn request-channels [token]
  (-> (hc/get "https://youtube.googleapis.com/youtube/v3/videos"
              {:query-params
               {:part "snippet" :myRating "like"
                :key api-key}
               :oauth-token token})
      :body (json/read-str {:key-fn keyword})))

(defn get-hostname []
  (case (.getCanonicalHostName (java.net.InetAddress/getLocalHost))
    "localhost" "http://localhost:3000/api/youtube/callback"
    "https://sorter.isnt.online/api/youtube/callback"))



(defn code->token [code]
  (hc/post (str "https://oauth2.googleapis.com/token?"
                (codec/form-encode {:code code
                                    :client_id youtube-client-id
                                    :client_secret youtube-client-secret
                                    :redirect_uri (get-hostname)
                                    :grant_type "authorization_code"}))))
(comment
  (request-channels token)
  (def resp (code->token code)))


(defn handle-callback [r]
  (def r r)
  (def code (-> r :query-params (get "code")))
  (def resp (code->token code))
  (def token (-> resp :body (json/read-str {:key-fn keyword})))
  (comment (def videos (request-channels (:access_token token)))
           (for [[title id] (->> videos :items (map (juxt (comp :title :snippet) :id)))]
             {:items/title title
              :items/domain_pk id
              :items/domain_pk_namespace "youtube.video"}))
  
  (db/exec! (-> {:insert-into :tokens
                 :values [{:owner (-> r :session :user_name)
                           :domain_pk_namespace "youtube"
                           :access_token (:access_token token)
                           :refresh_token ""}]}
                (h/on-conflict :owner :domain_pk_namespace)
                (h/do-update-set :access_token :refresh_token)))

  
  
  (response/redirect (-> r :query-params (get "state"))))

(defn start-tracking-liked [req]
  (def req req)
  (-> req :session :user_name)
  (def token (-> (db/exec! (-> {:select :access_token
                                :from :tokens
                                :where [:and
                                        [:= :owner (-> req :session :user_name)]
                                        [:= :domain_pk_namespace "youtube"]
                                        ]
                                :limit 1}))
                 first ))
  (def existing-youtube-tag (-> (db/exec! (-> {:select :id
                                               :from :tags
                                               :where [:and [:= :owner (-> req :session :user_name)]
                                                       [:= :domain_pk_namespace "youtube.liked"]]
                                               :limit 1}))
                                first))
  (when-not existing-youtube-tag
    (def r (db/exec! (-> {:insert-into :tags
                          :values [{:owner (-> req :session :user_name)
                                    :domain_pk_namespace "youtube.liked"
                                    :title (str (-> req :session :user_name) " liked youtube videos")
                                    :slug (str (-> req :session :user_name) "-liked-youtube-videos")}]
                          :returning :* })))
    (db/exec! {:insert-into :perms
               :values (perms/public-permissions (:tags/id (first r)) )}))
  
  (def liked-tag (-> (db/exec! (-> {:select :id
                                    :from :tags
                                    :where [:and [:= :owner (-> req :session :user_name)]
                                            [:= :domain_pk_namespace "youtube.liked"]]
                                    :limit 1}))
                     first :tags/id))
  (def liked (request-channels (:tokens/access_token token)))
  (def items (db/exec! {:insert-into :items
                        :values
                        (for [[title id] (->> liked :items (map (juxt (comp :title :snippet) :id)))]
                          {:items/title title
                           :items/domain_pk id
                           :items/domain_pk_namespace "youtube.video"
                           :items/slug (sluj title)
                           :items/owner (-> req :session :user_name)
                           })
                        :returning :*
                        :on-conflict [ :domain_pk :domain_pk_namespace]
                        :do-update-set [:domain_pk]}))
  (db/exec! {:insert-into :items_in_tags
             :values (for [item items]
                       {:item_in_tags/item_id (:items/id item)
                        :item_in_tags/tag_id liked-tag})
             :on-conflict [:item_id :tag_id]
             :do-nothing true
             })
  {:status 200 :body {:liked true}})

(def routes [["/callback" {:get {:handler #'handle-callback}}]
             ["/playlist" {:post {:handler #'start-tracking-liked}}]])



