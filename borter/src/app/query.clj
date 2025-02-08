(ns app.query
  (:require [hyperfiddle.rcf :refer [tests tap %]]
            [honey.sql.helpers :as h]
            [sluj.core :refer [sluj]]
            [app.database :as db]
            [app.spotify :as spotify]
            [app.llm :as llm]
            [clojure.string :as str]))

(defn check-existing-tag [tag domain-pk-namespace]
  (let [clean-tag (if (str/starts-with? tag "#")
                   (subs tag 1)
                   tag)
        slug (sluj clean-tag)]
    (first (db/exec! (-> (h/select :*)
                         (h/from :tags)
                         (h/where [:and
                                   [:= :slug slug]
                                   [:= :domain_pk_namespace domain-pk-namespace]]))))))

(defn create-generic-tag [tag-name domain-pk-namespace owner]
  (when (and tag-name (not (str/blank? tag-name)))
    (let [clean-tag (str "#" (if (str/starts-with? tag-name "#")
                              (subs tag-name 1)
                              tag-name))
          slug (sluj (if (str/starts-with? tag-name "#")
                      (subs tag-name 1)
                      tag-name))]
      (db/exec! 
       ["INSERT INTO tags (title, slug, owner, domain_pk_namespace)
         VALUES (?, ?, ?, ?)
         ON CONFLICT ON CONSTRAINT tags_title_domain_pk_namespace_key 
         DO UPDATE SET 
           slug = EXCLUDED.slug,
           owner = EXCLUDED.owner
         RETURNING *"
        clean-tag
        slug
        owner
        domain-pk-namespace]))))

(defn process-tag-suggestion [suggestion owner]
  (println "Processing suggestion:" suggestion)
  (try
    (let [{:keys [tag domain_pk_namespace spotify_search]} suggestion
          _ (println "Processing tag:" tag 
                    "namespace:" domain_pk_namespace 
                    "search:" spotify_search)
          
          clean-tag (if (and tag (str/starts-with? tag "#"))
                     (subs tag 1)
                     tag)]
      
      (when clean-tag
        (let [existing-tag (check-existing-tag clean-tag domain_pk_namespace)
              _ (println "Found existing tag:" existing-tag)
              
              ;; If we found an existing tag, return it immediately
              result (if existing-tag
                      existing-tag
                      (cond
                        ;; Spotify-specific tags
                        (and domain_pk_namespace 
                             (str/starts-with? domain_pk_namespace "spotify."))
                        (let [spotify-item (search-spotify spotify_search domain_pk_namespace)
                              entity-type (last (str/split domain_pk_namespace #"\."))]
                          (when spotify-item
                            (spotify/import-spotify-entity entity-type spotify-item owner)))
                        
                        ;; Generic tags (genre, decade, etc)
                        :else
                        (create-generic-tag clean-tag domain_pk_namespace owner)))
              
              ;; Extract the tag record from the result
              tag-record (if (map? result)
                          (if (:tag result) 
                            (:tag result)  ;; For spotify import results
                            result)        ;; For existing/generic tags
                          result)]        ;; Fallback
          
          (when tag-record
            {:tag clean-tag
             :domain_pk_namespace domain_pk_namespace
             :spotify_search spotify_search
             :tag_record tag-record}))))
    (catch Exception e
      (println "Error processing suggestion:" (ex-message e))
      (println "Full error details:" (ex-data e))
      (.printStackTrace e)
      nil)))

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
      
      (let [spotify-results (spotify/search input)
            _ (println "Got results from Spotify:" spotify-results)
            
            processed-suggestions (->> spotify-results
                                       (map (fn [result]
                                              (let [entity-type (cond
                                                                  (:type/artist result) "spotify.artist"
                                                                  (:type/album result) "spotify.album"
                                                                  (:type/track result) "spotify.track")
                                                    name (or (:name result) (:title result))]
                                                {:tag (str "#" name)
                                                 :domain_pk_namespace entity-type
                                                 :spotify_search name
                                                 :tag_record (spotify/import-spotify-entity 
                                                              (last (str/split entity-type #"\."))
                                                              result 
                                                              owner)})))
                                       (remove nil?)
                                       vec)
            _ (println "Processed suggestions:" processed-suggestions)]
        
        {:status 200
         :body {:suggestions processed-suggestions}}))))
