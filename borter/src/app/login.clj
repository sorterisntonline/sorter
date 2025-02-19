(ns app.login
  (:require [crypto.password.bcrypt :as password]
            [app.database :as db]
            [honey.sql.helpers :as h]
            [hato.client :as hc]
            [clojure.data.json :as json]
            [clojure.string :as str]))

(def sendgrid-api-key (System/getenv "BORTER_SENDGRID_API_KEY"))

(def environment (or (System/getenv "ENVIRONMENT") "development"))

(defn get-base-url []
  (case environment
    "production" "https://sorter.social"
    "staging" "https://staging.sorter.social"
    "development" "http://localhost:3000"))  ; fallback for development

(defn create-email-content
  "Creates a standardized email structure with customizable content"
  [{:keys [to subject title message action-text action-url extra-text]}]
  {:personalizations [{:to [{:email to}]}]
   :from {:email "noreply@sorter.social"
          :name "sorter noreply"}
   :reply_to {:email "support@sorter.social"
              :name "sorter support"}
   :subject subject
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
</html>")}]})

(defn send-verification-email [email username token]
  (when sendgrid-api-key
    (let [base-url (get-base-url)
          verify-url (str base-url "/verify?token=" token)
          email-content (create-email-content
                        {:to email
                         :subject "Verify your sorter account"
                         :title "Welcome to sorter!"
                         :message (str "<p>Hi " username ",</p>"
                                     "<p>Please verify your email by clicking the link below:</p>")
                         :action-text "Verify Email"
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
    ;; Then create the new confirmation
    (db/exec! (-> (h/insert-into :email_confirmations)
                 (h/values [{:user_name username
                            :token token}])))
    token))

(defn verify-email-token [token]
  (println "Verifying email token:" token)
  (let [confirmation (first (db/exec! (-> (h/select :*)
                                          (h/from :email_confirmations)
                                          (h/where [:= :token token]))))]
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
       :body "Email verified successfully"}
      {:status 400
       :body "Invalid or expired verification token"})))

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
      {:status 401 :body "Invalid username/email or password"}
      (if (password/check (-> r :body-params :password) (:users/password_hash user))
        (cond
          (is-placeholder-email? (:users/email user))
          {:status 403 
           :body "Please set your email address"}
          
          (not (:users/email_verified user))
          {:status 403 
           :body "Please verify your email before logging in"}
          
          :else
          {:status 200 
           :body "logged in"
           :session {:user_name (:users/user_name user)}})
        {:status 401 
         :body "Invalid username/email or password"}))))

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
      (throw (ex-info "Invalid username" {:status 400})))
    (when-not (validate-email email)
      (throw (ex-info "Invalid email address" {:status 400})))
    
    (let [existing-user (first (db/exec! (-> (h/select :*)
                                            (h/from :users)
                                            (h/where [:= :email email]))))]
      (when (and existing-user 
                 (not (is-placeholder-email? (:users/email existing-user))))
        (throw (ex-info "Email already registered" {:status 400}))))
    
    (db/exec! (-> (h/insert-into :users)
                 (h/values [{:user_name username
                            :email email
                            :password_hash (password/encrypt (-> r :body-params :password))
                            :email_verified false}])))
    
    (let [token (create-verification-token username)]
      (send-verification-email email username token))
    
    {:status 200 
     :body "Registration successful. Please check your email to verify your account."}))

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
      {:status 401 :body "Invalid username/email or password"}
      
      (not (password/check password (:users/password_hash user)))
      {:status 401 :body "Invalid username/email or password"}
      
      (:users/email_verified user)
      {:status 400 :body "Email is already verified"}
      
      :else
      (let [token (create-verification-token (:users/user_name user))]
        (send-verification-email (:users/email user) (:users/user_name user) token)
        {:status 200 :body "Verification email sent"}))))


(defn reset-password [username new-pw]
  (db/exec! (-> (h/update :users)
                (h/set {:password_hash (password/encrypt new-pw)})
                (h/where [:= :user_name username]))))

(defn handle-logout [r]
  {:status 200 :body "ok" :session {}})

(defn current-session [r]
  {:status 200 :body (-> r :session)})

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
     :body "Email updated. Please check your inbox for verification."}))


(defn send-password-reset-email [email username token]
  (when sendgrid-api-key
    (let [base-url (get-base-url)
          reset-url (str base-url "/reset-password?token=" token)
          email-content (create-email-content
                        {:to email
                         :subject "Reset your sorter password"
                         :title "Password Reset Request"
                         :message (str "<p>Hi " username ",</p>"
                                     "<p>Someone (hopefully you) requested to reset your password. "
                                     "Click the link below to set a new password:</p>")
                         :action-text "Reset Password"
                         :action-url reset-url
                         :extra-text "<p>If you didn't request this, you can safely ignore this email.</p>"})]
      (hc/post "https://api.sendgrid.com/v3/mail/send"
               {:headers {"Authorization" (str "Bearer " sendgrid-api-key)
                         "Content-Type" "application/json"}
                :body (json/write-str email-content)}))))

(defn create-password-reset-token [username]
  (let [token (generate-verification-token)]
    ;; First delete any existing reset tokens for this user
    (db/exec! (-> (h/delete-from :password_reset_tokens)
                  (h/where [:= :user_name username])))
    ;; Then create the new token
    (db/exec! (-> (h/insert-into :password_reset_tokens)
                  (h/values [{:user_name username
                              :token token
                              :created_at (java.time.Instant/now)}])))
    token))

(defn verify-reset-token [token]
  (let [reset-request (first (db/exec! (-> (h/select :*)
                                           (h/from :password_reset_tokens)
                                           (h/where [:and
                                                     [:= :token token]
                                                     [:> :created_at (-> (java.time.Duration/ofHours 24)
                                                                         (.subtractFrom (java.time.Instant/now)))]]))))]
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
         :body "If an account exists with that email, you will receive password reset instructions."})
      ;; Return the same message even if email doesn't exist (security best practice)
      {:status 200 
       :body "If an account exists with that email, you will receive password reset instructions."})))

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
         :body "Password has been reset successfully"})
      {:status 400 
       :body "Invalid or expired reset token"})))
