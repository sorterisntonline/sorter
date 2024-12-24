(ns app.database
  (:require [honey.sql :as sql]
            [honey.sql.helpers :as h]
            [next.jdbc :as jdbc]
            [hikari-cp.core :refer [make-datasource close-datasource]]
            [migratus.core :as migratus]))


(defn parse-jdbc [st]
  (drop 1 (re-matches
           #"postgres://(.*):(.*)@(.*):(\d*)/(.*)"
           
           st)))

(def db (let [[username password host port database]
              (-> (slurp "database/config.edn")
                  clojure.edn/read-string
                  :jdbc-url
                  parse-jdbc)
              
              cfg {:auto-commit        true
                   :read-only          false
                   :connection-timeout 30000
                   :validation-timeout 5000
                   :idle-timeout       600000
                   :max-lifetime       1800000
                   :minimum-idle       10
                   :maximum-pool-size  10
                   :pool-name          "db-pool"
                   :register-mbeans false
                   :adapter "postgresql"
                   :username username
                   :password password
                   :server-name host
                   :port-number (Integer/parseInt port)
                   :database-name database}]
          
          (make-datasource cfg)))


(def migratus-config {:store :database
                      :migration-dir "migrations/"
                      :migration-table-name "migrations"
                      :db {:datasource db}})

(comment)

(defn exec! [m]
  (with-open [conn (jdbc/get-connection {:datasource db})]
    (jdbc/execute! conn (cond (map? m)
                              (sql/format m)
                              (string? m)
                              [m]

                              (vector? m)
                              m))))
(defn delete-sorter-tag-items! []
  (exec! (-> (h/delete-from :items)
             (h/where [:= :domain_pk_namespace "sorter.tag"])))
  )
(defn delete-all-tags! []
  (exec! (-> (h/delete-from :tags)
             (h/where true))))


(defn fill-values []
  (if (= [] (exec! (-> (h/select :*)
                       (h/from :users))))
    (exec! (-> (h/insert-into :users)
               (h/values [{:user_name "---" :password_hash "---"}]))))
  
  (if (= [] (exec! (-> (h/select :*)
                       (h/from :attributes))))

    (exec! (-> (h/insert-into :attributes)
               (h/values [{:id 0
                           :title "default"
                           :description
                           "default attribute, means what upvoting means on other sites"
                           :owner
                           (:users/user_name
                            (first (exec! (-> (h/select :*)
                                              (h/from :users)))))}])))))


(defn run-migrations [] (do
                          (println "running migrations")
                          (migratus/migrate migratus-config)
                          (fill-values)))

(comment (exec! "SELECT
                column_name, 
                data_type, 
                is_nullable, 
                column_default
                FROM 
                information_schema.columns
                WHERE 
                table_name = 'comments'"))

(comment
  (exec! (sql/format (-> {:select-distinct [:user_name :owner] :from :users_in_usergroups}
                         (h/join :usergroups [:= :user_name :usergroup_id])))))
(comment
  (exec! "select * from users")
  (exec! "select count(*) from items")
  (exec! "select count(*) from votes")
  (frequencies (map :items/domain_pk_namespace (exec! {:select [:domain_pk_namespace] :from :items}))))

(defn orphan-item [itemid]
  (exec! {:delete-from :items_in_tags :where [:= :item_id itemid]}))

(comment
  (migratus/create migratus-config "discord-item-membership")
  (migratus/rollback migratus-config)
  (run-migrations))

(defn delete-attribute [id]
  (exec! {:delete-from :votes :where [:= :votes/attribute id]} )
  (exec! {:delete-from :attributes :where [:= :id id]} ))

(defn move-item-to-tag [itemid tagid]
  (exec! (-> (h/update :items_in_tags)
             (h/set {:tag_id tagid })
             (h/where [:= :item_id itemid] ))))

(defn delete-items-in-tag [tagid]
  (def items (exec! {:select :item_id :from :items_in_tags :where [:= :tag_id tagid]}))
  (exec! {:delete-from :items_in_tags :where [:= :tag_id tagid]})
  (doseq [x items]
    (exec! {:delete-from :votes :where [:= :left_item_id (:items_in_tags/item_id x)]})
    (exec! {:delete-from :votes :where [:= :right_item_id (:items_in_tags/item_id x)]})
    (exec! {:delete-from :items :where [:= :id (:items_in_tags/item_id x)]})))

(comment
  (delete-items-in-tag 9)
  (exec! {:delete-from :perms :where [:= :tag_id 9]})
  (exec! {:delete-from :tags :where [:= :id 9]} ))

(comment
  (migratus/create migratus-config "default_user_sorter")
  (migratus/migrate migratus-config)
  (migratus/rollback migratus-config)
  )


