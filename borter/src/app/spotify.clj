(ns app.spotify
  (:require [app.oauth :as oauth]
            [hato.client :as hc]
            [clojure.data.json :as json]
            [ring.util.codec :as codec]
            [app.database :as db]
            [honey.sql.helpers :as h]
            [sluj.core :refer [ sluj]]
            [ring.util.response :refer [redirect]]
            [app.permissions :as perms])
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
           :scope "playlist-read-private playlist-read-collaborative user-library-read"})))
  
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

(defn get-spotify-auth-url [state]
  (str "https://accounts.spotify.com/authorize?"
       (codec/form-encode
        {:client_id client-id
         :response_type "code"
         :redirect_uri (str (get-hostname) "/api/spotify/callback")
         :state state
         :scope "playlist-read-private playlist-read-collaborative user-library-read"})))

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

(defn api-callback [req]
  (def req req)
  (def code (-> req :params (get "code")))
  
  (def r (-> (hc/request {:as :json
                          :url "https://accounts.spotify.com/api/token"
                          :method :post
                          :headers
                          {"Authorization" (str "Basic " (oauth/encode-to-base64 (str client-id ":" client-secret)))
                           "Content-Type" "application/x-www-form-urlencoded"}
                          :body (str "grant_type=authorization_code"
                                   "&code=" code
                                   "&redirect_uri=" (get-hostname))
                          })
             :body json/read-str))
  
  (let [expires-in (* (get r "expires_in") 1000)  ; Convert to milliseconds
        expires-at (+ (System/currentTimeMillis) expires-in)]
    (db/exec! (-> {:insert-into :tokens
                   :values [{:owner (-> req :session :user_name)
                            :domain_pk_namespace "spotify"
                            :access_token (get r "access_token")
                            :refresh_token (get r "refresh_token")
                            :expires_at expires-at}]}
                  (h/on-conflict :owner :domain_pk_namespace)
                  (h/do-update-set :access_token :refresh_token :expires_at))))
  
  (redirect (-> req :params (get "state"))))

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
  "Search Spotify for items of a specific type (artist, album, or track)"
  [query type]
  (try
    (let [access-token (get-client-token)
          response (hc/request {:url "https://api.spotify.com/v1/search"
                              :method :get
                              :headers {"Authorization" (str "Bearer " access-token)}
                              :query-params {"q" query
                                           "type" type
                                           "limit" 5}})
          results (-> response :body (json/read-str {:key-fn keyword}))]
      (get results (keyword (str type "s")) []))
    (catch Exception e
      (println "Error searching Spotify:" (ex-message e))
      [])))

(defn check-spotify-status [req]
  (let [username (-> req :session :user_name)]
    (if username
      (let [token (get-valid-token username)]
        {:status 200
         :body {:connected (boolean token)}})
      {:status 200
       :body {:connected false
              :reason "not_logged_in"}})))

;; Create routes using the generic OAuth handler
(def route-data 
  {"/api/spotify/auth" {:get {:handler 
                             (fn [req]
                               (let [return-path (get-in req [:params "redirect"] "/")
                                     redirect-uri (str (oauth/get-hostname) "/api/spotify/callback")]
                                 (redirect (.get-auth-url spotify-provider return-path redirect-uri))))}}
   
   "/api/spotify/callback" {:get {:handler 
                                 (fn [req]
                                   (let [code (get-in req [:params "code"])
                                         return-path (get-in req [:params "state"] "/")
                                         redirect-uri (str (oauth/get-hostname) "/api/spotify/callback")
                                         tokens (.exchange-code spotify-provider code redirect-uri)
                                         token-info (.get-token-info spotify-provider tokens)
                                         expires-in (* (get tokens "expires_in") 1000)
                                         expires-at (+ (System/currentTimeMillis) expires-in)]
                                     
                                     ;; Store tokens in database
                                     (db/exec! 
                                      (-> (h/insert-into :tokens)
                                          (h/values [{:owner (-> req :session :user_name)
                                                    :domain_pk_namespace "spotify"
                                                    :access_token (get tokens "access_token")
                                                    :refresh_token (get tokens "refresh_token")
                                                    :expires_at expires-at
                                                    :token_info (json/write-str token-info)}])
                                          (h/on-conflict [:domain_pk_namespace :owner]
                                                       (h/do-update-set :access_token :refresh_token :expires_at :token_info))))
                                     
                                     (redirect return-path)))}}
   
   "/api/spotify/status" {:get {:handler check-spotify-status}}
   "/api/spotify/playlists" {:get {:handler get-playlists}
                            :post {:handler post-playlist}}})

(comment
  (get-playlist-tracks (first (get-playlists "Kanye West")) @token)
  )




