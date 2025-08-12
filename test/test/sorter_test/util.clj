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

;; ============================================================================
;; SORTER TEST ENVIRONMENT MANAGEMENT
;; ============================================================================
;;
;; This module manages the complete test environment for the Sorter project,
;; including PostgreSQL database and Rust cargo process lifecycle.
;;
;; ARCHITECTURE:
;; - PostgreSQL runs in Docker container (postgres-dev)
;; - Rust server runs via `cargo run` in background with health monitoring
;; - Tests use WebSocket connections to interact with the server
;;
;; LIFECYCLE:
;; 1. Suite Setup (once): smart-database-setup + start cargo process
;; 2. Between Tests: fast DB reset (clear tables + migrate) + keep cargo running
;; 3. Suite Teardown (once): stop cargo + stop container
;;
;; DATABASE MANAGEMENT:
;; - Smart Setup: detects if container exists and chooses fast vs fresh setup
;; - Fast Reset: clear all tables + run migrations (no container restart) 
;; - Fresh Setup: stop container + clear data + start container + migrate
;; - All functions handle edge cases (missing containers, failed connections)
;;
;; CARGO PROCESS MANAGEMENT:
;; - Long-running background process with output capture (rustsorter-test-N.out)
;; - Health checks with automatic restart if process dies
;; - Optimized to avoid unnecessary restarts between tests
;;
;; USAGE IN TESTS:
;; 1. kaocha calls (setup-test-environment) automatically at suite start
;; 2. Each test calls (between-test-cleanup-db-only) for fast reset
;; 3. kaocha calls (teardown-test-environment) automatically at suite end
;;
;; RUNNING TESTS:
;; From test/ directory:
;; - ./run.sh                           # Run all tests
;; - ./run.sh sorter-test.core          # Run specific namespace  
;; - ./run.sh sorter-test.core websocket-hello-world  # Run specific test
;;
;; FIRST TIME SETUP:
;; No special setup needed! The smart-database-setup function will:
;; - Detect if PostgreSQL container exists
;; - Create fresh container if needed
;; - Handle all Docker and migration setup automatically
;;
;; TROUBLESHOOTING:
;; - If tests hang: Check rustsorter-test-N.out files for cargo errors
;; - If DB connection fails: Container might be stopped, restart will be automatic
;; - If cargo won't start: Check that rustsorter/ directory has valid Cargo.toml
;; - For manual cleanup: (force-cleanup-and-exit) stops everything and exits
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
        current-env (into {} (System/getenv))
        test-env (merge current-env {"RUST_LOG" "debug"})
        proc (p/process {:dir "../rustsorter"
                        :out output-file
                        :err :out  ; redirect stderr to stdout
                        :env test-env}
                       "cargo" "run")]
    (println (str "Starting cargo run process, output saved to: " output-file))
    proc))

(defn kill-processes-on-port [port]
  "Force kill any processes using the specified port"
  (try
    (let [lsof-result (shell/sh "lsof" "-ti" (str ":" port))]
      (when (= 0 (:exit lsof-result))
        (let [pids (clojure.string/split (clojure.string/trim (:out lsof-result)) #"\n")]
          (doseq [pid pids]
            (when-not (empty? pid)
              (println (str "Killing process " pid " on port " port))
              (shell/sh "kill" "-9" pid))))))
    (catch Exception e
      (println "Error killing processes on port" port ":" (.getMessage e)))))

(defn stop-cargo-process [proc]
  "Stop the cargo process gracefully"
  (when proc
    (try
      (p/destroy-tree proc)
      (println "Cargo process stopped")
      (catch Exception e
        (println "Error stopping cargo process:" (.getMessage e)))))
  ;; Force kill any remaining processes on port 8081
  (kill-processes-on-port 8081))

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
  ;; First, kill any stray processes on port 8081
  (kill-processes-on-port 8081)
  (Thread/sleep 1000) ; Give the port time to free up
  
  (if (and *cargo-process* (p/alive? *cargo-process*))
    (try
      (if (= "healthy" (:status (:body (make-request :get "/health"))))
        (println "Cargo process already running and healthy")
        (restart-cargo-process))
      (catch Exception e
        (println "Health check failed, restarting cargo process:" (.getMessage e))
        (restart-cargo-process)))
    (do
      (println "Starting new cargo process...")
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
  ;; Check if container exists before stopping
  (let [check-result (shell/sh "docker" "ps" "-a" "--filter" (str "name=" db-container-name) "--format" "{{.Names}}")]
    (when (clojure.string/includes? (:out check-result) db-container-name)
      (println (str "Container " db-container-name " found, stopping..."))
      (shell/sh "docker" "stop" db-container-name)
      (shell/sh "docker" "rm" db-container-name))
    (println "PostgreSQL container cleanup complete")))

(defn clear-postgres-data []
  "Remove PostgreSQL data directory"
  (println "Clearing PostgreSQL data...")
  (let [pgdata-path "../database/pgdata"]
    (when (.exists (io/file pgdata-path))
      (shell/sh "rm" "-rf" pgdata-path))))

(defn start-postgres-container []
  "Start PostgreSQL container in background"
  (println "Starting PostgreSQL container...")
  ;; Check if container is already running
  (let [check-result (shell/sh "docker" "ps" "--filter" (str "name=" db-container-name) "--format" "{{.Names}}")]
    (if (clojure.string/includes? (:out check-result) db-container-name)
      (println "PostgreSQL container already running")
      (let [result (shell/sh "bash" "run-postgres.sh" :dir "../database" :env {"DETACH" "true"})]
        (when (not= 0 (:exit result))
          (println "Failed to start PostgreSQL:" (:err result))
          (throw (ex-info "Failed to start PostgreSQL container" result)))
        (Thread/sleep 3000))))) ; Give PostgreSQL time to start

(defn run-migrations []
  "Run database migrations"
  (println "Running migrations...")
  (let [result (shell/sh "bash" "./migrate.sh" :dir "../rustsorter")]
    (when (not= 0 (:exit result))
      (println "Migration failed:" (:err result))
      (throw (ex-info "Migration failed" result)))
    (println "Migrations completed successfully")))

(defn clear-all-tables []
  "Clear DB fast by dropping and recreating the public schema."
  (println "Resetting database schema (DROP SCHEMA public CASCADE; CREATE SCHEMA public;)...")
  (try
    ;; Ensure container is running
    (let [container-check (shell/sh "docker" "ps" "--filter" (str "name=" db-container-name) "--format" "{{.Names}}")]
      (when-not (clojure.string/includes? (:out container-check) db-container-name)
        (throw (ex-info "PostgreSQL container not running" {}))))
    ;; Drop and recreate schema in a single psql call
    (let [reset-sql "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"
          reset-result (shell/sh "docker" "exec" db-container-name
                                 "psql" "-U" "postgres" "-d" "postgres"
                                 "-v" "ON_ERROR_STOP=1" "-c" reset-sql)]
      (when (not= 0 (:exit reset-result))
        (println "Failed to reset schema:" (:err reset-result))
        (throw (ex-info "Failed to reset schema" reset-result)))
      (println "Database schema reset successfully"))
    (catch Exception e
      (println "Error during schema reset:" (.getMessage e))
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

(defn smart-database-setup []
  "Smart database setup: detect current state and set up accordingly"
  (println "\n=== Smart database setup ===")
  (try
    ;; Check if container is already running
    (let [container-check (shell/sh "docker" "ps" "--filter" (str "name=" db-container-name) "--format" "{{.Names}}")]
      (if (clojure.string/includes? (:out container-check) db-container-name)
        (do
          (println "PostgreSQL container already running, doing fast reset...")
          (fast-database-reset))
        (do
          (println "No PostgreSQL container found, doing fresh setup...")
          (setup-fresh-database))))
    (println "=== Smart database setup complete ===\n")
    (catch Exception e
      (println "Smart database setup failed, falling back to fresh setup:" (.getMessage e))
      (try
        (setup-fresh-database)
        (catch Exception e2
          (println "Fresh database setup also failed:" (.getMessage e2))
          (throw e2))))))

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
  (smart-database-setup)
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
  ;; Check if we need to do initial setup (handles single test runs)
  (let [container-check (shell/sh "docker" "ps" "--filter" (str "name=" db-container-name) "--format" "{{.Names}}")]
    (if-not (clojure.string/includes? (:out container-check) db-container-name)
      (do
        (println "No database container found, doing initial setup...")
        (setup-test-environment))
      (do
        ;; Normal fast reset path
        (fast-database-reset)
        ;; Ensure cargo is still running and healthy after DB reset
        ;; This should be quick since we expect it to already be running
        (when-not (and *cargo-process* (p/alive? *cargo-process*))
          (println "Cargo process died, restarting...")
          (ensure-cargo-running))
        ;; Quick health check without restart
        (when-not (try
                    (= "healthy" (:status (:body (make-request :get "/health"))))
                    (catch Exception _ false))
          (println "Cargo health check failed, restarting...")
          (restart-cargo-process))))))

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

(defn force-kill-all-rustsorter-processes []
  "Nuclear option: kill all rustsorter and cargo processes"
  (println "\n=== Force killing all rustsorter processes ===")
  (try
    ;; Kill by port first
    (kill-processes-on-port 8081)
    ;; Kill by process name as backup
    (shell/sh "pkill" "-f" "rustsorter")
    (shell/sh "pkill" "-f" "cargo.*run")
    (Thread/sleep 2000)
    (println "All rustsorter processes killed")
    (catch Exception e
      (println "Error during force kill:" (.getMessage e)))))

(defn force-cleanup-and-exit []
  "Emergency cleanup and exit - use when process won't terminate"
  (println "\n=== Force cleanup and exit ===")
  (try
    (stop-cargo-process *cargo-process*)
    (force-kill-all-rustsorter-processes)
    (cleanup-output-files)
    (catch Exception e
      (println "Error during cleanup:" (.getMessage e))))
  (shutdown-agents)
  (System/exit 0))
