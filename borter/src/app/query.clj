(ns app.query
  (:require [hyperfiddle.rcf :refer [tests tap %]]
            [honey.sql.helpers :as h]
            [sluj.core :refer [sluj]]
            [app.database :as db]
            [app.spotify :as spotify]
            [app.llm :as llm]
            [clojure.string :as str]))

(defn handle-tag-query [req]
  (println "Handling tag query request:" req)
  (let [input (or (-> req :query-params (get "query"))
                  (-> req :params (get "query")))
        _ (println "Query input:" input)
        owner (-> req :session :user_name)
        _ (println "Owner:" owner)]
    
    (if (str/blank? input)
      (do
        (println "Empty input, returning empty suggestions")
        {:status 200 :body {:suggestions []}})
      
      (let [spotify-results (spotify/search input)]
        {:status 200
         :body {:suggestions spotify-results}}))))
