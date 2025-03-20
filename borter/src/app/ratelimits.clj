(ns app.ratelimits
  (:require [app.database :as db]
            [honey.sql.helpers :as h]
            [sluj.core :refer [sluj]]
            [hato.client :as hc]
            [clojure.tools.logging :as log]
            
            [io.staticweb.rate-limit.storage :as storage]
            [io.staticweb.rate-limit.middleware :refer [ip-rate-limit wrap-rate-limit]]
            [io.staticweb.rate-limit.limits :refer [RateLimit]]
            [io.staticweb.rate-limit.responses :refer [too-many-requests-response]]
            [cheshire.core :as json]))

(def storage (storage/local-storage))
(comment
  (storage/clear-counters storage))

(defrecord UserRateLimit [id quota ttl]
  RateLimit
  (get-key [self req]
    (str (.getName (type self)) id
         "-"
         (:template (:reitit.core/match req))
         "-"
         (:user_name (:session req))))

  (get-quota [self req]
    (let [username (get-in req [:session :user_name])
          static-admins (System/getenv "BORTER_STATIC_ADMINS")
          always-unlimited (if static-admins
                             (-> static-admins
                                 (clojure.string/split #",")
                                 (into []))
                             ["tommy" "jason" "zod" "zodsuper" "admin"])]
      (cond
        ;; All users are unlimited when NO_RATE_LIMITS is true
        (= "true" (System/getenv "NO_RATE_LIMITS")) Integer/MAX_VALUE
        ;; Check if the username is in the always unlimited set
        (contains? always-unlimited username) Integer/MAX_VALUE
        ;; default case - use the specified quota
        :else quota)))

  (get-ttl [self req]
    ttl))

(defn ratelimit-response-builder
  [quota retry-after]
  (let [error-data {:quota quota
                    :retry-after-seconds (.getSeconds retry-after)}]
    (too-many-requests-response
     {:headers {"Content-Type" "application/json"}
      :body (json/generate-string
             {:message (str "Rate limit exceeded. Maximum " quota " requests allowed. Try again in "
                            (.getSeconds retry-after) " seconds.")
              :error error-data})}
     retry-after)))



(def one-per-second {:storage storage :limit (UserRateLimit. 1 1 (java.time.Duration/ofSeconds 1)) :response-builder ratelimit-response-builder})
(def one-per-minute {:storage storage :limit (UserRateLimit. 2 1 (java.time.Duration/ofMinutes 1)) :response-builder ratelimit-response-builder})
(def five-per-minute {:storage storage :limit (UserRateLimit. 3 5 (java.time.Duration/ofMinutes 1)) :response-builder ratelimit-response-builder})
(def three-per-five-minutes {:storage storage :limit (UserRateLimit. 4 3 (java.time.Duration/ofMinutes 5)) :response-builder ratelimit-response-builder})

