(ns app.discord
  (:require [app.database :as db]
            [honey.sql.helpers :as h]
            [app.discord-oauth :as discord-oauth]
            [clojure.tools.logging :as log]))

(def discord-bot-token (System/getenv "DISCORD_BOT_TOKEN"))

(defn validate-discord-request
  "Validates if a request is coming from our Discord bot"
  [auth-header]
  (and discord-bot-token
       auth-header
       (= (str "Bearer " discord-bot-token) auth-header)))

(defn get-or-create-discord-user
  "Get existing user linked to Discord or create temporary Discord user"
  [discord-user-id discord-username]
  (try
    (let [;; First check if there's a linked account
          _ (log/debug "Checking for linked Discord user:" discord-user-id)
          linked-user (first (db/exec! (-> (h/select :users/*)
                                          (h/from :users)
                                          (h/where [:= :discord_id discord-user-id]))))
          ;; If no linked account, check for temporary account
          temp-username (str "@discord_" discord-username)
          _ (log/debug "Checking for temp Discord user:" temp-username)
          temp-user (when-not linked-user
                      (first (db/exec! (-> (h/select :users/*)
                                          (h/from :users)
                                          (h/where [:= :user_name temp-username])))))]
      
      (log/debug "Linked user found:" linked-user)
      (log/debug "Temp user found:" temp-user)
      
      (cond
        ;; Return linked user if exists
        linked-user 
        (do
          (log/info "Using existing linked Discord user:" (:users/user_name linked-user))
          linked-user)
        
        ;; Return temp user if exists
        temp-user 
        (do
          (log/info "Using existing temp Discord user:" (:users/user_name temp-user))
          temp-user)
        
        ;; Create temp user if neither exists
        :else 
        (let [email (str temp-username "@placeholder.com")]
          (log/info "Creating new temp Discord user:" temp-username)
          (try
            (db/exec! (-> (h/insert-into :users)
                          (h/values [{:user_name temp-username
                                      :email email
                                      :password_hash "" ; No password for temp accounts
                                      :email_verified false ; Changed to false - temp accounts should require verification
                                      }]))) ; Removed discord_id from temp accounts
            (log/info "Successfully created temp Discord user:" temp-username)
            (let [new-user (first (db/exec! (-> (h/select :users/*)
                                                (h/from :users)
                                                (h/where [:= :user_name temp-username]))))]
              (log/debug "Retrieved new user:" new-user)
              new-user)
            (catch Exception e
              (log/error e "Error creating Discord user")
              (throw e))))))
    (catch Exception e
      (log/error e "Error in get-or-create-discord-user")
      (throw e))))

(defn handle-account-link
  "HTTP handler for linking discord accounts"
  [req]
  (let [discord-user-id (get-in req [:body-params :discord_user_id])
        discord-username (get-in req [:body-params :discord_username])
        sorter-username (get-in req [:session :user_name])]
    
    (when-not sorter-username
      (throw (ex-info "must be logged in to link accounts" {:status 401})))
    
    (when-not (and discord-user-id discord-username)
      (throw (ex-info "missing discord info" {:status 400})))
    
    ;; Check if this Discord ID is already linked to another account
    (let [existing-user (first (db/exec! (-> (h/select :users/*)
                                             (h/from :users)
                                             (h/where [:and 
                                                      [:= :discord_id discord-user-id]
                                                      [:not= :user_name sorter-username]]))))]
      
      (if existing-user
        ;; Already linked to another account - warn the user
        {:status 400
         :body {:message (str "discord account already linked to user "
                             (:users/user_name existing-user))}}
        
        ;; Not linked - proceed with linking
        {:status 200
         :body (discord-oauth/link-discord-account sorter-username discord-user-id discord-username)}))))



;; Add routes definition at the end of the file
(def routes 
  (concat
    [["/link" {:post {:handler #'handle-account-link}}]]
    ;; Include OAuth routes from discord-oauth directly
    discord-oauth/oauth-routes))