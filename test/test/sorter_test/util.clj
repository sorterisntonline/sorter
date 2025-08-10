(ns sorter-test.util
  (:require [clj-http.client :as http]
            [environ.core :refer [env]]
            [cheshire.core :as json]
            [clojure.java.shell :as shell]
            [clojure.java.io :as io]
            [clojure.string]))

(def base-url "http://localhost:8081/api")
(def static-admin-key (env :static-admin-key "STATIC_TEST_KEY_FOR_ADMIN_USER_123"))

;; Database management utilities
(def db-container-name "postgres-dev")

(defn make-request
  [method endpoint & {:keys [is-authenticated? body headers params]}]
  (let [base-opts {:content-type :json
                   :throw-exceptions false
                   :body (when body (json/encode body))
                   :query-params params}
        auth-headers (when is-authenticated?
                       {"Authorization" (str "Bearer " static-admin-key)})
        all-headers (merge auth-headers headers)
        opts (if (seq all-headers)
               (assoc base-opts :headers all-headers)
               base-opts)
        response (http/request (assoc opts :method method :url (str base-url endpoint)))]
    ;; Parse JSON response body manually
    (if (and (:body response) (not= "" (:body response)))
      (try
        (assoc response :body (json/parse-string (:body response) true))
        (catch Exception _
          response)) ; Return original response if JSON parsing fails
      response)))

;; Database management functions

(defn stop-postgres-container []
  "Stop the PostgreSQL container if running"
  (println "Stopping PostgreSQL container...")
  (shell/sh "docker" "stop" db-container-name)
  (shell/sh "docker" "rm" db-container-name))

(defn clear-postgres-data []
  "Remove PostgreSQL data directory"
  (println "Clearing PostgreSQL data...")
  (let [pgdata-path "database/pgdata"]
    (when (.exists (io/file pgdata-path))
      (shell/sh "rm" "-rf" pgdata-path))))

(defn start-postgres-container []
  "Start PostgreSQL container in background"
  (println "Starting PostgreSQL container...")
  (let [result (shell/sh "bash" "database/run-postgres.sh" :dir "." :env {"DETACH" "true"})]
    (when (not= 0 (:exit result))
      (println "Failed to start PostgreSQL:" (:err result))
      (throw (ex-info "Failed to start PostgreSQL container" result)))
    (Thread/sleep 3000))) ; Give PostgreSQL time to start

(defn run-migrations []
  "Run database migrations"
  (println "Running migrations...")
  (let [result (shell/sh "bash" "rustsorter/migrate.sh" :dir ".")]
    (when (not= 0 (:exit result))
      (println "Migration failed:" (:err result))
      (throw (ex-info "Migration failed" result)))
    (println "Migrations completed successfully")))

(defn wait-for-postgres []
  "Wait for PostgreSQL to be ready"
  (println "Waiting for PostgreSQL to be ready...")
  (loop [attempts 0]
    (if (< attempts 30) ; Wait up to 30 seconds
      (let [result (shell/sh "docker" "exec" db-container-name "pg_isready" "-U" "postgres")]
        (if (= 0 (:exit result))
          (println "PostgreSQL is ready!")
          (do
            (Thread/sleep 1000)
            (recur (inc attempts)))))
      (throw (ex-info "PostgreSQL failed to start within 30 seconds" {})))))

(defn setup-fresh-database []
  "Complete database setup: stop container, clear data, start container, wait for ready, run migrations"
  (println "\n=== Setting up fresh database ===")
  (try
    (stop-postgres-container)
    (clear-postgres-data)
    (start-postgres-container)
    (wait-for-postgres)
    (run-migrations)
    (println "=== Fresh database setup complete ===\n")
    (catch Exception e
      (println "Database setup failed:" (.getMessage e))
      (throw e))))

(defn query-database 
  "Execute a SQL query against the test database"
  [query & params]
  (let [result (shell/sh "docker" "exec" db-container-name 
                         "psql" "-U" "postgres" "-d" "postgres" 
                         "-c" query 
                         "-t" "-A" "-F," ; tuples only, no alignment, comma separator
                         :in (when (seq params) (clojure.string/join " " params)))]
    (when (not= 0 (:exit result))
      (throw (ex-info "Database query failed" {:query query :error (:err result)})))
    (-> (:out result)
        clojure.string/trim
        (clojure.string/split #"\n")
        (->> (remove empty?)))))

(defn count-entities 
  "Count entities in the database by namespace"
  [namespace]
  (let [results (query-database (str "SELECT COUNT(*) FROM entities WHERE ns = '" namespace "'"))]
    (Integer/parseInt (first results))))

(defn list-entities 
  "List entities in the database by namespace"
  [namespace]
  (query-database (str "SELECT pk FROM entities WHERE ns = '" namespace "' ORDER BY pk")))
