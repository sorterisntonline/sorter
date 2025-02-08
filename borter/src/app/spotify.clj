(ns app.spotify
  (:require [app.oauth :as oauth]
            [hato.client :as hc]
            [clojure.data.json :as json]
            [ring.util.codec :as codec]
            [app.database :as db]
            [honey.sql.helpers :as h]
            [sluj.core :refer [ sluj]]
            [ring.util.response :refer [redirect]]
            [app.permissions :as perms]
            [clojure.string :as str])
  (:import [java.util Base64]))

(def client-id (System/getenv "BORTER_SPOTIFY_CLIENT_ID"))
(def client-secret (System/getenv "BORTER_SPOTIFY_CLIENT_SECRET"))
(defrecord SpotifyProvider []
  oauth/OAuthProvider
  (get-auth-url [_ state redirect-uri]
    (str "https://accounts.spotify.com/authorize?"
         (codec/form-encode
          {:client_id client-id
           :response_type "code"
           :redirect_uri redirect-uri
           :state state
           :scope (str "playlist-read-private playlist-read-collaborative "
                      "user-library-read playlist-modify-public playlist-modify-private "
                      "app-remote-control streaming user-read-playback-position "
                      "user-top-read user-read-recently-played user-read-playback-state "
                      "user-modify-playback-state user-read-currently-playing")})))
  
  (exchange-code [_ code redirect-uri]
    (-> (hc/request 
         {:url "https://accounts.spotify.com/api/token"
          :method :post
          :headers {"Authorization" (str "Basic " (oauth/encode-to-base64 (str client-id ":" client-secret)))}
          :form-params {:grant_type "authorization_code"
                       :code code
                       :redirect_uri redirect-uri}})
        :body
        (json/read-str)))
  
  (get-token-info [_ tokens]
    (let [access-token (get tokens "access_token")
          user-info (-> (hc/request
                        {:url "https://api.spotify.com/v1/me"
                         :method :get
                         :headers {"Authorization" (str "Bearer " access-token)}})
                       :body
                       (json/read-str))]
      user-info))
  
  (refresh-token [_ refresh-token]
    (-> (hc/request
         {:url "https://accounts.spotify.com/api/token"
          :method :post
          :headers {"Authorization" (str "Basic " (oauth/encode-to-base64 (str client-id ":" client-secret)))}
          :form-params {:grant_type "refresh_token"
                       :refresh_token refresh-token}})
        :body
        (json/read-str))))

(def spotify-provider (->SpotifyProvider))

(def token (atom nil))

(defn spotify-token [username]
  "todo automatically refresh token here"
  (first (db/exec! {:select :* :from :tokens :where [:and
                                                     [:= :owner username] 
                                                     [:= :domain_pk_namespace "spotify"]]})))
(defn get-valid-token [username]
  (oauth/get-valid-token spotify-provider username "spotify"))


(defn get-playlists [req]
  (let [offset (-> req :params (get "offset" "0") Integer/parseInt)
        token (get-valid-token (-> req :session :user_name))]
    (if token
      (let [res (-> (hc/request 
                     {:url (str "https://api.spotify.com/v1/me/playlists?offset=" offset)
                      :method :get
                      :headers {"Authorization" (str "Bearer " token)}})
                    :body
                    (json/read-str {:key-fn keyword}))]
        {:status 200
         :body (:items res)})
      {:status 401
       :body {:error "No valid token found"}})))

(comment (get-playlists "sttst"))

(defn log-user-out-of-spotify [username]
  (db/exec! {:delete-from :tokens :where [:and
                                          [:= :owner username]
                                          [:= :domain_pk_namespace "spotify"]]}))

(defn get-token-for [username]
  (-> {:select :* :from :tokens :where [:= :owner username ]} db/exec! first))

(defn get-hostname []
  (case (System/getenv "ENVIRONMENT")
    "production" "https://sorter.social"
    "staging" "https://staging.sorter.social"
    "http://localhost:3000"))

(defn token-expired? [token]
  (let [expires_at (:tokens/expires_at token)]
    (or (nil? expires_at)  ; Consider nil expiration as expired
        (> (System/currentTimeMillis) expires_at))))

(defn refresh-token-for [username]
  (when-let [tokens (get-token-for username)]
    (try
      (let [response (hc/request 
                      {:url "https://accounts.spotify.com/api/token"
                       :method :post
                       :headers {"Authorization" (str "Basic " (oauth/encode-to-base64 (str client-id ":" client-secret)))}
                       :form-params {:grant_type "refresh_token"
                                   :refresh_token (:tokens/refresh_token tokens)}})
            new-tokens (-> response :body (json/read-str {:key-fn keyword}))
            expires-in (* (:expires_in new-tokens) 1000)  ; Convert to milliseconds
            expires-at (+ (System/currentTimeMillis) expires-in)]
        (db/exec! 
         (-> (h/insert-into :tokens)
             (h/values [{:owner username
                        :refresh_token (:tokens/refresh_token tokens)
                        :access_token (:access_token new-tokens)
                        :expires_at expires-at
                        :domain_pk_namespace "spotify"}])
             (h/on-conflict :domain_pk_namespace :owner)
             (h/do-update-set :access_token :expires_at)))
        (:access_token new-tokens))
      (catch Exception e
        (println "Failed to refresh token:" (ex-message e))
        nil))))

(defn get-self [token]
  (let [res (hc/request {:as :json
                         :url (str "https://api.spotify.com/v1/me")
                         :method :get
                         :headers
                         {"Authorization" (str "Bearer " token)}})]
    (-> res :body (json/read-str {:key-fn keyword}))))

(comment
  (def token (:tokens/access_token (spotify-token "tommy")))
  (get-self token))

(defn get-playlist-tracks [playlist-id token]
  (let [res (-> (hc/request 
                {:url (str "https://api.spotify.com/v1/playlists/" playlist-id "/tracks")
                 :method :get
                 :headers {"Authorization" (str "Bearer " token)}})
               :body
               (json/read-str {:key-fn keyword}))]
    (:items res)))

(comment
  (def token (:tokens/access_token (spotify-token "tommy")))
  
  )

(defn add-songs-to-tag [req tagid songs]
  (let [ret2 (db/exec! (->
                       (h/insert-into :items)
                       (h/values
                        (for [song songs] {:items/title (-> song :track :name)
                                         :items/slug (sluj (-> song :track :name))
                                         :items/domain_pk (-> song :track :id)
                                         :items/domain_pk_namespace "spotify.track"
                                         :items/owner (-> req :session :user_name)}))
                       (h/returning :*)
                       (h/on-conflict :domain_pk :domain_pk_namespace)
                       (h/do-update-set :title)))]
    (db/exec! (-> (h/insert-into :items_in_tags)
                  (h/values (for [item ret2]
                             {:item_id (:items/id item)
                              :tag_id tagid}))))))

(defn post-playlist [req]
  (let [playlist (-> req :body-params)
        username (-> req :session :user_name)]
    (when-not username
      (throw (ex-info "Must be logged in" {:status 401})))
    
    (let [token (get-valid-token username)]
      (when-not token
        (throw (ex-info "No valid Spotify token" {:status 401})))
      
      (let [tag-id (-> (db/exec! 
                        (-> (h/insert-into :tags)
                            (h/values [{:title (:name playlist)
                                      :slug (str "spotify-" (:id playlist))
                                      :owner username
                                      :description "Imported from Spotify"
                                      :domain_pk_namespace "spotify.playlist"
                                      :domain_pk (:id playlist)}])
                            (h/returning :id)))
                       first
                       :id)
            tracks (get-playlist-tracks (:id playlist) token)]
        
        ;; Insert tracks as items
        (let [items (db/exec! 
                    (-> (h/insert-into :items)
                        (h/values
                         (for [track tracks]
                           {:title (-> track :track :name)
                            :domain_pk (-> track :track :id)
                            :domain_pk_namespace "spotify.track"
                            :owner username}))
                        (h/returning :*)))]
          
          ;; Link items to tag
          (db/exec! 
           (-> (h/insert-into :items_in_tags)
               (h/values
                (for [item items]
                  {:item_id (:id item)
                   :tag_id tag-id}))))
          
          {:status 200
           :body {:tag_id tag-id}})))))

(defn refresh-playlist [req]
  (let [token (spotify-token (-> req :session :user_name))
        items (comment (tag/items-in-tag (-> req :params :tagid vector)))
        existing-songs-ids (set (map :items/domain_pk items))
        playlist-songs (get-playlist-tracks (-> req :params :playlist_id)
                                          (:tokens/access_token token))
        playlist-song-ids (->> playlist-songs (map :track) (map :id) set)
        new-songs (->> playlist-songs
                      (filter #(not (contains? existing-songs-ids (-> % :track :id)))))]

    (add-songs-to-tag req (-> req :params :tagid) new-songs)

    {:status 200
     :body {:done true}}))


(defn get-client-token []
  (try
    (when (or (nil? @token) 
              (nil? (:expires_at @token))
              (> (System/currentTimeMillis) (:expires_at @token)))
      (let [response (hc/request {:url "https://accounts.spotify.com/api/token"
                                :method :post
                                :headers {"Authorization" (str "Basic " (oauth/encode-to-base64 (str client-id ":" client-secret)))}
                                :form-params {:grant_type "client_credentials"}})
            body (-> response :body (json/read-str {:key-fn keyword}))
            expires-in (* (:expires_in body) 1000)]
        (reset! token {:access_token (:access_token body)
                      :expires_at (+ (System/currentTimeMillis) expires-in)})))
    (or (:access_token @token)
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
  (search "kendrick-lamar")
  (get-playlist-tracks (first (get-playlists "Kanye West")) @token)
  )

;; Create the standard OAuth route handlers
(def oauth-routes (oauth/create-oauth-routes spotify-provider "spotify"))

;; Export the handlers for use in http.clj
(def handle-auth (-> oauth-routes first second :get :handler))
(def handle-callback (-> oauth-routes second second :get :handler))
(def check-spotify-status (-> oauth-routes (nth 2) second :get :handler))
(def handle-disconnect (-> oauth-routes (nth 3) second :post :handler))

(defn create-spotify-tag
  "Creates a tag for a Spotify entity (artist, album, track) if it doesn't exist"
  [entity-type entity owner]
  (println "Creating spotify tag with:"
           "\nentity-type:" entity-type
           "\nentity:" entity
           "\nowner:" owner)
  ;; First ensure spotify system user exists
  (db/exec! 
   ["INSERT INTO users (user_name, email, password_hash)
     VALUES (?, ?, ?)
     ON CONFLICT (user_name) DO NOTHING"
    "spotify" "spotify@sorter.social" "not-a-real-password"])
  
  (let [title (:name entity)
        slug (sluj title)
        domain-pk-namespace (str "spotify." entity-type)
        domain-pk (:id entity)]
    (db/exec! 
     ["INSERT INTO tags (title, slug, owner, domain_pk_namespace, domain_pk)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (domain_pk_namespace, domain_pk) DO NOTHING
       RETURNING *"
      title slug "spotify" domain-pk-namespace domain-pk])))

(defn get-artist-tracks
  "Get all tracks for an artist from Spotify API"
  [artist-id token]
  (try 
    (let [response (hc/request 
                    {:url (str "https://api.spotify.com/v1/artists/" artist-id "/top-tracks")
                     :method :get
                     :headers {"Authorization" (str "Bearer " token)}
                     :query-params {"market" "US"}})
          tracks (-> response :body (json/read-str {:key-fn keyword}) :tracks)]
      tracks)
    (catch Exception e
      (println "Error getting artist tracks:" (ex-message e))
      [])))

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

(defn retroactively-tag-artist-tracks
  "Find all tracks by an artist and add them to appropriate genre tags"
  [artist-id owner]
  (let [token (get-client-token)
        artist (get-artist-metadata artist-id token)
        existing-tracks (db/exec! 
                        (-> (h/select :items/*)
                            (h/from :items)
                            (h/where [:= :domain_pk_namespace "spotify.track"])))]
    
    ;; For each genre, create tag and add all artist's tracks
    (doseq [genre (:genres artist)]
      (let [genre-tag (first (create-or-get-category-tag (str "genre-" (sluj genre)) owner))]
        (db/exec! 
         (-> (h/insert-into :items_in_tags)
             (h/values
              (for [track existing-tracks]
                {:item_id (:id track)
                 :tag_id (:id genre-tag)}))))))))

(defn import-spotify-entity
  "Main function to handle importing any Spotify entity (artist, album, track)"
  [entity-type entity owner]
  (let [token (get-client-token)
        entity-tag (first (create-spotify-tag entity-type entity owner))
        
        tracks (case entity-type
                "artist" (get-artist-tracks (:id entity) token)
                "album" (get-album-tracks (:id entity) token)
                "track" [entity]
                [])]
    
    (when (and entity-tag tracks)
      (let [items (db/exec! 
                   (-> (h/insert-into :items)
                       (h/values
                        (for [track tracks]
                          {:title (:name track)
                           :slug (sluj (:name track))
                           :domain_pk (:id track)
                           :domain_pk_namespace "spotify.track"
                           :owner owner}))
                       (h/on-conflict [:domain_pk :domain_pk_namespace]
                                    (h/do-nothing))
                       (h/returning :*)))]
        
        (when (seq items)
          {:tag entity-tag
           :items (db/exec! 
                   (-> (h/insert-into :items_in_tags)
                       (h/values
                        (for [item items]
                          {:item_id (:id item)
                           :tag_id (:id entity-tag)}))
                       (h/on-conflict [:item_id :tag_id]
                                    (h/do-nothing))
                       (h/returning :*)))})))))



