(ns app.health
  (:require [ring.util.response :as resp]
            [app.database :as db]
            [clojure.tools.logging :as log]
            [clojure.java.shell :refer [sh]]))

(defn get-version []
  (try
    (str (clojure.string/trim (:out (sh "git" "describe" "--tags" "--abbrev=0"))))
    (catch Exception _
      "unknown")))

(defn check-health [_]
  "A comprehensive health check handler that returns system status, even when DB is down."
  (try
    (let [db-health (try (db/check-db-health) (catch Throwable _ false))
          db-status (try (db/get-db-status) (catch Throwable _ 
                                              {:healthy false 
                                               :error "Cannot get database status"
                                               :datasource-initialized false}))]
      (log/info "Health check, db status:" db-health)
      {:status (if db-health 200 503)
       :headers {"Content-Type" "application/json"}
       :body {:status (if db-health "healthy" "unhealthy")
              :version (get-version)
              :timestamp (.toString (java.time.Instant/now))
              :database {:status (if db-health "connected" "error")
                         :error (:error db-status)
                         :initialized (:datasource-initialized db-status)}}})
    (catch Throwable e
      (log/error "Error during health check:" (.getMessage e))
      {:status 503
       :headers {"Content-Type" "application/json"}
       :body {:status "unhealthy"
              :version "unknown"
              :timestamp (.toString (java.time.Instant/now))
              :error (.getMessage e)
              :database {:status "error"
                         :error "Health check failed"
                         :initialized false}}})))
