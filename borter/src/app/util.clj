(ns app.util
  (:require [clojure.string :as string])
  (:import [java.net URLEncoder]))

(defn get-base-url
  "Public site base URL for redirects and oauth callbacks."
  []
  (if-let [hostname (not-empty (System/getenv "HOSTNAME"))]
    (if (string/starts-with? hostname "http")
      (string/replace hostname #"/$" "")
      (str "https://" (string/replace hostname #"/$" "")))
    (case (or (System/getenv "ENVIRONMENT") "development")
      "production" "https://sorter.social"
      "staging" "https://staging.sorter.social"
      "http://localhost:3000")))

(defn urlencode-params [params]
  (clojure.string/join "&" (map (fn [[k v]] (str k "=" (URLEncoder/encode (str v) "UTF-8"))) params)))

(comment
  (urlencode-params {:a 3 :b 4}))
