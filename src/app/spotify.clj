(ns app.spotify
  (:require [hato.client :as hc]
            [clojure.data.json :as json]
            [app.database :as db]
            [app.permissions :as perms]
            [honey.sql.helpers :as h]
            [sluj.core :refer [ sluj]]
            [ring.util.response :refer [redirect]]
            [ring.util.codec :as codec])
  (:import [java.util Base64]))


(defn encode-to-base64 [input-str]
  (let [bytes (.getBytes input-str "UTF-8")
        encoded-bytes (.encodeToString (Base64/getEncoder) bytes)]
    encoded-bytes))

(def client_id "e61d249115c9451a8137a2a5af90d76b")
(def client_secret "098f06ddb0a54e29acc89ee7ae766681")

(def token (atom nil))

(defn spotify-token [username]
  "todo automatically refresh token here"
  (first (db/exec! {:select :* :from :tokens :where [:and
                                                     [:= :owner username]
                                                     [:= :domain_pk_namespace "spotify"]]})))

(defn get-playlists [req]
  (def req req)
  (def offset (-> req :params (get "offset") Integer/parseInt))
  (def token (:tokens/access_token (spotify-token (-> req :session :user_name))))
  (let [res (hc/request {:as :json
                         :url (str "https://api.spotify.com/v1/me/playlists?offset=" offset)
                         :method :get
                         :headers
                         {"Authorization" (str "Bearer " token)}})]
    (def res res)
    (-> res :body (json/read-str {:key-fn keyword}) :items))
  )

(comment (get-playlists "sttst"))

(defn log-user-out-of-spotify [username]
  (db/exec! {:delete-from :tokens :where [:and
                                          [:= :owner username]
                                          [:= :domain_pk_namespace "spotify"]]}))

(defn get-token-for [username]
  (-> {:select :* :from :tokens :where [:= :owner username ]} db/exec! first))

(defn refresh-token-for [username]
  (def username username)
  (def tokens (get-token-for username))
  (def r (hc/request {:url "https://accounts.spotify.com/api/token"
                      :method :post
                      :content-type "application/x-www-form-urlencoded"
                      :headers {"Authorization" (str "Basic " (encode-to-base64 (str client_id ":" client_secret)))}
                      :body (codec/form-encode {:grant_type "refresh_token"
                                                :refresh_token (:tokens/refresh_token tokens)})}))
  (def new-tokens (-> r :body (json/read-str {:key-fn keyword})))
  (db/exec! (-> {:insert-into :tokens :values [{:owner username
                                                :refresh_token (:tokens/refresh_token tokens)
                                                :access_token (:access_token new-tokens)
                                                :domain_pk_namespace "spotify"}]}
                (h/on-conflict :domain_pk_namespace :owner)
                (h/do-update-set :access_token)))
  (:access_token new-tokens))

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
  (let [res (hc/request {:as :json
                         :url (str "https://api.spotify.com/v1/users/" (:id (get-self token)) "/playlists/" playlist-id "/tracks")
                         :method :get
                         :headers
                         {"Authorization" (str "Bearer " token)}})]
    (-> res :body (json/read-str {:key-fn keyword})
        :items)))

(comment
  (def token (:tokens/access_token (spotify-token "tommy")))
  
  )

(defn add-songs-to-tag [req tagid songs]
  (def ret2 (db/exec! (->
                       (h/insert-into :items)
                       (h/values
                        (for [song songs] {:items/title (-> song :track :name)
                                           :items/slug (sluj (-> song :track :name))
                                           :items/domain_pk (-> song :track :id)
                                           :items/domain_pk_namespace "spotify.track"
                                           :items/owner (-> req :session :user_name)})) ;; TODO make u/all
                       (h/returning :*)
                       (h/on-conflict :domain_pk :domain_pk_namespace)
                       (h/do-update-set :title))))
  (db/exec! (-> (h/insert-into :items_in_tags)
                (h/values (for [item ret2]
                            {:item_id (:items/id item)
                             :tag_id tagid})))))

(defn post-playlist [req]
  (def req req)
  (def playlist (-> req :params))
  (when (empty? (-> req :session))
    (throw (ex-info "need to be logged in" {:status 401}))) 
  "make appropriate tag"
  (def ret (db/exec! (-> (h/insert-into :tags)
                         (h/values [{:tags/title (-> playlist :name)
                                     :tags/slug (sluj (-> playlist :name))
                                     :tags/owner (-> req :session :user_name)
                                     :tags/description "from a spotify playlist"
                                     :tags/domain_pk_namespace "spotify.playlist"
                                     :tags/domain_pk (-> playlist :id)
                                     :tags/ns "spotify"}])
                         (h/returning :*))))
  "make tag permissions"
  (def tagid (:tags/id (first ret)))
  (db/exec! {:insert-into :perms :values (perms/public-permissions tagid)})
  (def songs (get-playlist-tracks (-> playlist :id) (:tokens/access_token (spotify-token (-> req :session :user_name)))))

  (add-songs-to-tag req tagid songs)
  
  {:status 200
   :body {:ok true}})

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

(defn get-hostname []
  (case (.getCanonicalHostName (java.net.InetAddress/getLocalHost))
    "sorter.social" "https://sorter.social/api/spotify/callback"
    "http://localhost:3000/api/spotify/callback"))

(defn api-callback [req]
  (def req req)
  (def code (-> req :params (get "code")))
  
  (def r (-> (hc/request {:as :json
                          :url "https://accounts.spotify.com/api/token"
                          :method :post
                          :headers
                          {"Authorization" (str "Basic " (encode-to-base64 (str client_id ":" client_secret)))
                           "Content-Type" "application/x-www-form-urlencoded"}
                          :body (str "grant_type=authorization_code"
                                     "&code=" code
                                     "&redirect_uri=" (get-hostname))
                          })
             :body json/read-str))
  
  (db/exec! (-> {:insert-into :tokens
                 :values [{:owner (-> req :session :user_name)
                           :domain_pk_namespace "spotify"
                           :access_token (get r "access_token")
                           :refresh_token (get r "refresh_token")}]}
                (h/on-conflict :owner :domain_pk_namespace)
                (h/do-update-set :access_token :refresh_token)))
  
  (redirect (-> req :params (get "state"))))

(def routes [["/callback" {:get {:handler #'api-callback}}]
             
             ["/playlists" {:get {:handler (fn [req]
                                             (def req req)
                                             {:status 200
                                              :body (get-playlists req)})}
                            :post {:handler #'post-playlist}}]
             ["/playlist" {:get {:handler (fn [req]
                                            (def req req)
                                            (def playlist-id (-> req :params (get "id")))
                                            {:status 200
                                             :body (get-playlist-tracks playlist-id
                                                                        (:tokens/access_token (spotify-token (-> req :session :user_name))))})}
                           :post {:handler #'post-playlist}}]
             ["/playlist/refresh" {:post {:handler #'refresh-playlist}}]])

(comment
  (get-playlist-tracks (first (get-playlists "Kanye West")) @token)
  )




