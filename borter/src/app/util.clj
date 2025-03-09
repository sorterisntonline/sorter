(ns app.util
  (:require [clojure.string :as string])
  (:import [java.net URLEncoder]))

(defn urlencode-params [params]
  (clojure.string/join "&" (map (fn [[k v]] (str k "=" (URLEncoder/encode (str v) "UTF-8"))) params)))

(comment
  (urlencode-params {:a 3 :b 4}))
