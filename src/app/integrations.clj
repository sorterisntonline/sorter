(ns app.integrations
  (:require [app.database :as db]
            [hato.client :as hc]
            [clojure.data.json :as json]
            [app.spotify :as spotify]))

(defn get-integrations [r]
  (def r r)
  {:status 200 :body {:spotify false
                      :youtube false}})

(comment
  (spotify/get-self (spotify/refresh-token-for (-> r :session :user_name)))
  (spotify/get-self (:tokens/access_token (spotify/get-token-for (-> r :session :user_name)))))

(def routes [["/status" {:get {:handler #'get-integrations}}]])
