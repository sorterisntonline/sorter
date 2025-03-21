(ns app.health
  (:require [ring.util.response :as resp]
            [app.database :as db]
            [clojure.tools.logging :as log]
            [clojure.java.shell :refer [sh]]
            [app.version :as version]
            [hato.client :as hc]
            [clojure.data.json :as json]
            [clojure.string :as str]))

(defn get-build []
  "Get the git tag as build identifier"
  (try
    (str (clojure.string/trim (:out (sh "git" "describe" "--tags" "--abbrev=0"))))
    (catch Exception _
      "unknown")))

(defn check-internal-api []
  "Check if the rustsorter internal API is healthy"
  (try
    (let [rustsorter-url (or (System/getenv "RUSTSORTER_URL") "http://localhost:8081")
          health-url (str/replace rustsorter-url #"/$" "") ; Remove trailing slash if present
          health-url (str health-url "/api/health")
          response (hc/get health-url {:as :json
                                       :throw-exceptions false
                                       :connect-timeout 1000
                                       :socket-timeout 1000})]
      (log/info "Rustsorter API response:" response)
      (if (= 200 (:status response))
        (:body response)
        {:healthy false
         :error (str "Rustsorter API returned status " (:status response))
         :version "unknown"}))
    (catch Exception e
      {:healthy false
       :error (str "Failed to connect to rustsorter API: " (.getMessage e))
       :version "unknown"})))

(defn check-health [_]
  "A comprehensive health check handler that returns system status, even when DB is down."
  (let [db-health (try 
                    (db/check-db-health) 
                    (catch Throwable e 
                      (log/warn "Database health check failed:" (.getMessage e))
                      false))
        db-status (try 
                    (db/get-db-status) 
                    (catch Throwable e
                      (log/warn "Failed to get database status:" (.getMessage e))
                      {:healthy false 
                       :error (str "Cannot get database status: " (.getMessage e))
                       :datasource-initialized false}))
        internal-api (try
                       (let [api-response (check-internal-api)]
                         {:healthy (= "healthy" (:status api-response))
                          :version (:version api-response)})
                       (catch Throwable e
                         (log/warn "Internal API check failed completely:" (.getMessage e))
                         {:healthy false
                          :error (str "Internal API check failed: " (.getMessage e))
                          :version "unknown"}))
        status-code (if (and db-health (:healthy internal-api)) 200 503)
        response-body {:status (if (and db-health (:healthy internal-api)) "healthy" "unhealthy")
                       :version version/version
                       :build (try (get-build) (catch Throwable _ "unknown"))
                       :timestamp (.toString (java.time.Instant/now))
                       :database {:status (if db-health "connected" "error")
                                  :error (:error db-status)
                                  :initialized (:datasource-initialized db-status)}
                       :internal-api {:status (if (:healthy internal-api) "connected" "error")
                                      :error (:error internal-api)
                                      :version (:version internal-api)}}]
    (log/info "Health check, db status:" db-health "internal-api status:" (:healthy internal-api))
    {:status status-code
     :body response-body}))

(def routes
  [["" {:get {:no-doc false
              :summary "Health check endpoint"
              :tags ["System"]
              :description "Simple health check to verify the API is running"
              :responses {200 {:description "Health status"
                               :content {:default {:schema [:map
                                                            [:status :string]
                                                            [:build :string]
                                                            [:version :string]
                                                            [:database [:map 
                                                                        [:status :string]
                                                                        [:error [:maybe :string]]
                                                                        [:initialized :boolean]]]
                                                            [:internal-api [:map 
                                                                            [:status :string]
                                                                            [:error [:maybe :string]]
                                                                            [:version :string]]]]}}}}
              :handler check-health}}]])
