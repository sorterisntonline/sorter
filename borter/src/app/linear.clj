(ns app.linear
  (:require [hato.client :as hc]
            [clojure.data.json :as json]
            [clojure.java.io :as io]
            [ring.util.codec :as codec]
            [ring.util.response :as response]
            [app.database :as db]
            [app.permissions :as perms]
            [honey.sql.helpers :as h]
            [sluj.core :refer [sluj]]))

(def client-id (System/getenv "BORTER_LINEAR_CLIENT_ID"))
(def client-secret (System/getenv "BORTER_LINEAR_CLIENT_SECRET"))

(defn get-hostname []
  (case (.getCanonicalHostName (java.net.InetAddress/getLocalHost))
    "sorter.social" "https://sorter.social/api/linear/callback"
    "http://localhost:3000/api/linear/callback"))

(defn code->token [code]
  (def code code)
  (hc/post (str "https://api.linear.app/oauth/token?")
           {:headers {"Content-Type" "application/x-www-form-urlencoded"}
            :body
            (codec/form-encode {:code code
                                :redirect_uri (get-hostname)
                                :client_id client-id
                                :client_secret client-secret
                                :grant_type "authorization_code"})}))

(defn graph-ql [token query]
  (-> (hc/post "https://api.linear.app/graphql"
               {:headers {"Authorization" (str "Bearer " token)
                          "Content-Type" "application/json"}
                :body (json/write-str {:query query})})
      :body
      (json/read-str {:key-fn keyword})))

(defn get-views [req]
  (def req req)
  (def access_code (-> {:select :access_token
                        :from :tokens
                        :where [:and
                                [:= :owner (-> req :session :user_name)]
                                [:= :domain_pk_namespace "linear"]]}
                       (h/limit 1)
                       db/exec! first :tokens/access_token))
  {:status 200 :body {:views (graph-ql access_code "query {projects {nodes {name id}}}")}})

(defn handle-callback [req]
  (def req req)
  (-> req :session :user_name)
  (def token (code->token (-> req :params (get "code"))))
  (def body (-> token :body (json/read-str {:key-fn keyword})))
  
  (db/exec! (-> {:insert-into :tokens :values [{:owner (-> req :session :user_name)
                                                :domain_pk_namespace "linear"
                                                :access_token (-> body :access_token)
                                                :refresh_token ""}]}
                (h/on-conflict :owner :domain_pk_namespace)
                (h/do-update-set :access_token)))
  (response/redirect (-> req :params (get "state"))))

(defn project-sync-tag [req]
  (def req req)
  (def projectid (-> req :params :id))

  (when-not (-> req :session :user_name)
    (throw (ex-info "not logged in" {:status 403})))
  
  (when-not (-> req :params :id)
    (throw (ex-info "no project id" {:status 400})))
  
  (def access_code (-> {:select :access_token
                        :from :tokens
                        :where [:and
                                [:= :owner (-> req :session :user_name)]
                                [:= :domain_pk_namespace "linear"]]}
                       (h/limit 1)
                       db/exec! first :tokens/access_token))

  (def issues (graph-ql access_code
                        (str "query  {project(id: \"" projectid "\")
     { name issues(first: 100, filter: {state: {name: {contains: \"Todo\"}}, parent: {null: true}}) {nodes {id title description}}}}")))

  (def tag-name (str "linear " (-> issues :data :project :name ) " " (-> req :session :user_name)))
  

  (def r (-> {:insert-into :tags
              :values [{:title tag-name
                        :slug (sluj tag-name) 
                        :description "synced with linear"
                        :owner (-> req :session :user_name)
                        :domain_pk_namespace "linear.project"
                        :domain_pk projectid}]}
             (h/on-conflict :domain_pk_namespace :domain_pk)
             (h/do-update-set :title :description :owner :domain_pk_namespace :domain_pk)
             (h/returning :*)
             db/exec! first))

  (db/exec! (-> {:insert-into :perms
                 :values (perms/public-permissions (-> r :tags/id))}
                (h/on-conflict :tag_id :capability)
                (h/do-nothing)))

  (def items
    (->> (-> issues :data :project :issues :nodes)
         (map (fn [issue]
                (let [id (-> issue :id)
                      title (-> issue :title)
                      description (-> issue :description)]
                  {:title title
                   :slug (sluj title)
                   :body description
                   :owner (-> req :session :user_name)
                   :domain_pk_namespace "linear.issue"
                   :domain_pk id})))))

  (def r2 (-> {:insert-into :items
               :values items}
              (h/on-conflict :domain_pk_namespace :domain_pk)
              (h/do-update-set :title :body :owner :domain_pk_namespace :domain_pk)
              (h/returning :*)
              db/exec!))
  
  ;; so that we remove old ones
  (db/exec! (-> {:delete-from :items_in_tags
                 :where [:= :tag_id (-> r :tags/id)]}))
  
  (db/exec! (-> {:insert-into :items_in_tags
                 :values (map (fn [item] {:item_id (-> item :items/id)
                                          :tag_id (-> r :tags/id)}) r2)}
                (h/on-conflict)
                (h/do-nothing)))

  {:status 200 :body {:message "ok"}})

(def routes [["/callback" {:get {:no-doc false
                                 :handler handle-callback}}]
             ["/views" {:get {:no-doc false
                              :handler get-views}
                        :post {:no-doc false
                               :handler project-sync-tag}}]])
