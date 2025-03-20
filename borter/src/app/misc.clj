(ns app.misc
  (:require [app.database :as db]
            [honey.sql.helpers :as h]
            [app.schemas :refer :all]))

(defn get-leaderboard [req]
  {:status 200 :body (db/exec! (-> {:select [:users/user_name [[:count :votes/*]]] :from :users}
                                   (h/group-by :users/user_name)
                                   (h/join :votes [:= :votes/owner :users/user_name])))})


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