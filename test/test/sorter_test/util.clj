(ns sorter-test.util
  (:require [clj-http.client :as http]
            [environ.core :refer [env]]
            [cheshire.core :as json]
            [clojure.java.shell :as shell]
            [clojure.java.io :as io]
            [clojure.string]
            [babashka.process :as p]))

(def base-url "http://localhost:8081/api")
(def static-admin-key (env :static-admin-key "STATIC_TEST_KEY_FOR_ADMIN_USER_123"))

;; Cargo process management using babashka.process
;; 
;; This manages a long-running `cargo run` process for tests:
;; - Each test gets a fresh restart with output saved to rustsorter-test-N.out
;; - Process runs in background and doesn't block test execution
;; - Automatic health checks ensure rustsorter is ready before tests
;; - Clean shutdown and cleanup of output files when tests complete
;;
;; Database management optimized for speed:
;; - Fast reset: clear tables + run migrations (no container restart)
;; - Full reset: restart container + migrations (only for initial setup)
;;
;; Usage in tests:
;; - Call (setup-test-environment) once at start of test suite (full setup)
;; - Call (between-test-cleanup-db-only) for each test (fast DB reset only)
;; - Call (between-test-cleanup) if you need cargo restart too
;; - Call (teardown-test-environment) once at end of test suite
;;
(def ^:dynamic *cargo-process* nil)
(def ^:dynamic *test-counter* (atom 0))

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

(defn get-output-file []
  "Generate output filename for current test run"
  (str "rustsorter-test-" (swap! *test-counter* inc) ".out"))

(defn start-cargo-process []
  "Start cargo run process in background with output capture"
  (let [output-file (get-output-file)
        proc (p/process {:dir "../rustsorter"
                        :out output-file
                        :err :out  ; redirect stderr to stdout
                        :env {"RUST_LOG" "debug"}}
                       "cargo" "run")]
    (println (str "Starting cargo run process, output saved to: " output-file))
    proc))

(defn stop-cargo-process [proc]
  "Stop the cargo process gracefully"
  (when proc
    (try
      (p/destroy-tree proc)
      (println "Cargo process stopped")
      (catch Exception e
        (println "Error stopping cargo process:" (.getMessage e))))))

(defn wait-for-rustsorter-health [max-attempts]
  "Wait for rustsorter to become healthy"
  (loop [attempts 0]
    (if (< attempts max-attempts)
      (let [healthy? (try
                       (let [response (make-request :get "/health")]
                         (= "healthy" (:status (:body response))))
                       (catch Exception _
                         false))]
        (if healthy?
          true
          (do
            (Thread/sleep 1000)
            (recur (inc attempts)))))
      false)))

(defn restart-cargo-process []
  "Restart the cargo process for a new test"
  (println "\n=== Restarting cargo process ===")
  (stop-cargo-process *cargo-process*)
  (Thread/sleep 2000) ; Give it time to shut down
  (alter-var-root #'*cargo-process* (constantly (start-cargo-process)))
  (if (wait-for-rustsorter-health 30)
    (println "Cargo process restarted and healthy")
    (throw (ex-info "Cargo process failed to become healthy after restart" {}))))

(defn ensure-cargo-running []
  "Ensure cargo process is running and healthy"
  (if (and *cargo-process* (p/alive? *cargo-process*))
    (if (= "healthy" (:status (:body (make-request :get "/health"))))
      (println "Cargo process already running and healthy")
      (restart-cargo-process))
    (do
      (alter-var-root #'*cargo-process* (constantly (start-cargo-process)))
      (if (wait-for-rustsorter-health 30)
        (println "Cargo process started and healthy")
        (throw (ex-info "Cargo process failed to become healthy" {}))))))

(defn run-rustsorter []
  "Ensure rustsorter is running (backwards compatibility)"
  (ensure-cargo-running))

;; Database management functions

(defn stop-postgres-container []
  "Stop the PostgreSQL container if running"
  (println "Stopping PostgreSQL container...")
  (shell/sh "docker" "stop" db-container-name)
  (shell/sh "docker" "rm" db-container-name))

(defn clear-postgres-data []
  "Remove PostgreSQL data directory"
  (println "Clearing PostgreSQL data...")
  (let [pgdata-path "../database/pgdata"]
    (when (.exists (io/file pgdata-path))
      (shell/sh "rm" "-rf" pgdata-path))))

(defn start-postgres-container []
  "Start PostgreSQL container in background"
  (println "Starting PostgreSQL container...")
  (let [result (shell/sh "bash" "../database/run-postgres.sh" :dir "../database" :env {"DETACH" "true"})]
    (when (not= 0 (:exit result))
      (println "Failed to start PostgreSQL:" (:err result))
      (throw (ex-info "Failed to start PostgreSQL container" result)))
    (Thread/sleep 3000))) ; Give PostgreSQL time to start

(defn run-migrations []
  "Run database migrations"
  (println "Running migrations...")
  (let [result (shell/sh "bash" "./migrate.sh" :dir "../rustsorter")]
    (when (not= 0 (:exit result))
      (println "Migration failed:" (:err result))
      (throw (ex-info "Migration failed" result)))
    (println "Migrations completed successfully")))

(defn clear-all-tables []
  "Clear all tables in the database (faster than container restart)"
  (println "Clearing all database tables...")
  (try
    ;; Get list of all tables
    (let [tables-result (shell/sh "docker" "exec" db-container-name 
                                 "psql" "-U" "postgres" "-d" "postgres" 
                                 "-t" "-c" 
                                 "SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
          tables (when (= 0 (:exit tables-result))
                   (->> (:out tables-result)
                        clojure.string/trim
                        clojure.string/split-lines
                        (map clojure.string/trim)
                        (remove empty?)))]
      
      ;; Drop all tables if any exist
      (when (seq tables)
        (let [drop-tables-sql (str "DROP TABLE IF EXISTS " 
                                  (clojure.string/join ", " tables) 
                                  " CASCADE")]
          (println "Dropping tables:" (clojure.string/join ", " tables))
          (let [drop-result (shell/sh "docker" "exec" db-container-name 
                                     "psql" "-U" "postgres" "-d" "postgres" 
                                     "-c" drop-tables-sql)]
            (when (not= 0 (:exit drop-result))
              (println "Failed to drop tables:" (:err drop-result))
              (throw (ex-info "Failed to drop tables" drop-result))))))
      
      (println "All tables cleared successfully"))
    (catch Exception e
      (println "Error clearing tables:" (.getMessage e))
      (throw e))))

(defn fast-database-reset []
  "Fast database reset: clear tables and run migrations (no container restart)"
  (println "\n=== Fast database reset ===")
  (try
    (clear-all-tables)
    (run-migrations)
    (println "=== Fast database reset complete ===\n")
    (catch Exception e
      (println "Fast database reset failed:" (.getMessage e))
      (throw e))))

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

;; Test lifecycle management
(defn setup-test-environment []
  "Complete test environment setup: database + cargo process"
  (println "\n=== Setting up test environment ===")
  (setup-fresh-database)
  (ensure-cargo-running)
  (println "=== Test environment ready ===\n"))

(defn setup-test-environment-fast []
  "Fast test environment setup: assumes container running, just resets DB + cargo"
  (println "\n=== Fast test environment setup ===")
  (fast-database-reset)
  (ensure-cargo-running)
  (println "=== Test environment ready (fast) ===\n"))

(defn teardown-test-environment []
  "Clean shutdown of test environment"
  (println "\n=== Tearing down test environment ===")
  (stop-cargo-process *cargo-process*)
  (stop-postgres-container)
  (println "=== Test environment torn down ===\n"))

(defn between-test-cleanup []
  "Fast cleanup between individual tests - just reset DB and restart cargo"
  (fast-database-reset)
  (restart-cargo-process))

(defn between-test-cleanup-db-only []
  "Even faster cleanup - just reset database, keep cargo running"
  (fast-database-reset))

(defn cleanup-output-files []
  "Remove all rustsorter output files"
  (let [output-files (filter #(.endsWith % ".out") 
                            (map #(.getName %) 
                                (filter #(.isFile %) 
                                       (.listFiles (io/file ".")))))]
    (doseq [file output-files]
      (when (.startsWith file "rustsorter-test-")
        (println "Removing output file:" file)
        (io/delete-file file true)))))

(defn force-cleanup-and-exit []
  "Emergency cleanup and exit - use when process won't terminate"
  (println "\n=== Force cleanup and exit ===")
  (try
    (stop-cargo-process *cargo-process*)
    (cleanup-output-files)
    (catch Exception e
      (println "Error during cleanup:" (.getMessage e))))
  (shutdown-agents)
  (System/exit 0))
