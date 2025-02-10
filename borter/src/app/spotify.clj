(ns app.spotify
  (:require [app.oauth :as oauth]
            [hato.client :as hc]
            [clojure.data.json :as json]
            [ring.util.codec :as codec]
            [app.database :as db]
            [app.spotify-oauth :as so]
            [honey.sql.helpers :as h]
            [sluj.core :refer [ sluj]]
            [ring.util.response :refer [redirect]]
            [app.permissions :as perms]
            [clojure.string :as str]
            [com.wsscode.pathom3.connect.indexes :as pci]
            [com.wsscode.pathom3.connect.operation :as pco]
            [com.wsscode.pathom3.interface.eql :as p.eql]
            [com.wsscode.pathom3.connect.built-in.resolvers :as pbir]
            [com.wsscode.pathom3.connect.built-in.plugins :as pbip]
            [com.wsscode.pathom3.interface.async.eql :as p.a.eql]
            [com.wsscode.pathom3.interface.smart-map :as psm]
            [com.wsscode.pathom3.plugin :as p.plugin])
  (:import [java.util Base64]))

(def global-token (atom nil))

(defn get-valid-token [username]
  (oauth/get-valid-token so/spotify-provider username "spotify"))


(defn get-hostname []
  (case (System/getenv "ENVIRONMENT")
    "production" "https://sorter.social"
    "staging" "https://staging.sorter.social"
    "http://localhost:3000"))

(defn get-client-token []
  (try
    (when (or (nil? @global-token) 
              (nil? (:expires_at @global-token))
              (> (System/currentTimeMillis) (:expires_at @global-token)))
      (let [response (hc/request {:url "https://accounts.spotify.com/api/token"
                                  :method :post
                                  :headers {"Authorization" (str "Basic " (oauth/encode-to-base64 (str so/client-id ":" so/client-secret)))}
                                  :form-params {:grant_type "client_credentials"}})
            body (-> response :body (json/read-str {:key-fn keyword}))
            expires-in (* (:expires_in body) 1000)]
        (reset! global-token {:access_token (:access_token body)
                              :expires_at (+ (System/currentTimeMillis) expires-in)})))
    (or (:access_token @global-token)
        (throw (ex-info "Failed to get client token" {:status 500})))
    (catch Exception e
      (println "Error getting client token:" (ex-message e))
      (throw (ex-info "Failed to get client token" {:status 500 :cause e})))))

(defn search
  "Search Spotify for items and merge with existing database records"
  [query]
  (let [access-token (get-client-token)
        ;; Get results from Spotify API
        response (hc/request 
                  {:url "https://api.spotify.com/v1/search"
                   :method :get
                   :headers {"Authorization" (str "Bearer " access-token)}
                   :query-params {"q" query
                                  "type" "album,track,artist"
                                  "limit" 5}})
        results (-> response :body (json/read-str {:key-fn keyword}))
        
        ;; Extract all Spotify IDs
        spotify-ids (concat 
                     (map :id (get-in results [:artists :items]))
                     (map :id (get-in results [:albums :items]))
                     (map :id (get-in results [:tracks :items])))
        
        ;; Look up existing records
        existing-records (when (seq spotify-ids)
                           (db/exec! 
                            (-> (h/select :*)
                                (h/from :tags)
                                (h/where [:and 
                                          [:in :domain_pk spotify-ids]
                                          [:like :domain_pk_namespace "spotify.%"]]))))]
    
    ;; Merge results with existing records
    {:artists (map #(merge % (first (filter (fn [r] (= (:domain_pk r) (:id %))) 
                                            existing-records)))
                   (get-in results [:artists :items]))
     :albums (map #(merge % (first (filter (fn [r] (= (:domain_pk r) (:id %))) 
                                           existing-records)))
                  (get-in results [:albums :items]))
     :tracks (map #(merge % (first (filter (fn [r] (= (:domain_pk r) (:id %))) 
                                           existing-records)))
                  (get-in results [:tracks :items]))}))

(comment
  (search "kdot"))

;; Create the standard OAuth route handlers
(defn create-spotify-tag
  "Creates a tag for a Spotify entity (artist, album, track) if it doesn't exist"
  [domain_pk_namespace entity]
  ;; First ensure spotify system user exists
  (db/exec! 
   ["INSERT INTO users (user_name, email, password_hash)
     VALUES (?, ?, ?)
     ON CONFLICT (user_name) DO NOTHING"
    "spotify" "spotify@sorter.social" "not-a-real-password"])

  (let [title (:name entity)
        slug (sluj title)
        domain-pk (:id entity)
        ;; Try insert first, if nothing returned, do a select
        result (or 
                (first (db/exec! 
                        ["SELECT * FROM tags 
                        WHERE domain_pk_namespace = ? AND domain_pk = ?"
                         domain_pk_namespace domain-pk]))
                (first (db/exec! 
                        ["INSERT INTO tags (title, slug, owner, domain_pk_namespace, domain_pk)
                        VALUES (?, ?, ?, ?, ?)
                        ON CONFLICT (domain_pk_namespace, domain_pk) 
                        DO NOTHING
                        RETURNING *"
                         title slug "spotify" domain_pk_namespace domain-pk])))]
    [result]))


(defn get-artist-tracks
  "Get all tracks for an artist from Spotify API"
  [artist-id token]
  (let [response (hc/request 
                  {:url (str "https://api.spotify.com/v1/artists/" artist-id "/top-tracks")
                   :method :get
                   :headers {"Authorization" (str "Bearer " token)}
                   :query-params {"market" "US"}})
        tracks (-> response :body (json/read-str {:key-fn keyword}) :tracks)]
    tracks))

(defn get-album-tracks
  "Get all tracks from an album"
  [album-id token]
  (try
    (let [response (hc/request 
                    {:url (str "https://api.spotify.com/v1/albums/" album-id "/tracks")
                     :method :get
                     :headers {"Authorization" (str "Bearer " token)}})
          tracks (-> response :body (json/read-str {:key-fn keyword}) :items)]
      tracks)
    (catch Exception e
      (println "Error getting album tracks:" (ex-message e))
      [])))

(defn create-or-get-category-tag
  "Creates or gets a tag for categories like genres, decades"
  [category-name owner]
  (db/exec! 
   ["INSERT INTO tags (title, slug, owner, domain_pk_namespace)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (title, domain_pk_namespace) 
     DO UPDATE SET 
       slug = EXCLUDED.slug,
       owner = EXCLUDED.owner
     RETURNING *"
    (str "#" category-name)
    (sluj category-name)
    "spotify"
    (case (first (str/split category-name #"-"))
      "genre" "meta.genre"
      "decade" "meta.decade")]))

(defn get-artist-metadata
  "Get full artist metadata including genres"
  [artist-id token]
  (try
    (let [response (hc/request 
                    {:url (str "https://api.spotify.com/v1/artists/" artist-id)
                     :method :get
                     :headers {"Authorization" (str "Bearer " token)}})
          artist (-> response :body (json/read-str {:key-fn keyword}))]
      artist)
    (catch Exception e
      (println "Error getting artist metadata:" (ex-message e))
      nil)))

(defn get-track-metadata
  "Get full track metadata including album release date"
  [track-id token]
  (try
    (let [response (hc/request 
                    {:url (str "https://api.spotify.com/v1/tracks/" track-id)
                     :method :get
                     :headers {"Authorization" (str "Bearer " token)}})
          track (-> response :body (json/read-str {:key-fn keyword}))
          album-response (hc/request 
                         {:url (str "https://api.spotify.com/v1/albums/" (-> track :album :id))
                          :method :get
                          :headers {"Authorization" (str "Bearer " token)}})
          album (-> album-response :body (json/read-str {:key-fn keyword}))]
      (assoc track :release_date (:release_date album)))
    (catch Exception e
      (println "Error getting track metadata:" (ex-message e))
      nil)))

(defn get-decade-from-date
  "Convert a release date to a decade tag (e.g., '1970s')"
  [release-date]
  (when release-date
    (let [year (Integer/parseInt (first (str/split release-date #"-")))
          decade (* (quot year 10) 10)]
      (str decade "s"))))

(defn add-to-category-tags
  "Add items to genre and decade tags"
  [items owner metadata]
  (let [token (get-client-token)]
    ;; Handle genres
    (when-let [genres (:genres metadata)]
      (doseq [genre genres]
        (let [genre-tag (first (create-or-get-category-tag (str "genre-" (sluj genre)) owner))]
          (db/exec! 
           (-> (h/insert-into :items_in_tags)
               (h/values
                (for [item items]
                  {:item_id (:id item)
                   :tag_id (:id genre-tag)})))))))
    
    ;; Handle decades
    (when-let [release-date (:release_date metadata)]
      (when-let [decade (get-decade-from-date release-date)]
        (let [decade-tag (first (create-or-get-category-tag (str "decade-" decade) owner))]
          (db/exec! 
           (-> (h/insert-into :items_in_tags)
               (h/values
                (for [item items]
                  {:item_id (:id item)
                   :tag_id (:id decade-tag)})))))))))

(defn import-spotify-entity
  "Main function to handle importing any Spotify entity (artist, album, track)"
  [domain_pk_namespace entity]
  (let [token (get-client-token)
        entity-tag (first (create-spotify-tag domain_pk_namespace entity))
        
        tracks (case domain_pk_namespace
                 "spotify.artist" (get-artist-tracks (:id entity) token)
                 "spotify.album" (get-album-tracks (:id entity) token)
                 "spotify.track" [entity]
                 [])]
    (when (and entity-tag tracks)
      ;; First insert or get existing items
      (let [items (or 
                   ;; Try insert first
                   (seq (db/exec! 
                         (-> (h/insert-into :items)
                             (h/values
                              (for [track tracks]
                                {:title (:name track)
                                 :slug (sluj (:name track))
                                 :domain_pk (:id track)
                                 :domain_pk_namespace domain_pk_namespace
                                 :owner "spotify"}))
                             (h/on-conflict :domain_pk :domain_pk_namespace)
                             (h/do-nothing)
                             (h/returning :*))))
                   ;; If no inserts, get existing items
                   (db/exec! 
                    (-> (h/select :*)
                        (h/from :items)
                        (h/where [:and 
                                  [:= :domain_pk_namespace domain_pk_namespace]
                                  [:in :domain_pk (map :id tracks)]]))))]
        
        ;; Create items_in_tags associations and return result
        {:tag entity-tag
         :items (db/exec! 
                 (-> (h/insert-into :items_in_tags)
                     (h/values
                      (for [item items]
                        {:item_id (:id item)
                         :tag_id (:id entity-tag)}))
                     (h/on-conflict :item_id :tag_id)
                     (h/do-nothing)
                     (h/returning :*)))}))))

(defn resolve-spotify-entity [req]
  (let [{:keys [domain_pk domain_pk_namespace metadata]} (-> req :body-params)
        username (-> req :session :user_name)]
    
    (when-not username
      (throw (ex-info "Must be logged in" {:status 401})))
    
    (let [result (import-spotify-entity 
                  domain_pk_namespace
                  {:id domain_pk 
                   :name (:name metadata)
                   :images [{:url (:image metadata)}]})]
      
      (if result
        {:status 200
         :body {:tag (-> result :tag :slug)}}
        {:status 404
         :body {:error "Failed to resolve entity"}}))))

(comment
  (db/exec! {:select :* :from :tags :where [:= :domain_pk_namespace "spotify.artist"]})
  (import-spotify-entity domain_pk_namespace entity)
  
  
  )

(def routes [])



