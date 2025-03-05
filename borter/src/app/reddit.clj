(ns app.reddit
  (:require [app.database :as db]
            [app.permissions :as perms]
            [hato.client :as hc]
            [honey.sql.helpers :as h]
            [sluj.core :refer [sluj]]
            [clojure.data.json :as json])
  (:import [java.util.concurrent Executors TimeUnit]))

(def client_id (System/getenv "BORTER_REDDIT_CLIENT_ID"))
(def secret (System/getenv "BORTER_REDDIT_SECRET"))
(def redir_uri "https://sorter.isnt.online/api/integrations/reddit")
(def code "XsZkyTrGtrUEKbGS1C1Zb6nIYuD-Kg")

(comment (str "https://www.reddit.com/api/v1/authorize?client_id=" client_id "&response_type=code&state=yeppers&redirect_uri=" redir_uri "&duration=permanent&scope=read")
         "https://www.reddit.com/api/v1/authorize?client_id=jPkQFOxYjEueXdlP_L28Iw&response_type=code&state=yeppers&redirect_uri=https://sorter.isnt.online/api/integrations/reddit&duration=permanent&scope=read"
         (str "https://www.reddit.com/api/v1/authorize?client_id=" client_id "&response_type=code&state=yeppers&redirect_uri=" redir_uri "&duration=permanent&scope=read")

         (def code "KbGgZuuT0rsB6VAmpzShmsGSOsrqHg")

         (def r (hc/post "https://www.reddit.com/api/v1/access_token"
                         {:form-params {:grant_type "authorization_code"
                                        :code code
                                        :redirect_uri redir_uri}
                          :basic-auth {:user client_id :pass secret}})))

(comment
  (db/exec! (-> (h/insert-into :users)
                (h/values [{:user_name "reddit"}])))
  (store-tokens (json/read-str (-> r :body)
                               {:key-fn keyword})))

(defn store-tokens [tokens]
  (db/exec! (-> {:insert-into :tokens
                 :values [{:owner "reddit"
                           :domain_pk_namespace "reddit"
                           :access_token (:access_token tokens)
                           :refresh_token (:refresh_token tokens)}]}
                (h/on-conflict :domain_pk_namespace :owner)
                (h/do-update-set {:fields [:access_token :refresh_token]}))))

(defn remove-keys
  [coll]
  (clojure.walk/postwalk (fn [x] (if (map? x) (update-keys x (comp keyword name)) x)) coll))

(defn get-tokens []
  (-> (db/exec! {:select :* :from :tokens
                 :where [:and
                         [:= :domain_pk_namespace "reddit"]
                         [:= :owner "reddit"]]})
      first remove-keys))

(defn refresh-token [refr-token]
  (-> (hc/post "https://www.reddit.com/api/v1/access_token"
               {:form-params {:grant_type "refresh_token"
                              :refresh_token refr-token}
                :basic-auth {:user client_id :pass secret}})
      :body (json/read-str {:key-fn keyword})))

(comment
  (store-tokens (refresh-token (:refresh_token (get-tokens)))))

(defn refresh-token-save []
  (println "refreshing reddit token")
  (store-tokens (refresh-token (:refresh_token (get-tokens)))))

(defn api-req [url]
  (-> {:url (str "https://oauth.reddit.com/" url)
       :headers {"Authorization" (:access_token (get-tokens))
                 "Content-type" "application/json"
                 "User-agent" "web:sorter:v0.1 (by u/hourLong_arnould)"}
       :method :get}
      hc/request
      :body (json/read-str {:key-fn keyword})))

(comment
  (api-req "r/funny/hot.json"))

(defn make-sub [subreddit]
  (db/exec! {:insert-into :perms
             :values (perms/public-permissions
                      (:tags/id (first (db/exec! (-> {:insert-into :tags
                                                      :values [{:owner "reddit"
                                                                :domain_pk_namespace "reddit.sub"
                                                                :domain_pk subreddit

                                                                :title (str "reddit r/" subreddit)
                                                                :slug (str "reddit-r-" subreddit)}]
                                                      :returning :*})))))}))
(defn handle-make-sub [req]
  (let [subreddit (-> req :params :subreddit)]
    (make-sub subreddit)
    {:status 200
     :body {:ok true}}))


(defn get-gallery-image-url [subreddit gallery]
  (-> (api-req (str "r/" subreddit "/comments/" gallery ".json"))
      first :data :children first :data :media_metadata first second :p last :u))

(comment
  (db/exec! {:delete-from :tags
             :where [:= :domain_pk_namespace "reddit.sub"]})
  (make-sub "funny"))

(defn handle-refresh [req]
  (def req req)
  (-> req :params)
  (def t (first (db/exec! {:select :* :from :tags :where [:= :id (-> req :params :tagid)]})))
  (def data (api-req (str "r/" (:tags/domain_pk t) "/hot.json")))
  (def r (db/exec! {:insert-into :items
                    :returning :*
                    :values
                    (for [c (->> data :data :children
                                 (filter (comp not :pinned :data))
                                 (filter (comp not :stickied :data)))]
                      (let [url (-> c :data :url)
                            gallery-id (second (re-find #"/gallery/(\w+)" url))]
                        {:owner "reddit"
                         :domain_pk_namespace "reddit.post"
                         :domain_pk (-> c :data :permalink)
                         :url (if gallery-id
                                (get-gallery-image-url (:tags/domain_pk t) gallery-id)
                                url)
                         :title (-> c :data :title)
                         :slug (sluj (-> c :data :title))
                         :body (str (-> c :data :selftext) "\n by u/" (-> c :data :author))}))}))
  (db/exec! {:insert-into :items_in_tags
             :values (for [iid (map :items/id r)]
                       {:item_id iid :tag_id (-> t :tags/id)})})
  {:status 200 :body {:message "ok"}})

(def routes [["/refresh" {:post {:handler handle-refresh}}]
             ["/make-sub" {:post {:handler handle-make-sub}}]])

