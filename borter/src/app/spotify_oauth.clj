(ns app.spotify-oauth
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

(def client-secret (System/getenv "BORTER_SPOTIFY_CLIENT_SECRET"))
(def client-id (System/getenv "BORTER_SPOTIFY_CLIENT_ID"))

(defn ensure-spotify-user [token-info]
  (let [spotify-id (get token-info "id")
        username (str "spotify/" spotify-id)]
    ;; Create user if doesn't exist
    (db/exec!
     ["INSERT INTO users (user_name, email, password_hash)
       VALUES (?, ?, ?)
       ON CONFLICT (user_name) DO NOTHING"
      username
      (get token-info "email")
      "spotify-oauth-user"])
    username))

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
      ;; Create user and return enhanced token info
      (assoc user-info 
             "username" (ensure-spotify-user user-info))))
  
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

(def oauth-routes (oauth/create-oauth-routes spotify-provider "spotify"))
