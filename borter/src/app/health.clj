(ns app.health
  (:require [ring.util.response :as resp]))

(defn check-health [_]
  "A simple health check handler."
  {:status 200
   :body "OK"})
