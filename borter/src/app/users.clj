(ns app.users
  (:require [app.database :as db]
            [honey.sql.helpers :as h]
            [clojure.string :as string]
            [app.schemas :refer [UserSchema]]))


(comment)
  ;; deprecated! this is not secure and so there is no longer an endpoint for it

(defn get-users [req]
  {:status 200 :body (db/exec! (-> {:select [:users/user_name :owner] :from :users :where true}
                                   (h/left-join :usergroups [:= :users/user_name
                                                             :usergroups/user_name])))})



(defn get-user [req]
  (let [user-name (get-in req [:query-params "user_name"])
        email (get-in req [:query-params "email"])
        loginid (get-in req [:query-params "login_id"])
        discord-id (get-in req [:query-params "discord_id"])
        auth0-id (get-in req [:query-params "auth0_id"])

        user (cond
               ;; Direct lookup by user_name
               user-name
               (first (db/exec! (-> (h/select :*)
                                    (h/from :users)
                                    (h/where [:= :user_name user-name]))))

               ;; Direct lookup by email
               email
               (first (db/exec! (-> (h/select :*)
                                    (h/from :users)
                                    (h/where [:= :email email]))))

               ;; Lookup by loginid (could be username or email)
               loginid
               (first (db/exec! (-> (h/select :*)
                                    (h/from :users)
                                    (h/where [:or
                                              [:= :user_name loginid]
                                              [:= :email loginid]]))))

               ;; Lookup by discord_id
               discord-id
               (first (db/exec! (-> (h/select :*)
                                    (h/from :users)
                                    (h/where [:= :discord_id discord-id]))))

               ;; Lookup by auth0_id
               auth0-id
               (first (db/exec! (-> (h/select :*)
                                    (h/from :users)
                                    (h/where [:= :auth0_id auth0-id]))))

               :else nil)]

    (if user
      ;; Check if this is a temporary Discord user
      (let [is-temp-discord-user (string/starts-with? (:users/user_name user) "@discord_")
            ;; Return only user_name and temporary flag for security
            sanitized-user {:user_name (:users/user_name user)}
            user-with-temp-flag (cond
                                  is-temp-discord-user
                                  (assoc sanitized-user :temporary true)

                                  (and discord-id (not is-temp-discord-user))
                                  (assoc sanitized-user :temporary false)

                                  :else
                                  sanitized-user)]
        {:status 200 :body user-with-temp-flag})

      ;; User not found
      {:status 404 :body {:message "user not found"}})))

(defn get-profile [req]
  (let [username (-> req :session :user_name)
        info-param (get-in req [:query-params "info"])
        requested-fields (when info-param 
                           (set (string/split info-param #"\.")))
        allowed-fields #{"user_name" "email" "email_verified" "pfp_url" "auth0_id" "discord_id" "created_at"}]
    (if username
      (let [user (first (db/exec! (-> (h/select :*)
                                      (h/from :users)
                                      (h/where [:= :user_name username]))))
            ;; If no specific fields are requested, return all allowed fields
            fields-to-return (if requested-fields
                               (clojure.set/intersection (set requested-fields) allowed-fields)
                               allowed-fields)
            ;; Build the response map with only the requested fields
            response (reduce (fn [acc field]
                               (let [db-field (keyword (str "users/" field))
                                     value (get user db-field)]
                                 (if value
                                   (assoc acc (keyword field) value)
                                   acc)))
                             {}
                             fields-to-return)]
        {:status 200 :body response})
      {:status 401 :body {:message "must be logged in to access profile"}})))

;; Define routes
(def routes
  ["/user" {:swagger {:tags ["user"]}}
   
   ["" {:get {:handler get-users}}]
   
   ["/lookup" {:get {:handler get-user
                     :parameters {:query {:user_name string?
                                          :email string?
                                          :login_id string?
                                          :discord_id string?
                                          :auth0_id string?}}}}]
   
   ["/profile" {:get {:handler get-profile
                      :parameters {:query {:info string?}}}}]])
