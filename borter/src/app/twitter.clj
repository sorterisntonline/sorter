(ns app.twitter
  (:require [app.database :as db]
            [app.permissions :as perms]
            [honey.sql.helpers :as h]
            [hato.client :as hc]
            [clojure.data.json :as json]
            [ring.util.response :as response]
            [app.login :as login]
            [borkdude.deflet :refer [deflet]]
            [ring.middleware.ratelimit :as rl])
  (:import
   [java.net URLEncoder]))

(def key (System/getenv "BORTER_TWITTER_KEY"))
(def key-secret (System/getenv "BORTER_TWITTER_KEY_SECRET"))
(def bearer-token (System/getenv "BORTER_TWITTER_BEARER_TOKEN"))

(def oauth-clientid (System/getenv "BORTER_TWITTER_OAUTH_CLIENTID"))
(def oauth-clientsecret (System/getenv "BORTER_TWITTER_OAUTH_CLIENTSECRET"))



(comment
  (hc/get "https://api.twitter.com/2/tweets/thmorriss/liked_tweets"
          {:headers {"Authorization" (str "Bearer " bearer-token)}
           :as :json} ))

(defn step-zero [req]
  
  (def resp (hc/post "https://api.twitter.com/2/oauth2/token"
                     {:form-params {:oauth_callback "https://localhost:3000/api/twitter/callback"
                                    :oauth_consumer_key key
                                    }}))
  {:status 200 :body "Step One" :headers {"Content-type" "text/html"}})

(defn urlencode-params [params]
  (clojure.string/join "&" (map (fn [[k v]] (str (name k) "=" v)) params)))

(defn get-hostname []
  (case (.getCanonicalHostName (java.net.InetAddress/getLocalHost))
    "sorter.isnt.online" "https://sorter.isnt.online/api/twitter/callback"
    "http://localhost:3000/api/twitter/callback"))

(defn encode-b64 [s]
  (.encodeToString (java.util.Base64/getEncoder) (.getBytes s)))

(defn basic-string []
  (str "Basic " (encode-b64 (str oauth-clientid ":" oauth-clientsecret))))

(defn api-callback [req]
  (println "api-callback")
  (def req req)
  (def code (-> req :params (get "code")))
  (def resp (hc/post "https://api.twitter.com/2/oauth2/token"
                     {:body (urlencode-params {:code code
                                               :grant_type "authorization_code"
                                               :code_verifier "challenge"
                                               :client_id oauth-clientid
                                               :redirect_uri (get-hostname) } )
                      :headers {"Content-type" "application/x-www-form-urlencoded"
                                "Authorization" (basic-string)}}))
  (def token (-> resp :body (json/read-str :key-fn keyword) :access_token))
  (def userid (-> (hc/get "https://api.twitter.com/2/users/me"
                          {:headers {"Authorization" (str "Bearer " token)}
                           :as :json})
                  :body (json/read-str :key-fn keyword) :data))
  ;; if logged in, link account, if not logged in, bring to login screen
  

  (def user_name (or
                  (-> {:select :user_name :from :linked_accounts :where [:and
                                                                         [:= :platform "x"]
                                                                         [:= :platform_user_id (:id userid)]]}
                      db/exec! first :linked_accounts/user_name)
                  (-> req :session :user_name)
                  (-> {:insert-into :users :values [{:user_name (str "x/" (:username userid))}] :returning :*}
                      db/exec! first :users/user_name)))
  
  (db/exec! (-> {:insert-into :linked_accounts
                 :values [{:user_name user_name
                           :platform "x"
                           :platform_user_id (:id userid)
                           :access_token token}]}
                (h/on-conflict :platform :platform_user_id)
                (h/do-update-set {:access_token token})) )
  
  (assoc (response/redirect "/x") :session {:user_name user_name}))

(defn request-liked [userid token]
  (-> (hc/get (str "https://api.twitter.com/2/users/" userid "/liked_tweets?user.fields=profile_image_url,username&expansions=author_id")
              
              {:headers {"Authorization" (str "Bearer " token)}
               :as :json})
      :body (json/read-str :key-fn keyword)))

(defn get-liked [req]
  (when-not (-> req :session :user_name)
    (throw (ex-info "not logged in" {})))
  
  (def req req)
  (def token (-> {:select [:access_token] :from :linked_accounts
                  :where [:= :user_name (-> req :session :user_name)]}
                 db/exec! first :linked_accounts/access_token))
  (def userid (-> (hc/get "https://api.twitter.com/2/users/me"
                          {:headers {"Authorization" (str "Bearer " token)}
                           :as :json})
                  :body (json/read-str :key-fn keyword) :data :id))
  (def liked (request-liked userid token))
  {:status 200 :body liked})

(import java.time.LocalDate)

(defn get-current-month-year []
  (let [now (LocalDate/now)]
    {:month (.getMonthValue now)
     :year (.getYear now)}))

(defn get-or-create-tag [slug]
  (db/exec! {:insert-into :users :values [{:user_name "---"}]
             :on-conflict [:user_name] :do-nothing true})
  (or (first (db/exec! {:select :* :from :tags :where [:= :slug slug]}))
      
      (let [t (first (db/exec! {:insert-into :tags
                                :values [{:title slug :slug slug :owner "---"}]
                                :returning :*}))]
        (db/exec! {:insert-into :perms
                   :values (perms/public-permissions (:tags/id t))})
        t)))

(defn tag-info-request [r]
  (def r r)
  (println "tag-info-request")
  {:status 200 :body (:body (hc/request {:as :json
                                         :url (str "http://localhost:8081/api/tag/page?"
                                                   (urlencode-params (cond-> (-> r :params)
                                                                       (-> r :session :user_name) (assoc "user_name" (-> r :session :user_name)))))
                                         :method :get}))
   :headers {"Content-Type" "application/json"}})

(defn get-tag [req]
  (deflet
    (def time (get-current-month-year))
    (def tag-slug (str "x-" (:month time) "-" (:year time)))
    (def tag (get-or-create-tag tag-slug))
    
    (def other-tags (conj (->> "select * from tags where slug like 'x-%'" db/exec!)
                          (get-or-create-tag "all-xeets")))

    {:status 200
     :body {:tag (-> req
                     (assoc :params {"id" (str (:tags/id tag))})
                     tag-info-request
                     :body (json/read-str {:key-fn keyword}))
            :other_tags other-tags}}))


(defn import [req]
  (def req req)
  (deflet
    (def time (get-current-month-year))
    (def tag-slug (str "x-" (:month time) "-" (:year time)))
    (def tag (get-or-create-tag tag-slug) )
    (def items (db/exec! {:insert-into :items
                          :values (for [tweet (-> req :params :tweets)]
                                    {:owner (-> req :session :user_name)
                                     :domain_pk_namespace "x.xeet"
                                     :domain_pk (:id tweet)
                                     :title (str "@" (:username (:author tweet)))
                                     :slug (:username (:author tweet))
                                     :url (str "https://x.com/" (:username (:author tweet)) "/status/" (:id tweet))
                                     })
                          :returning :*
                          :on-conflict [:domain_pk_namespace :domain_pk]
                          :do-nothing true}))
    (def item-ids (map :items/id items))
    (when (not-empty item-ids) (db/exec! {:insert-into :items_in_tags :values
                                          (for [id item-ids]
                                            {:item_id id :tag_id (:tags/id tag)})}))
    (def tag-all (get-or-create-tag "all-xeets"))
    (when (not-empty item-ids) (db/exec! {:insert-into :items_in_tags :values
                                          (for [id item-ids]
                                            {:item_id id :tag_id (:tags/id tag-all)})}))
    {:status 200 :body {:imported "ok"}}))

  

(comment
  (db/exec! {:delete-from :tags :where [:= :slug tag-slug]} )
  (db/exec! {:delete-from :tags :where [:= :slug "all-xeets"]} ))

(comment
  (db/exec! {:delete-from :linked_accounts :where [:= :user_name "thmorriss"]})
  (db/exec! {:delete-from :users :where [:= :user_name "thmorriss"]})
  (db/exec! {:delete-from :linked_accounts :where [:= :user_name "x/thmorriss"]})
  (db/exec! {:delete-from :users :where [:= :user_name "x/thmorriss"]}))

(def routes [["/step/0" {:get {:handler #'step-zero}}]
             ["/callback" {:get {:handler #'api-callback}}]
             (or ["/liked" {:get {:handler (rl/wrap-ratelimit #'get-liked
                                                              {:limits [(rl/ip-limit 3)]})}}]
                 ["/liked" {:get {:handler #'get-liked}}])
             ["/page" {:get {:handler #'get-tag}}]
             ["/import" {:post {:handler #'import}}]])

