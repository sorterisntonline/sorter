(ns app.database
  (:require [honey.sql :as sql]
            [honey.sql.helpers :as h]
            [next.jdbc :as jdbc]
            [hikari-cp.core :refer [make-datasource close-datasource]]
            [migratus.core :as migratus]))

(defn parse-jdbc [jdbc-url]
  (drop 1 (re-matches
           #"postgres://(.*):(.*)@(.*):(\d*)/(.*)"
           jdbc-url)))

(defn build-datasource []
  ;; Read DATABASE_URL *at runtime*
  (let [database-url (System/getenv "DATABASE_URL")]
    (when-not database-url
      (throw (ex-info "DATABASE_URL not set at runtime"
                      {:hint "Run with DATABASE_URL=... java -jar app.jar"})))
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

;; We create (and memoize) the datasource at runtime (the first time you need it).
(defonce datasource
  (delay (build-datasource)))

(defn db []
  "Dereferences the datasource delay, ensuring it is only built once."
  @datasource)

(defn migratus-config []
  {:store                 :database
   :migration-dir         "migrations/"
   :migration-table-name  "migrations"
   :db                    {:datasource (db)}})

(defn exec! [m]
  (with-open [conn (jdbc/get-connection (db))]
    (jdbc/execute! conn
                   (cond
                     (map? m)    (sql/format m)
                     (string? m) [m]
                     (vector? m) m))))

(defn delete-sorter-tag-items! []
  (exec! (-> (h/delete-from :items)
             (h/where [:= :domain_pk_namespace "sorter.tag"]))))

(defn delete-all-tags! []
  (exec! (-> (h/delete-from :tags)
             (h/where true))))

(defn fill-values []
  ;; Insert a default user if none exists
  (when (empty? (exec! (-> (h/select :*)
                           (h/from :users))))
    (exec! (-> (h/insert-into :users)
               (h/values [{:user_name "---" :password_hash "---"}]))))
  ;; Insert a default attribute if none exists
  (when (empty? (exec! (-> (h/select :*)
                           (h/from :attributes))))
    (exec! (-> (h/insert-into :attributes)
               (h/values [{:id          0
                           :title       "default"
                           :description "default attribute, means what upvoting means on other sites"
                           :owner       (:users/user_name
                                         (first (exec!
                                                 (-> (h/select :*)
                                                     (h/from :users)))))}])))))

(defn run-migrations []
  (println "running migrations")
  (migratus/migrate (migratus-config))
  (fill-values))

(defn orphan-item [itemid]
  (exec! {:delete-from :items_in_tags
          :where       [:= :item_id itemid]}))

(defn delete-attribute [id]
  (exec! {:delete-from :votes :where [:= :votes/attribute id]})
  (exec! {:delete-from :attributes :where [:= :id id]}))

(defn move-item-to-tag [itemid tagid]
  (exec! (-> (h/update :items_in_tags)
             (h/set {:tag_id tagid})
             (h/where [:= :item_id itemid]))))

(defn delete-items-in-tag [tagid]
  (let [items (exec! {:select :item_id
                      :from   :items_in_tags
                      :where  [:= :tag_id tagid]})]
    (exec! {:delete-from :items_in_tags :where [:= :tag_id tagid]})
    (doseq [x items]
      (exec! {:delete-from :votes :where [:= :left_item_id (:items_in_tags/item_id x)]})
      (exec! {:delete-from :votes :where [:= :right_item_id (:items_in_tags/item_id x)]})
      (exec! {:delete-from :items :where [:= :id (:items_in_tags/item_id x)]}))))

;; (migratus/create (migratus-config) "add-tag-title-namespace-constraint")

(comment
  ;; insert admin user
  (exec! {:insert-into :users :values [{:user_name "admin" :password_hash "admin"}]})
  ;; Example usage & debugging commands:
  ;; (exec! "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'comments'")
  ;; (migratus/create (migratus-config) "slug-namespace-unique")
  ;; (migratus/create (migratus-config) "grant-tokens-privileges")
  ;; 
  ;; (migratus/create (migratus-config) "add-password-reset-tokens-table")
  ;; (migratus/migrate (migratus-config))
  ;; (migratus/rollback (migratus-config))
  ;; (run-migrations)
  ;; (delete-items-in-tag 9)
  ;; (exec! {:delete-from :perms :where [:= :tag_id 9]})
  (migratus/create (migratus-config) "add-token-expiration")
  (migratus/create (migratus-config) "add-discord-id-to-users")
  ;; (exec! {:delete-from :tags :where [:= :id 9]})
  )
