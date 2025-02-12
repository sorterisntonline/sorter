(ns prod
  (:gen-class)
  (:require  ; in prod, load app into server so it can accept clients
   clojure.string
   nrepl.server
   [app.http :as http]
   [app.database :as db]))

(def electric-server-config
  {:host "0.0.0.0", :port 8080, :resources-path "public"})

(def nrepl-config {:port 7888 :bind "0.0.0.0"})

(defn -main [& args] ; run with `clj -M -m prod`
  (println "starting repl with config" nrepl-config)
  (defonce server (nrepl.server/start-server :bind (:bind nrepl-config)
                                             :port (:port nrepl-config)))
  (db/run-migrations)
  (http/start {:port 8080}))



; On CLJS side we reuse src/user.cljs for prod entrypoint
