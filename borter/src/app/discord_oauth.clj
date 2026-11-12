(ns app.discord-oauth
  (:require [clojure.data.json :as json]
            [hato.client :as hc]
            [app.oauth :as oauth]
            [app.database :as db] 
            [honey.sql.helpers :as h]
            [ring.util.response :refer [redirect]]
            [ring.util.codec :as codec]))

(def client-id (System/getenv "DISCORD_CLIENT_ID"))
(def client-secret (System/getenv "DISCORD_CLIENT_SECRET"))

(defn discord-auth-url
  "Generate Discord OAuth URL for the /link command"
  [req]
  (let [return-path (or (-> req :params (get "redirect")) "/")
        redirect-uri (str (oauth/get-hostname) "/api/auth/discord/callback")
        state (codec/url-encode return-path)
        scope "identify"]
    {:status 200
     :body {:url (str "https://discord.com/api/oauth2/authorize"
                     "?client_id=" client-id
                     "&redirect_uri=" (codec/url-encode redirect-uri)
                     "&response_type=code"
                     "&state=" state
                     "&scope=" scope)}}))

(defrecord DiscordOAuthProvider []
  oauth/OAuthProvider
  (get-auth-url [_ state redirect-uri]
    (str "https://discord.com/api/oauth2/authorize"
         "?client_id=" client-id
         "&redirect_uri=" (codec/url-encode redirect-uri)
         "&response_type=code"
         "&state=" state
         "&scope=identify"))
  
  (exchange-code [_ code redirect-uri]
    (let [response (hc/post "https://discord.com/api/oauth2/token"
                            {:form-params {"client_id" client-id
                                           "client_secret" client-secret
                                           "grant_type" "authorization_code"
                                           "code" code
                                           "redirect_uri" redirect-uri}
                             :as :json})]
      (:body response)))
  
  (get-token-info [_ tokens]
    (let [access-token (get tokens "access_token")
          response (hc/get "https://discord.com/api/users/@me"
                          {:headers {"Authorization" (str "Bearer " access-token)}
                           :as :json})
          discord-user (:body response)]
      {"username" (get discord-user "username")
       "id" (get discord-user "id")
       "avatar" (get discord-user "avatar")
       "discriminator" (get discord-user "discriminator")}))
  
  (refresh-token [_ refresh-token]
    (let [response (hc/post "https://discord.com/api/oauth2/token"
                            {:form-params {"client_id" client-id
                                           "client_secret" client-secret
                                           "grant_type" "refresh_token"
                                           "refresh_token" refresh-token}
                             :as :json})]
      (:body response))))

(def discord-provider (->DiscordOAuthProvider))

(defn link-discord-account
  "Links a Discord account to a Sorter account"
  [sorter-username discord-user-id discord-username]
  (let [temp-username (str "@discord_" discord-username)
        temp-user (first (db/exec! (-> (h/select :users/*)
                                      (h/from :users)
                                      (h/where [:= :user_name temp-username]))))]
    
    ;; If temp account exists, merge its data
    (when temp-user)
      ;; TODO: Implement merging logic for votes, items, tags, etc.
      ;; Update all references to temp-username to sorter-username
      
    
    ;; Update the user's Discord ID (for backward compatibility)
    (db/exec! (-> (h/update :users)
                  (h/set {:discord_id discord-user-id})
                  (h/where [:= :user_name sorter-username])))
    
    ;; Add to linked_accounts table
    (db/exec! (-> (h/insert-into :linked_accounts)
                  (h/values [{:user_name sorter-username
                              :platform "discord"
                              :platform_user_id discord-user-id}])
                  (h/on-conflict :user_name :platform)
                  (h/do-update-set {:platform_user_id discord-user-id
                                    :updated_at [:cast (str (java.time.Instant/now)) :timestamp]})))
    
    {:message "discord account linked successfully"}))

(defn handle-discord-auth
  "Handle Discord OAuth callback"
  [req]
  (let [code (-> req :params (get "code"))
        return-path (-> req :params (get "state") codec/url-decode)
        redirect-uri (str (oauth/get-hostname) "/api/auth/discord/callback")
        tokens (oauth/exchange-code discord-provider code redirect-uri)
        token-info (oauth/get-token-info discord-provider tokens)
        discord-id (get token-info "id")
        discord-username (get token-info "username")
        
        ;; Check if there's an existing user with this Discord ID
        existing-user (first (db/exec! (-> (h/select :users/*)
                                           (h/from :users)
                                           (h/where [:= :discord_id discord-id]))))
        
        ;; Check if there's a temporary Discord user
        temp-username (str "@discord_" discord-username)
        temp-user (first (db/exec! (-> (h/select :users/*)
                                       (h/from :users)
                                       (h/where [:= :user_name temp-username]))))
        
        ;; Get currently logged in user (if any)
        current-user (-> req :session :user_name)]
    
    (cond
      ;; User already linked with this Discord account - just login
      existing-user
      (-> (redirect return-path)
          (assoc :session {:user_name (:users/user_name existing-user)})
          (assoc-in [:flash :message] "logged in with discord"))
      
      ;; User is logged in - link accounts
      current-user
      (do
        ;; Link Discord to current account - use local implementation
        (link-discord-account current-user discord-id discord-username)
        (-> (redirect return-path)
            (assoc-in [:flash :message] "discord account linked")))
      
      ;; Temporary user exists - upgrade to permanent
      temp-user
      (-> (redirect (str "/register?discord_id=" discord-id 
                         "&discord_username=" (codec/url-encode discord-username)
                         "&upgrade_temp=true"
                         "&return_path=" (codec/url-encode return-path)))
          (assoc :session {:temp_discord {:id discord-id
                                          :username discord-username}}))
      
      ;; New user - redirect to registration
      :else
      (-> (redirect (str "/register?discord_id=" discord-id 
                         "&discord_username=" (codec/url-encode discord-username)
                         "&return_path=" (codec/url-encode return-path)))
          (assoc :session {:temp_discord {:id discord-id
                                          :username discord-username}})))))

;; Routes for Discord OAuth
(def oauth-routes (oauth/create-oauth-routes discord-provider "discord"))
;; Remove this unused separate route definition
;; (def discord-auth-routes
;;   [["/auth/discord"
;;     ["/url" {:get {:handler #'discord-auth-url}}]
;;     ["/callback" {:get {:handler #'handle-discord-auth}}]]]) 