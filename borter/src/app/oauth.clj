(ns app.oauth
  (:require [ring.util.response :refer [redirect]]
            [clojure.data.json :as json]
            [hato.client :as hc]
            [app.database :as db]
            [honey.sql.helpers :as h]
            [ring.util.codec :as codec])
  (:import [java.util Base64]))

(defn encode-to-base64 [input-str]
  (let [bytes (.getBytes input-str "UTF-8")
        encoded-bytes (.encodeToString (Base64/getEncoder) bytes)]
    encoded-bytes))

(defn get-hostname []
  (case (System/getenv "ENVIRONMENT")
    "production" "https://sorter.social"
    "staging" "https://staging.sorter.social"
    "http://localhost:3000"))

(defn get-origin-hostname [req]
  (let [origin (get-in req [:headers "origin"])
        referer (get-in req [:headers "referer"])]
    (cond
      ;; Check if it's from clisorter
      (or (re-find #"music\.sorter\.social" (or origin ""))
          (re-find #"music\.sorter\.social" (or referer "")))
      (if (= "production" (System/getenv "ENVIRONMENT"))
        "https://music.sorter.social"
        (if (= "staging" (System/getenv "ENVIRONMENT"))
          "https://staging.sorter.social/music"
          "http://localhost:3001"))
      
      ;; Default to main sorter hostname
      :else (get-hostname))))

(defprotocol OAuthProvider
  (get-auth-url [this state redirect-uri])
  (exchange-code [this code redirect-uri])
  (get-token-info [this tokens])
  (refresh-token [this refresh-token]))

(defn create-oauth-routes
  "Creates standard OAuth routes for a provider"
  [provider domain-namespace]
  {"/auth" 
   {:get 
    {:handler 
     (fn [req]
       (let [return-path (or (-> req :params (get "redirect")) "/")
             origin-host (get-origin-hostname req)
             redirect-uri (str (get-hostname) "/api/" domain-namespace "/callback")
             auth-url (get-auth-url provider return-path redirect-uri)]
         (redirect auth-url)))}}

   "/callback"
   {:get
    {:handler
     (fn [req]
       (let [code (-> req :params (get "code"))
             return-path (or (-> req :params (get "state")) "/")
             redirect-uri (str (get-hostname) "/api/" domain-namespace "/callback")
             tokens (exchange-code provider code redirect-uri)
             token-info (get-token-info provider tokens)
             expires-in (* (get tokens "expires_in") 1000)
             expires-at (+ (System/currentTimeMillis) expires-in)]
         
         ;; Store tokens in database
         (db/exec! 
          (-> (h/insert-into :tokens)
              (h/values [{:owner (-> req :session :user_name)
                         :domain_pk_namespace domain-namespace
                         :access_token (get tokens "access_token")
                         :refresh_token (get tokens "refresh_token")
                         :expires_at expires-at
                         :token_info (json/write-str token-info)}])
              (h/on-conflict [:domain_pk_namespace :owner]
                            (h/do-update-set :access_token :refresh_token :expires_at :token_info))))
         
         ;; Redirect back to original return path with origin hostname
         (redirect (str (get-origin-hostname req) return-path))))}}
   
   "/status"
   {:get
    {:handler
     (fn [req]
       (let [username (-> req :session :user_name)]
         (if username
           (let [token (first (db/exec! {:select :*
                                        :from :tokens
                                        :where [:and
                                               [:= :owner username]
                                               [:= :domain_pk_namespace domain-namespace]]}))]
             {:status 200
              :body {:connected (boolean token)}})
           {:status 200
            :body {:connected false
                   :reason "not_logged_in"}})))}}
   
   "/disconnect"
   {:post
    {:handler
     (fn [req]
       (let [username (-> req :session :user_name)]
         (when username
           (db/exec! {:delete-from :tokens
                     :where [:and
                            [:= :owner username]
                            [:= :domain_pk_namespace domain-namespace]]}))
         {:status 200
          :body {:disconnected true}}))}}})

;; Helper function to get valid token, handling refresh if needed
(defn get-valid-token [provider username domain-namespace]
  (when-let [token (first (db/exec! {:select :*
                                    :from :tokens
                                    :where [:and
                                           [:= :owner username]
                                           [:= :domain_pk_namespace domain-namespace]]}))]
    (let [expires-at (:tokens/expires_at token)]
      (if (> (System/currentTimeMillis) expires-at)
        ;; Token expired, refresh it
        (when-let [new-tokens (refresh-token provider (:tokens/refresh_token token))]
          (let [expires-in (* (get new-tokens "expires_in") 1000)
                expires-at (+ (System/currentTimeMillis) expires-in)]
            ;; Update stored token
            (db/exec! 
             (-> (h/insert-into :tokens)
                 (h/values [{:owner username
                            :domain_pk_namespace domain-namespace
                            :access_token (get new-tokens "access_token")
                            :refresh_token (:tokens/refresh_token token)
                            :expires_at expires-at}])
                 (h/on-conflict [:domain_pk_namespace :owner]
                               (h/do-update-set :access_token :expires_at))))
            (get new-tokens "access_token")))
        ;; Token still valid
        (:tokens/access_token token))))) 