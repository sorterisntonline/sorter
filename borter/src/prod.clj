(ns prod
  (:gen-class)
  (:require  ; in prod, load app into server so it can accept clients
   clojure.string
   [nrepl.server :as nrepl-server]  ; Use alias for nrepl.server
   [cider.nrepl :refer (cider-nrepl-handler)]  ; Directly refer cider-nrepl-handler
   [clojure.tools.logging :as log]  ; Add logging require
   [app.http :as http]
   [app.database :as db]))

(def environment (or (System/getenv "ENVIRONMENT") "development"))

(def electric-server-config
  {:host "0.0.0.0", :port 8080, :resources-path "public"})

(def nrepl-config 
  (let [base-config {:port 7888 
                     :bind "0.0.0.0"
                     :port-file ".nrepl-port"}]  ; Add port-file configuration
    (case environment
      "production" (assoc base-config 
                         :handler cider-nrepl-handler
                         :auth {:password (or (System/getenv "REPL_PASSWORD")
                                            (throw (Exception. "repl_password environment variable must be set in production")))})
      "staging" (assoc base-config 
                      :handler cider-nrepl-handler
                      :auth {:password (or (System/getenv "REPL_PASSWORD")
                                         (throw (Exception. "repl_password environment variable must be set in staging")))})
      (assoc base-config :handler cider-nrepl-handler))))  ; development: use cider-nrepl-handler

(def server-instance (atom nil))

;; Test logging levels
(comment
  (log/trace "This is a TRACE message")
  (log/debug "This is a DEBUG message") 
  (log/info "This is an INFO message")
  (log/warn "This is a WARN message")
  (log/error "This is an ERROR message")
  (log/fatal "This is a FATAL message"))


(defn -main
  "Run with `clj -M -m prod` or with optional port override {:port 3000}"
  [& {:keys [port] :or {port 8080}}]
  (log/info "\n ______   _____   ______ _______ _______  ______\n |_____] |     | |_____/    |    |______ |_____/\n |_____] |_____| |    \\_    |    |______ |    \\_\n")
  (log/info "starting borter in" environment "environment")
  (log/debug "server configuration:" electric-server-config)
  (log/info "starting repl with config" (dissoc nrepl-config :auth))  ; don't log password
  (reset! server-instance (nrepl-server/start-server nrepl-config))
  (try
    (db/run-migrations)
    (log/info "database migrations completed successfully")
    (catch Exception e
      (log/error e "failed to run database migrations")))
  (try
    (http/start {:port port})
    (log/info "http server started successfully on port" port)
    (catch Exception e
      (log/error e "failed to start http server"))))
