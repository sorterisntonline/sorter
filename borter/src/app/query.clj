(ns app.query
  (:require [hyperfiddle.rcf :refer [tests tap %]]
            [honey.sql.helpers :as h]
            [sluj.core :refer [sluj]]
            [app.database :as db]
            [app.spotify :as spotify]
            [app.llm :as llm]
            [clojure.string :as str]))

(defn check-existing-tag [tag domain-pk-namespace]
  (first (db/exec! (-> (h/select :*)
                      (h/from :tags)
                      (h/where [:and
                               [:= :title tag]
                               [:= :domain_pk_namespace domain-pk-namespace]])))))

(defn create-tag-from-spotify [spotify-item domain-pk-namespace owner]
  (when (and spotify-item 
             (:name spotify-item)  ; Ensure name exists
             (not (str/blank? (:name spotify-item))))  ; Ensure name isn't empty
    (let [tag-title (str "#" (sluj (:name spotify-item)))]
      (db/exec! (-> (h/insert-into :tags)
                    (h/values [{:title tag-title
                               :slug (sluj (:name spotify-item))
                               :owner owner
                               :domain_pk (:id spotify-item)
                               :domain_pk_namespace domain-pk-namespace}])
                    (h/on-conflict :domain_pk :domain_pk_namespace)
                    (h/do-update-set :title)
                    (h/returning :*))))))

(defn search-spotify [query domain-pk-namespace]
  (let [type (case domain-pk-namespace
               "spotify.artist" "artist"
               "spotify.album" "album"
               "spotify.track" "track"
               nil)
        results (spotify/search query type)]
    (first results)))

(defn process-tag-suggestion [suggestion owner]
  (println "Processing suggestion:" suggestion)
  (try
    (let [{:keys [tag domain_pk_namespace spotify_search]} suggestion
          _ (println "Processing tag:" tag 
                    "namespace:" domain_pk_namespace 
                    "search:" spotify_search)
          
          ;; Remove the '#' from the tag before processing
          clean-tag (if (str/starts-with? tag "#")
                     (subs tag 1)
                     tag)
          
          ;; Check if tag already exists
          existing-tag (check-existing-tag clean-tag domain_pk_namespace)
          
          ;; If tag doesn't exist and we have a Spotify namespace, create it
          tag-record (or existing-tag
                        (when (str/starts-with? domain_pk_namespace "spotify.")
                          (let [spotify-item (search-spotify spotify_search domain_pk_namespace)]
                            (create-tag-from-spotify spotify-item domain_pk_namespace owner))))]
      
      (when tag-record
        {:tag clean-tag
         :domain_pk_namespace domain_pk_namespace
         :spotify_search spotify_search
         :tag_record tag-record}))
    (catch Exception e
      (println "Error processing suggestion:" (ex-message e))
      (println "Full error details:" (ex-data e))
      (.printStackTrace e)
      nil)))

(defn handle-tag-query [req]
  (println "Handling tag query request:" req)
  (try
    (let [input (or (-> req :query-params (get "query"))
                    (-> req :params (get "query")))
          _ (println "Query input:" input)
          owner (-> req :session :user_name)
          _ (println "Owner:" owner)]
      
      (if (str/blank? input)
        (do
          (println "Empty input, returning empty suggestions")
          {:status 200 :body {:suggestions []}})
        
        (let [suggestions (llm/suggest-tags input)
              _ (println "Got suggestions from LLM:" suggestions)
              
              processed-suggestions (->> suggestions
                                       (map #(process-tag-suggestion % owner))
                                       (remove nil?)
                                       vec)
              _ (println "Processed suggestions:" processed-suggestions)]
          
          {:status 200
           :body {:suggestions processed-suggestions}})))
    (catch Exception e
      (println "Error in handle-tag-query:" (ex-message e))
      (println "Full error:")
      (.printStackTrace e)
      {:status 500
       :body {:error "Failed to process tag suggestions"
              :details (ex-message e)}})))
