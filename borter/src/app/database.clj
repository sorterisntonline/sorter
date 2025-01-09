(ns app.database
  (:require [honey.sql :as sql]
            [honey.sql.helpers :as h]
            [next.jdbc :as jdbc]
            [hikari-cp.core :refer [make-datasource close-datasource]]
            [migratus.core :as migratus]
            [clojure.string :as str]
            [clojure.edn :as edn]
            [environ.core :refer [env]])) ;; Use environ for environment variables

(defn determine-environment []
  "Determine the current environment. Defaults to 'development' if ENVIRONMENT is not set."
  (get env :environment "development"))

(defn get-database-url []
  "Determine the correct database URL based on the ENVIRONMENT variable."
  (let [env (determine-environment)]
    (if (= env "production")
      (get env :prod-database-url)
      (get env :database-url))))

(defn parse-jdbc [st]
  "Parse a JDBC URL into its components."
  (drop 1 (re-matches
           #"postgres://(.*):(.*)@(.*):(\d*)/(.*)"
           st)))

(def db (let [database-url (get-database-url)]
          (when-not database-url
            (throw (Exception. "DATABASE_URL or PROD_DATABASE_URL must be set")))
          (let [[username password host port database] (parse-jdbc database-url)
                cfg {:auto-commit        true
                     :read-only          false
                     :connection-timeout 30000
                     :validation-timeout 5000
                     :idle-timeout       600000
                     :max-lifetime       1800000
                     :minimum-idle       10
                     :maximum-pool-size  10
                     :pool-name          "db-pool"
                     :register-mbeans    false
                     :adapter            "postgresql"
                     :username           username
                     :password           password
                     :server-name        host
                     :port-number        (Integer/parseInt port)
                     :database-name      database}]
            (make-datasource cfg))))

(def migratus-config {:store :database
                      :migration-dir "migrations/"
                      :migration-table-name "migrations"
                      :db {:datasource db}})

(defn exec! [m]
  "Execute a SQL command."
  (with-open [conn (jdbc/get-connection {:datasource db})]
    (jdbc/execute! conn (cond (map? m) (sql/format m)
                              (string? m) [m]
                              (vector? m) m))))

(defn delete-sorter-tag-items! []
  "Delete items with a specific domain_pk_namespace."
  (exec! (-> (h/delete-from :items)
             (h/where [:= :domain_pk_namespace "sorter.tag"]))))

(defn delete-all-tags! []
  "Delete all tags from the database."
  (exec! (-> (h/delete-from :tags)
             (h/where true))))

(defn fill-values []
  "Fill the database with default values if empty."
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

(defn run-migrations []
  "Run database migrations and fill with default values."
  (do
    (println "running migrations")
    (migratus/migrate migratus-config)
    (fill-values)))

(defn orphan-item [itemid]
  "Delete orphaned items by item ID."
  (exec! {:delete-from :items_in_tags :where [:= :item_id itemid]}))

(defn delete-attribute [id]
  "Delete an attribute and associated votes by ID."
  (exec! {:delete-from :votes :where [:= :votes/attribute id]} )
  (exec! {:delete-from :attributes :where [:= :id id]} ))

(defn move-item-to-tag [itemid tagid]
  "Move an item to a new tag."
  (exec! (-> (h/update :items_in_tags)
             (h/set {:tag_id tagid })
             (h/where [:= :item_id itemid] ))))

(defn delete-items-in-tag [tagid]
  "Delete all items within a specific tag."
  (let [items (exec! {:select :item_id :from :items_in_tags :where [:= :tag_id tagid]})]
    (exec! {:delete-from :items_in_tags :where [:= :tag_id tagid]})
    (doseq [x items]
      (exec! {:delete-from :votes :where [:= :left_item_id (:items_in_tags/item_id x)]})
      (exec! {:delete-from :votes :where [:= :right_item_id (:items_in_tags/item_id x)]})
      (exec! {:delete-from :items :where [:= :id (:items_in_tags/item_id x)]}))))

(comment
  ;; Example queries and migrations
  (exec! "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'comments'")
  (migratus/create migratus-config "discord-item-membership")
  (migratus/migrate migratus-config)
  (migratus/rollback migratus-config)
  (run-migrations)
  (delete-items-in-tag 9)
  (exec! {:delete-from :perms :where [:= :tag_id 9]})
  (exec! {:delete-from :tags :where [:= :id 9]}))