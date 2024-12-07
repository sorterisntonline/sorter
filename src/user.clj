(ns user

  (:require nrepl.server
            [app.http :as http]
            [app.database :as db])) ; Must be ".clj" file, Clojure doesn't auto-load user.cljc

; lazy load dev stuff - for faster REPL startup and cleaner dev classpath
(def electric-server-config
  {:host "0.0.0.0", :port 8080, :resources-path "public"})

(def nrepl-config {:port 7888 :bind "0.0.0.0"})

(defn -main [& args]
  (defonce server (nrepl.server/start-server :bind (:bind nrepl-config)
                                             :port (:port nrepl-config)))
  (println "nrepl started at port" (:port nrepl-config))
  (db/run-migrations)
  (http/start {:port 3000})
  
   ; serves index.html as well
   ; depends on shadow server
  ; Shadow loads app.todo-list here, such that it shares memory with server.
  )

; Server-side Electric userland code is lazy loaded by the shadow build.
; WARNING: make sure your REPL and shadow-cljs are sharing the same JVM!

(comment
  (-main) ; Electric Clojure(JVM) REPL entrypoint
  (hyperfiddle.rcf/enable!) ; turn on RCF after all transitive deps have loaded
  (shadow.cljs.devtools.api/repl :dev) ; shadow server hosts the cljs repl
  ; connect a second REPL instance to it
  ; (DO NOT REUSE JVM REPL it will fail weirdly)
  (type 1))
