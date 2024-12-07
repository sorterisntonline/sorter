(ns app.groups
  (:require [app.database :as db]
            [app.login :as login]
            [honey.sql.helpers :as h]))

{:group_name "arst", :users ["test" "poggies" "zomg"]}

(defn post-group [req]
  (def req req)
  (when-not (-> req :session :user_name)
    (throw (ex-info "not logged in" {})))

  (when-not (login/validate-username (-> req :body-params :group_name))
    (throw (ex-info "invalid group name" {})))

  (def existing (first (db/exec! {:select :*
                                  :from :usergroups
                                  :where [:= :user_name (-> req :body-params :group_name)]})))

  (if (= (:usergroups/owner existing) (-> req :session :user_name))
    (do
      (db/exec! {:delete-from :users_in_usergroups
                 :where [:= :usergroup_id (:usergroups/user_name existing)]})
      (db/exec! {:insert-into :users_in_usergroups
                 :values (for [user (-> req :body-params :users)]
                           {:usergroup_id (-> req :body-params :group_name)
                            :user_id user})}))
    (do
      

      (db/exec! {:insert-into :users
                 :values [{:user_name (-> req :body-params :group_name)}]})
      (db/exec! {:insert-into :usergroups
                 :values [{:user_name (-> req :body-params :group_name)
                           :owner (-> req :session :user_name)}]})
      (db/exec! {:insert-into :users_in_usergroups
                 :values (for [user (-> req :body-params :users)]
                           {:usergroup_id (-> req :body-params :group_name)
                            :user_id user})})))
  {:status 200 :body {:ok true}})

(defn get-groups [req]
  (when-not (-> req :session :user_name)
    (throw (ex-info "not logged in" {})))
  
  {:status 200 :body (for [group (db/exec! {:select :*
                                            :from :usergroups
                                            :where [:= :owner (-> req :session :user_name)]})]
                       (let [users (db/exec! {:select :user_id
                                              :from :users_in_usergroups
                                              :where [:= :usergroup_id (:usergroups/user_name group)]})]
                         (assoc group :users users)))})

(defn get-my-groups [req]
  (when-not (-> req :session :user_name)
    (throw (ex-info "not logged in" {})))
  
  {:status 200 :body (db/exec! {:select :*
                                :from :users_in_usergroups
                                :where [:= :user_id (-> req :session :user_name)]})})

(defn delete-group [req]
  (def req req)
  (when-not (-> req :session :user_name)
    (throw (ex-info "not logged in" {})))

  (def group (first (db/exec! {:select :*
                               :from :usergroups
                               :where [:and
                                       [:= :owner (-> req :session :user_name)]
                                       [:= :user_name (-> req :body-params :group_name)]]})))
  (when-not group
    (throw (ex-info "group not found" {})))

  (db/exec! {:delete-from :usergroups
             :where [:= :user_name (-> req :body-params :group_name)]})

  (db/exec! {:delete-from :users_in_usergroups
             :where [:= :usergroup_id (:usergroups/user_name group)]})
  
  (db/exec! {:delete-from :users
             :where [:= :user_name (:usergroups/user_name group)]})
  
  {:status 200 :body {:ok true}})


(def routes [["" {:get {:handler #'get-groups}
                  :post {:handler #'post-group}
                  :delete {:handler #'delete-group}}]
             ["/me" {:get {:handler #'get-my-groups}}]])
