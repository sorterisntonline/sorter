(ns prod
  (:gen-class)
  (:require  ; in prod, load app into server so it can accept clients
   clojure.string
   nrepl.server
   [app.http :as http]
   [app.database :as db]))

(def environment (or (System/getenv "ENVIRONMENT") "development"))

(def electric-server-config
  {:host "0.0.0.0", :port 8080, :resources-path "public"})

(def nrepl-config 
  (let [base-config {:port 7888 :bind "0.0.0.0"}]
    (case environment
      "production" (assoc base-config 
                         :handler (requiring-resolve 'cider.nrepl/cider-nrepl-handler)
                         :middleware '[cider.nrepl/wrap-info]
                         :auth {:password (or (System/getenv "REPL_PASSWORD")
                                            (throw (Exception. "REPL_PASSWORD environment variable must be set in production")))})
      "staging" (assoc base-config 
                      :handler (requiring-resolve 'cider.nrepl/cider-nrepl-handler)
                      :middleware '[cider.nrepl/wrap-info]
                      :auth {:password (or (System/getenv "REPL_PASSWORD")
                                         (throw (Exception. "REPL_PASSWORD environment variable must be set in staging")))})
      base-config)))  ; development has no password

(defn -main
  "Run with `clj -M -m prod` or with optional port override {:port 3000}"
  [& {:keys [port] :or {port 8080}}]
  (println "starting repl with config" (dissoc nrepl-config :auth))  ; don't log password
  (defonce server (nrepl.server/start-server nrepl-config))
  (db/run-migrations)
  (http/start {:port port}))



; On CLJS side we reuse src/user.cljs for prod entrypoint