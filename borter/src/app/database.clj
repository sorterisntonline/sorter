(ns app.database
  (:require [honey.sql :as sql]
            [honey.sql.helpers :as h]
            [next.jdbc :as jdbc]
            [hikari-cp.core :refer [make-datasource close-datasource]]
            [migratus.core :as migratus]
            [clojure.tools.logging :as log]))

;; Track database state for resilient operation
(defonce db-state (atom {:healthy false
                         :last-error nil
                         :datasource nil
                         :init-attempted false}))

(defn parse-jdbc [jdbc-url]
  (try
    (drop 1 (re-matches
             #"postgres://(.*):(.*)@(.*):(\d*)/(.*)"
             jdbc-url))
    (catch Exception e
      (log/error "Failed to parse JDBC URL:" (.getMessage e))
      nil)))

(defn build-datasource []
  ;; Read DATABASE_URL *at runtime*
  (try
    (swap! db-state assoc :init-attempted true)
    (let [database-url (System/getenv "DATABASE_URL")]
      (when-not database-url
        (swap! db-state assoc :last-error "DATABASE_URL not set")
        (log/error "DATABASE_URL not set at runtime")
        (throw (ex-info "DATABASE_URL not set at runtime"
                        {:hint "Run with DATABASE_URL=... java -jar app.jar"})))
      (let [parsed (parse-jdbc database-url)]
        (if (not parsed)
          (do
            (swap! db-state assoc :last-error "Invalid DATABASE_URL format")
            nil)
          (let [[username password host port database] parsed
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
            (try
              (log/info "Attempting to create database connection pool")
              (make-datasource cfg)
              (catch Exception e
                (let [error-msg (str "Failed to initialize database pool: " (.getMessage e))]
                  (log/error error-msg)
                  (swap! db-state assoc :last-error error-msg)
                  nil)))))))
    (catch Exception e
      (let [error-msg (str "Error creating datasource: " (.getMessage e))]
        (log/error error-msg)
        (swap! db-state assoc :last-error error-msg)
        nil))))

(defn db []
  "Returns the datasource, may return nil if database is not available"
  (if (:datasource @db-state)
    (:datasource @db-state)
    (let [ds (build-datasource)]
      (when ds 
        (log/info "Database connection pool created successfully")
        (swap! db-state assoc :datasource ds)
        (try
          (with-open [conn (jdbc/get-connection ds)]
            (jdbc/execute! conn ["SELECT 1"])
            (swap! db-state assoc :healthy true :last-error nil)
            (log/info "Database connection verified successfully"))
          (catch Exception e
            (let [error-msg (str "Database connection test failed: " (.getMessage e))]
              (log/error error-msg)
              (swap! db-state assoc :healthy false :last-error error-msg)))))
      ds)))

(defn check-db-health []
  "Checks if database is healthy, returns true/false without throwing exceptions"
  (try
    (if-let [ds (:datasource @db-state)]
      (try
        (with-open [conn (jdbc/get-connection ds)]
          (jdbc/execute! conn ["SELECT 1"])
          (swap! db-state assoc :healthy true :last-error nil)
          true)
        (catch Exception e
          (let [error-msg (str "Database health check failed: " (.getMessage e))]
            (log/error error-msg)
            (swap! db-state assoc :healthy false :last-error error-msg)
            false)))
      (do
        ;; Only try to initialize if we haven't done so already
        (when (not (:init-attempted @db-state))
          (db))
        false))
    (catch Throwable e
      (log/error "Critical error in database health check:" (.getMessage e))
      (swap! db-state assoc :healthy false :last-error (.getMessage e))
      false)))

(defn get-db-status []
  "Returns detailed database status information"
  {:healthy (:healthy @db-state)
   :error (:last-error @db-state)
   :datasource-initialized (not (nil? (:datasource @db-state)))
   :init-attempted (:init-attempted @db-state)})

;; Safe version that won't throw exceptions
(defn migratus-config []
  (try
    {:store                 :database
     :migration-dir         "migrations/"
     :migration-table-name  "migrations"
     :db                    {:datasource (db)}}
    (catch Throwable e
      (log/error "Failed to create migratus config:" (.getMessage e))
      nil)))

(defn exec! [m]
  (try
    (if-let [datasource (db)]
      (try 
        (with-open [conn (jdbc/get-connection datasource)]
          (jdbc/execute! conn
                        (cond
                          (map? m)    (sql/format m)
                          (string? m) [m]
                          (vector? m) m)))
        (catch org.postgresql.util.PSQLException e
          (log/error "Database query failed:" (.getMessage e))
          (swap! db-state assoc :healthy false :last-error (.getMessage e))
          (throw (ex-info "Database operation failed"
                        {:type :database-error
                          :status 503
                          :message "Database operation failed"
                          :details (.getMessage e)})))
        (catch Exception e
          (log/error "Unexpected database error:" (.getMessage e))
          (swap! db-state assoc :healthy false :last-error (.getMessage e))
          (throw (ex-info "Unexpected database error"
                        {:type :database-error
                          :status 500 
                          :message "Internal database error"
                          :details (.getMessage e)}))))
      (do
        (log/error "Cannot execute query - database connection not available")
        ;; Return empty vector for select queries instead of throwing
        (if (and (map? m) 
                (or (contains? m :select) 
                    (and (map? (:stmt m)) (contains? (:stmt m) :select))))
          [] ; Return empty result for select
          (throw (ex-info "Database connection not available"
                        {:type :database-error
                         :status 503
                         :message "Database connection not available"
                         :details (:last-error @db-state)})))))
    (catch Throwable e
      ;; Completely unexpected exceptions
      (if (instance? clojure.lang.ExceptionInfo e)
        (throw e) ; Pass through our own ex-info
        (do
          (log/error "Critical database error:" (.getMessage e))
          (throw (ex-info "Critical database error"
                        {:type :database-error
                          :status 500
                          :message "Critical database error"
                          :details (.getMessage e)})))))))

(defn delete-sorter-tag-items! []
  (exec! (-> (h/delete-from :items)
             (h/where [:= :domain_pk_namespace "sorter.tag"]))))

(defn delete-all-tags! []
  (exec! (-> (h/delete-from :tags)
             (h/where true))))

(defn fill-values []
  (try
    ;; Insert a default user if none exists
    (try
      (when (empty? (exec! (-> (h/select :*)
                               (h/from :users))))
        (exec! (-> (h/insert-into :users)
                   (h/values [{:user_name "---" :password_hash "---"}]))))
      (catch Exception e
        (log/error "Failed to initialize default user:" (.getMessage e))))
    
    ;; Insert a default attribute if none exists
    (try
      (when (empty? (exec! (-> (h/select :*)
                               (h/from :attributes))))
        (exec! (-> (h/insert-into :attributes)
                   (h/values [{:id          0
                               :title       "default"
                               :description "default attribute, means what upvoting means on other sites"
                               :owner       (try 
                                             (:users/user_name
                                              (first (exec!
                                                      (-> (h/select :*)
                                                          (h/from :users)))))
                                             (catch Exception _ "---"))}]))))
      (catch Exception e
        (log/error "Failed to initialize default attribute:" (.getMessage e))))
    (catch Throwable e
      (log/error "Critical error during fill-values:" (.getMessage e)))))

(defn run-migrations []
  (try
    (println "running migrations")
    (if-let [config (migratus-config)]
      (try
        (migratus/migrate config)
        (fill-values)
        (catch Exception e
          (log/error "Failed to run migrations:" (.getMessage e))))
      (log/error "Cannot run migrations - database not available"))
    (catch Throwable e
      (log/error "Critical error in run-migrations:" (.getMessage e)))))

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
  (migratus/create (migratus-config) "add-api-key-table")
  (migratus/create (migratus-config) "ns-to-namespace-in-tag-table") ;; do this one later! 
  (migratus/create (migratus-config) "remove-item-title-check-gt-1")
  (migratus/create (migratus-config) "update-users-for-auth0"))
  ;; (exec! {:delete-from :tags :where [:= :id 9]})
  

