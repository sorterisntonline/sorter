(ns app.comments
  (:require [app.database :as db]
            [app.permissions :as perms]
            [honey.sql.helpers :as h]))

(defn get-comments [req]
  "TODO permissions"
  
  {:status 200 :body
   (let [[table number] (-> req :params (get "coord") (clojure.string/split #":"))]
     (db/exec! {:select :* :from :comments :where [:and
                                                   [:= :pk (Integer/parseInt number)]
                                                   [:= :pk_namespace table]]}))})

(defn post-comment [req]
  (def req req)
  (let [[table number] (clojure.string/split (-> req :params :coord) #":")]
    {:status 200 :body {:done (db/exec! {:insert-into :comments
                                         :values [{:owner (-> req :session :user_name)
                                                   :pk_namespace table
                                                   :pk (Integer/parseInt number)
                                                   :parent_id (-> req :params :parent_id)
                                                   :mirror_id nil
                                                   :body (-> req :params :body)}]})}}))

(defn delete-comment [req]
  (def req req)
  (-> req :params :id)
  (when-not (= (-> req :session :user_name)
               (-> {:select [:owner] :from :comments :where [:= :id (-> req :params :id)] }
                   db/exec! first :comments/owner))
    (throw (ex-info "must own comment to delete it" {:status 401 })))
  
  {:status 200 :body (db/exec! {:delete-from :comments :where [:= :id (-> req :params :id)]})})

(def routes [["" {:get {:handler #'get-comments}
                  :post {:handler #'post-comment}
                  :delete {:handler #'delete-comment}}]])
