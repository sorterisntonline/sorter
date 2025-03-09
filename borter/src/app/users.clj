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
