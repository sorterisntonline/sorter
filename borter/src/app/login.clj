(ns app.login
  (:require [crypto.password.bcrypt :as password]
            [app.database :as db]
            [app.util :as util]
            [honey.sql.helpers :as h]
            [hato.client :as hc]
            [clojure.data.json :as json]
            [clojure.tools.logging :as log]
            [clojure.string :as str]))

(def sendgrid-api-key (System/getenv "BORTER_SENDGRID_API_KEY"))

(def environment (or (System/getenv "ENVIRONMENT") "development"))

(defn get-base-url []
  (util/get-base-url))

(defn create-email-content
  "Creates a standardized email structure with customizable content"
  [{:keys [to subject title message action-text action-url extra-text]}]
  (let [env-suffix (case environment
                    "staging" " (staging)"
                    "development" " (testing)"
                    "")  ; no suffix for production
        full-subject (str subject env-suffix)]
    {:personalizations [{:to [{:email to}]}]
     :from {:email "noreply@sorter.social"
            :name "sorter noreply"}
     :reply_to {:email "support@sorter.social"
                :name "sorter support"}
     :subject full-subject
     :content [{:type "text/html"
                :value (str "<!DOCTYPE html>
<html>
<head>
  <meta charset='utf-8'>
  <meta name='viewport' content='width=device-width, initial-scale=1.0'>
  <title>" subject "</title>
</head>
<body style='margin: 0; padding: 20px; font-family: Arial, sans-serif; line-height: 1.6; color: #333;'>
  <div style='max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);'>
    <h1 style='color: #6B46C1; margin-bottom: 20px; text-align: center;'>" title "</h1>
    " message "
    <div style='text-align: center; margin: 30px 0;'>
      <a href='" action-url "' style='display: inline-block; background: #6B46C1; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;'>" 
                        action-text 
                        "</a>
      <p style='margin-top: 20px; word-break: break-all; font-size: 0.9em; color: #666;'>
        Or copy this link: <a href='" action-url "' style='color: #6B46C1; text-decoration: underline;'>" action-url "</a>
      </p>
    </div>
    " (when extra-text (str "<p style='color: #666; font-size: 0.9em;'>" extra-text "</p>")) "
  </div>
</body>
</html>")}]}))

(defn send-verification-email [email username token]
  (when sendgrid-api-key
    (let [base-url (get-base-url)
          verify-url (str base-url "/verify?token=" token)
          email-content (create-email-content
                         {:to email
                          :subject "verify your sorter account"
                          :title "welcome to sorter!"
                          :message (str "<p>hi " username ",</p>"
                                      "<p>please verify your email by clicking below:</p>")
                          :action-text "verify email"
                          :action-url verify-url})]
      (hc/post "https://api.sendgrid.com/v3/mail/send"
               {:headers {"Authorization" (str "Bearer " sendgrid-api-key)
                          "Content-Type" "application/json"}
                :body (json/write-str email-content)}))))

(defn generate-verification-token []
  (let [random-bytes (byte-array 32)]
    (.nextBytes (java.security.SecureRandom.) random-bytes)
    (str/replace (.encodeToString (java.util.Base64/getUrlEncoder) random-bytes) "=" "")))

(defn create-verification-token [username]
  (let [token (generate-verification-token)]
    ;; First delete any existing confirmations for this user
    (db/exec! (-> (h/delete-from :email_confirmations)
                 (h/where [:= :user_name username])))
    ;; Then create the new confirmation with expiration
    (db/exec! (-> (h/insert-into :email_confirmations)
                 (h/values [{:user_name username
                             :token token
                             :expires_at [:cast 
                                          (str (-> (java.time.Duration/ofMinutes 10)
                                                 (.addTo (java.time.Instant/now))))
                                          :timestamp]}])))
    token))

(defn verify-email-token [token]
  (println "Verifying email token:" token)
  (let [confirmation (first (db/exec! (-> (h/select :*)
                                         (h/from :email_confirmations)
                                         (h/where [:and
                                                   [:= :token token]
                                                   [:> :expires_at [:cast (str (java.time.Instant/now)) :timestamp]]]))))]
    (when confirmation
      (db/exec! (-> (h/update :users)
                    (h/set {:email_verified true})
                    (h/where [:= :user_name (:email_confirmations/user_name confirmation)])))
      (db/exec! (-> (h/delete-from :email_confirmations)
                    (h/where [:= :token token])))
      true)))

(defn handle-verify-email [r]
  (let [token (-> r :query-params (get "token"))]
    (if (verify-email-token token)
      {:status 200
       :body {:success true
              :message "email verified successfully"}}
      {:status 400
       :body {:message "invalid or expired verification token"}})))

(defn is-placeholder-email? [email]
  (str/ends-with? email "@placeholder.com"))

(defn handle-login [r]
  (let [login-id (-> r :body-params :user_name)
        user (first (db/exec! (-> (h/select :*)
                                 (h/from :users)
                                 (h/where [:or
                                           [:= :user_name login-id]
                                           [:= :email login-id]]))))]
    (if (nil? user)
      {:status 401 :body {:message "invalid username/email or password"}}
      (if (password/check (-> r :body-params :password) (:users/password_hash user))
        (cond
          (is-placeholder-email? (:users/email user))
          {:status 403 
           :body {:message "please set your email address"}}
          
          (not (:users/email_verified user))
          {:status 403 
           :body {:message "please verify your email before logging in"}}
          
          :else
          {:status 200 
           :body {:success true
                  :user_name (:users/user_name user)}
           :session {:user_name (:users/user_name user)}})
        {:status 401 
         :body {:message "invalid username/email or password"}}))))

(defn validate-username [username]
  (let [regex #"^(?!_)(?!.*?_$)[a-zA-Z0-9_]{3,20}$"]
    (re-matches regex username)))

(defn validate-email [email]
  (let [regex #"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"]
    (re-matches regex email)))

(defn handle-register [r]
  (let [username (-> r :body-params :user_name)
        email (-> r :body-params :email)]
    (when-not (validate-username username)
      (throw (ex-info "invalid username" {:status 400})))
    (when-not (validate-email email)
      (throw (ex-info "invalid email address" {:status 400})))
    
    (let [existing-user (first (db/exec! (-> (h/select :*)
                                            (h/from :users)
                                            (h/where [:= :email email]))))]
      (when (and existing-user 
                 (not (is-placeholder-email? (:users/email existing-user))))
        (throw (ex-info "email already registered" {:status 400}))))
    
    (db/exec! (-> (h/insert-into :users)
                 (h/values [{:user_name username
                             :email email
                             :password_hash (password/encrypt (-> r :body-params :password))
                             :email_verified false}])))
    
    (let [token (create-verification-token username)]
      (send-verification-email email username token))
    
    {:status 200 
     :body {:success true
            :message "registration successful. please check your email to verify your account."}}))

(defn handle-resend-verification [r]
  (let [login-id (-> r :body-params :email)
        password (-> r :body-params :password)
        user (first (db/exec! (-> (h/select :*)
                                  (h/from :users)
                                  (h/where [:or
                                            [:= :user_name login-id]
                                            [:= :email login-id]]))))]
    (cond
      (nil? user)
      {:status 401 :body {:message "invalid username/email or password"}}
      
      (not (password/check password (:users/password_hash user)))
      {:status 401 :body {:message "invalid username/email or password"}}
      
      (:users/email_verified user)
      {:status 400 :body {:message "email is already verified"}}
      
      :else
      (let [token (create-verification-token (:users/user_name user))]
        (send-verification-email (:users/email user) (:users/user_name user) token)
        {:status 200 :body {:success true
                            :message "verification email sent"}}))))


(defn reset-password [username new-pw]
  (db/exec! (-> (h/update :users)
                (h/set {:password_hash (password/encrypt new-pw)})
                (h/where [:= :user_name username]))))

(defn handle-logout [r] {:status 200 :body {:success true} :session {}})

(defn handle-update-email [r]
  (let [username (-> r :body-params :user_name)
        new-email (-> r :body-params :email)]
    (when-not (validate-email new-email)
      (throw (ex-info "Invalid email address" {:status 400})))
    
    (let [existing-user (first (db/exec! (-> (h/select :*)
                                            (h/from :users)
                                            (h/where [:and 
                                                      [:= :email new-email]
                                                      [:not= :user_name username]]))))]
      (when (and existing-user 
                 (not (is-placeholder-email? (:users/email existing-user))))
        (throw (ex-info "Email already registered" {:status 400}))))
    
    (db/exec! (-> (h/update :users)
                 (h/set {:email new-email
                         :email_verified false})
                 (h/where [:= :user_name username])))
    
    (let [token (create-verification-token username)]
      (send-verification-email new-email username token))
    
    {:status 200 
     :body {:success true
            :message "email updated. please check your inbox for verification."}}))


(defn send-password-reset-email [email username token]
  (when sendgrid-api-key
    (let [base-url (get-base-url)
          reset-url (str base-url "/reset-password?token=" token)
          email-content (create-email-content
                         {:to email
                          :subject "reset your sorter password"
                          :title "reset your password"
                          :message (str "<p>hi " username ",</p>"
                                      "<p>someone (hopefully you) asked to reset your password. "
                                      "click below to set a new one:</p>")
                          :action-text "reset password"
                          :action-url reset-url
                          :extra-text "<p>if you didn't request this, you can ignore this email</p>"})]
      (hc/post "https://api.sendgrid.com/v3/mail/send"
               {:headers {"Authorization" (str "Bearer " sendgrid-api-key)
                          "Content-Type" "application/json"}
                :body (json/write-str email-content)}))))

(defn create-password-reset-token [username]
  (let [token (generate-verification-token)]
    ;; First delete any existing reset tokens for this user
    (db/exec! (-> (h/delete-from :password_reset_tokens)
                  (h/where [:= :user_name username])))
    ;; Then create the new token with expiration
    (db/exec! (-> (h/insert-into :password_reset_tokens)
                  (h/values [{:user_name username
                              :token token
                              :expires_at [:cast 
                                           (str (-> (java.time.Duration/ofMinutes 10)
                                                  (.addTo (java.time.Instant/now))))
                                           :timestamp]}])))
    token))

(defn verify-reset-token [token]
  (let [reset-request (first (db/exec! (-> (h/select :*)
                                          (h/from :password_reset_tokens)
                                          (h/where [:and
                                                    [:= :token token]
                                                    [:> :expires_at [:cast (str (java.time.Instant/now)) :timestamp]]]))))]
    (when reset-request
      (:password_reset_tokens/user_name reset-request))))

(defn handle-forgot-password [r]
  (let [email (-> r :body-params :email)
        user (first (db/exec! (-> (h/select :*)
                                  (h/from :users)
                                  (h/where [:= :email email]))))]
    (if (and user (not (is-placeholder-email? (:users/email user))))
      (let [token (create-password-reset-token (:users/user_name user))]
        (send-password-reset-email 
         (:users/email user)
         (:users/user_name user)
         token)
        {:status 200 
         :body {:success true
                :message "if an account exists with that email, you will receive password reset instructions."}})
      ;; Return the same message even if email doesn't exist (security best practice)
      {:status 200 
       :body {:success true
              :message "if an account exists with that email, you will receive password reset instructions."}})))

(defn handle-reset-password [r]
  (let [token (-> r :body-params :token)
        new-password (-> r :body-params :password)
        username (verify-reset-token token)]
    (if username
      (do
        (reset-password username new-password)
        ;; Clean up the used token
        (db/exec! (-> (h/delete-from :password_reset_tokens)
                      (h/where [:= :token token])))
        {:status 200 
         :body {:success true
                :message "password has been reset successfully"}})
      {:status 400 
       :body {:message "invalid or expired reset token"}})))

(defn check-existing-user-by-email [email]
  (first (db/exec! (-> (h/select :*)
                       (h/from :users)
                       (h/where [:and
                                 [:= :email email]
                                 [:not= :email (str email "@placeholder.com")]])))))

(defn check-existing-user-by-username [username]
  (first (db/exec! (-> (h/select :*)
                       (h/from :users)
                       (h/where [:= :user_name username])))))

(defn generate-unique-username [base-username]
  (if (nil? (check-existing-user-by-username base-username))
    base-username
    (loop [counter 1]
      (let [username (str base-username counter)]
        (if (nil? (check-existing-user-by-username username))
          username
          (recur (inc counter)))))))

(defn create-user-from-auth0 [auth0-id email username picture]
  (let [unique-username (generate-unique-username username)
        temp-password (generate-verification-token)]
    (db/exec! (-> (h/insert-into :users)
                 (h/values [{:user_name unique-username
                             :email email
                             :password_hash (password/encrypt temp-password)
                             :email_verified true
                             :auth0_id auth0-id
                             :pfp_url picture}])))
    (let [user (first (db/exec! (-> (h/select :*)
                                    (h/from :users)
                                    (h/where [:= :user_name unique-username]))))]
      (when-not (= unique-username username)
        ;; The username needed to be modified, so we need to flag this somehow
        ;; This is a placeholder until we implement a proper username setting mechanism
        (log/info "Generated unique username" unique-username "from base" username))
      user)))

(defn update-user-auth0-info [user-id auth0-id picture]
  (db/exec! (-> (h/update :users)
               (h/set {:auth0_id auth0-id
                       :pfp_url picture})
               (h/where [:= :user_name user-id]))))

(defn link-account-to-platform [username platform platform-user-id access-token refresh-token]
  (db/exec! (-> (h/insert-into :linked_accounts)
               (h/values [{:user_name username
                           :platform platform
                           :platform_user_id platform-user-id
                           :access_token access-token
                           :refresh_token refresh-token}])
               (h/on-conflict :user_name :platform)
               (h/do-update-set {:platform_user_id platform-user-id
                                 :access_token access-token
                                 :refresh_token refresh-token
                                 :updated_at [:cast (str (java.time.Instant/now)) :timestamp]}))))

(defn link-existing-account [username auth0-id picture]
  (let [user (first (db/exec! (-> (h/select :*)
                                  (h/from :users)
                                  (h/where [:= :user_name username]))))]
    (when user
      (update-user-auth0-info username auth0-id picture)
      user)))

(defn handle-auth0-login [r]
  (let [auth0-id (-> r :body-params :auth0_id)
        email (-> r :body-params :email)
        username (-> r :body-params :username)
        picture (-> r :body-params :picture) ;; This might be nil, but that's ok
        platform (-> r :body-params :platform) ;; The platform/provider (e.g., "discord", "github", "google")
        platform-user-id (-> r :body-params :platform_user_id) ;; The user ID from the platform
        
        ;; Look for existing user by auth0_id (for backward compatibility)
        existing-user-by-auth0 (first (db/exec! (-> (h/select :*)
                                                    (h/from :users)
                                                    (h/where [:= :auth0_id auth0-id]))))
        
        ;; Look for existing linked account
        existing-linked-account (when (and platform platform-user-id)
                                  (first (db/exec! (-> (h/select :*)
                                                       (h/from :linked_accounts)
                                                       (h/where [:and
                                                                 [:= :platform platform]
                                                                 [:= :platform_user_id platform-user-id]])))))
        
        ;; Get the user from the linked account
        existing-user-by-platform (when existing-linked-account
                                    (first (db/exec! (-> (h/select :*)
                                                         (h/from :users)
                                                         (h/where [:= :user_name (:linked_accounts/user_name existing-linked-account)])))))]
    
    (cond
      ;; User already exists with this linked platform account - just login
      existing-user-by-platform
      {:status 200
       :body {:success true
              :user_name (:users/user_name existing-user-by-platform)
              :needs_username_setup false}
       :session {:user_name (:users/user_name existing-user-by-platform)}}
      
      ;; For backward compatibility - user exists with auth0_id
      existing-user-by-auth0
      (do
        ;; Create a linked account entry if it doesn't exist yet
        (when (and platform platform-user-id (not existing-linked-account))
          (link-account-to-platform (:users/user_name existing-user-by-auth0) platform platform-user-id nil nil)
          
          ;; For Discord backward compatibility
          (when (= platform "discord")
            (db/exec! (-> (h/update :users)
                          (h/set {:discord_id platform-user-id})
                          (h/where [:= :user_name (:users/user_name existing-user-by-auth0)])))))
        
        {:status 200
         :body {:success true
                :user_name (:users/user_name existing-user-by-auth0)
                :needs_username_setup false}
         :session {:user_name (:users/user_name existing-user-by-auth0)}})

      ;; User exists with this email but not linked to any platform yet
      (and email (check-existing-user-by-email email))
      {:status 200
       :body {:success true
              :needs_account_linking true
              :email email
              :platform platform
              :platform_user_id platform-user-id}}

      ;; New user 
      :else
      (let [new-user (create-user-from-auth0 auth0-id email username picture)
            generated-username (:users/user_name new-user)
            needs-username-setup (not= generated-username username)]
        
        ;; Create the linked account entry
        (when (and platform platform-user-id)
          (link-account-to-platform generated-username platform platform-user-id nil nil)
          
          ;; For Discord backward compatibility
          (when (= platform "discord")
            (db/exec! (-> (h/update :users)
                          (h/set {:discord_id platform-user-id})
                          (h/where [:= :user_name generated-username])))))
        
        {:status 200
         :body {:success true
                :user_name generated-username
                :needs_username_setup needs-username-setup}
         :session {:user_name generated-username}}))))

(defn handle-account-linking [r]
  (let [username (-> r :body-params :user_name)
        password (-> r :body-params :password)
        auth0-id (-> r :body-params :auth0_id)
        picture (-> r :body-params :picture)
        platform (-> r :body-params :platform)
        platform-user-id (-> r :body-params :platform_user_id)
        
        user (first (db/exec! (-> (h/select :*)
                                  (h/from :users)
                                  (h/where [:= :user_name username]))))]
    
    (if (and user (password/check password (:users/password_hash user)))
      (do 
        ;; Update auth0_id and picture for backward compatibility
        (update-user-auth0-info username auth0-id picture)
        
        ;; Create the linked account entry
        (when (and platform platform-user-id)
          (link-account-to-platform username platform platform-user-id nil nil)
          
          ;; For Discord backward compatibility
          (when (= platform "discord")
            (db/exec! (-> (h/update :users)
                          (h/set {:discord_id platform-user-id})
                          (h/where [:= :user_name username])))))
        
        {:status 200
         :body {:success true
                :user_name username}
         :session {:user_name username}})
      
      {:status 401
       :body {:message "invalid username/email or password"}})))

(defn handle-username-setup [r]
  (let [current-username (-> r :session :user_name)
        new-username (-> r :body-params :user_name)]
    (if (nil? current-username)
      {:status 401
       :body {:message "must be logged in"}}
      (if (check-existing-user-by-username new-username)
        {:status 400
         :body {:message "username already taken"}}
        (do
          (db/exec! (-> (h/update :users)
                        (h/set {:user_name new-username})
                        (h/where [:= :user_name current-username])))
          {:status 200
           :body {:success true
                  :user_name new-username}
           :session {:user_name new-username}})))))

(defn get-linked-accounts [r]
  (let [username (-> r :session :user_name)]
    (if (nil? username)
      {:status 401
       :body {:message "must be logged in to view linked accounts"}}
      (let [linked-accounts (db/exec! (-> (h/select :*)
                                         (h/from :linked_accounts)
                                         (h/where [:= :user_name username])))]
        {:status 200
         :body {:linked_accounts (map (fn [account]
                                       {:platform (:linked_accounts/platform account)
                                        :platform_user_id (:linked_accounts/platform_user_id account)
                                        :created_at (:linked_accounts/created_at account)
                                        :updated_at (:linked_accounts/updated_at account)})
                                     linked-accounts)}}))))

(defn unlink-account [r]
  (let [username (-> r :session :user_name)
        platform (-> r :body-params :platform)]
    (if (nil? username)
      {:status 401
       :body {:message "must be logged in to unlink accounts"}}
      (if (nil? platform)
        {:status 400
         :body {:message "platform parameter is required"}}
        (let [linked-accounts (db/exec! (-> (h/select :*)
                                           (h/from :linked_accounts)
                                           (h/where [:and
                                                     [:= :user_name username]
                                                     [:= :platform platform]])))
              count-linked (count (db/exec! (-> (h/select :*)
                                               (h/from :linked_accounts)
                                               (h/where [:= :user_name username]))))]
          ;; Don't allow unlinking the last account unless they have password auth
          (if (and (= count-linked 1) 
                  (not (first (db/exec! (-> (h/select :password_hash)
                                           (h/from :users)
                                           (h/where [:and
                                                     [:= :user_name username]
                                                     [:<> :password_hash ""]])))))) 
            {:status 400
             :body {:message "cannot unlink last authentication method"}}
            (do
              ;; Remove the linked account
              (db/exec! (-> (h/delete-from :linked_accounts)
                           (h/where [:and
                                     [:= :user_name username]
                                     [:= :platform platform]])))
              
              ;; For Discord backward compatibility - clear discord_id if unlinking Discord
              (when (= platform "discord")
                (db/exec! (-> (h/update :users)
                             (h/set {:discord_id nil})
                             (h/where [:= :user_name username]))))
              
              {:status 200
               :body {:success true
                      :message (str platform " account unlinked successfully")}})))))))

;; Define routes
(def routes
  ["/auth" {:swagger {:tags ["auth"]}}
   
   ["/login" {:post {:handler handle-login
                     :parameters {:body {:user_name string?
                                         :password string?}}
                     :responses {200 {:body {:success boolean?
                                             :user_name string?}}
                                 401 {:body {:message string?}}
                                 403 {:body {:message string?}}}}}]
   
   ["/logout" {:post {:handler handle-logout}}]
   
   ["/register" {:post {:handler handle-register
                        :parameters {:body {:user_name string?
                                            :email string?
                                            :password string?}}}}]
   
   ["/verify" {:get {:handler handle-verify-email
                     :parameters {:query {:token string?}}}}]
   
   ["/resend-verification" {:post {:handler handle-resend-verification
                                   :parameters {:body {:email string?
                                                       :password string?}}}}]
   
   ["/forgot-password" {:post {:handler handle-forgot-password
                               :parameters {:body {:email string?}}}}]
   
   ["/reset-password" {:post {:handler handle-reset-password
                              :parameters {:body {:token string?
                                                  :password string?}}}}]
   
   ["/update-email" {:post {:handler handle-update-email
                            :parameters {:body {:user_name string?
                                                :email string?}}}}]
   
   ["/auth0" {:post {:handler handle-auth0-login
                     :parameters {:body {:auth0_id string?
                                         :email string?
                                         :username string?
                                         :picture string?
                                         :platform string?
                                         :platform_user_id string?}}}}]
   
   ["/link-account" {:post {:handler handle-account-linking
                            :parameters {:body {:user_name string?
                                                :password string?
                                                :auth0_id string?
                                                :picture string?
                                                :platform string?
                                                :platform_user_id string?}}}}]
   
   ["/username-setup" {:post {:handler handle-username-setup
                              :parameters {:body {:user_name string?}}}}]
   
   ["/linked-accounts" {:get {:handler get-linked-accounts}}]
   
   ["/unlink-account" {:post {:handler unlink-account
                              :parameters {:body {:platform string?}}}}]])
