(ns app.login
  (:require [crypto.password.bcrypt :as password]
            [app.database :as db]
            [honey.sql.helpers :as h]
            [clj-http.client :as http]
            [clojure.data.json :as json]
            [clojure.string :as str]))

(def sendgrid-api-key (System/getenv "SENDGRID_API_KEY"))

(defn send-verification-email [email username token]
  (when sendgrid-api-key
    (http/post "https://api.sendgrid.com/v3/mail/send"
               {:headers {"Authorization" (str "Bearer " sendgrid-api-key)
                         "Content-Type" "application/json"}
                :body (json/write-str
                       {:personalizations [{:to [{:email email}]}]
                        :from {:email "noreply@sorter.com"}
                        :subject "Verify your Sorter account"
                        :content [{:type "text/html"
                                 :value (str "<h1>Welcome to Sorter!</h1>"
                                           "<p>Hi " username ",</p>"
                                           "<p>Please verify your email by clicking the link below:</p>"
                                           "<a href='http://localhost:3000/verify-email?token=" token "'>"
                                           "Verify Email</a>")}]})})))

(defn generate-verification-token []
  (let [random-bytes (byte-array 32)]
    (.nextBytes (java.security.SecureRandom.) random-bytes)
    (str/replace (.encodeToString (java.util.Base64/getEncoder) random-bytes) "=" "")))

(defn create-verification-token [username]
  (let [token (generate-verification-token)]
    (db/exec! (-> (h/insert-into :email_confirmations)
                 (h/values [{:user_name username
                            :token token}])))
    token))

(defn verify-email-token [token]
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
  (let [email (-> r :body-params :email)
        user (first (db/exec! (-> (h/select :*)
                                 (h/from :users)
                                 (h/where [:= :email email]))))]
    (if user
      (let [token (create-verification-token (:users/user_name user))]
        (send-verification-email email (:users/user_name user) token)
        {:status 200 :body "Verification email sent"})
      {:status 404 :body "Email not found"})))

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
