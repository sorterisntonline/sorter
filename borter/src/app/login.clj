(ns app.login
  (:require [crypto.password.bcrypt :as password]
            [app.database :as db]
            [honey.sql.helpers :as h]))

(defn handle-login [r]
  (let [user
        (first (db/exec! (-> (h/select :*)
                             (h/from :users)
                             (h/where [:and
                                       [:= :user_name
                                        (-> r :body-params :user_name)]]))))]
    (if (nil? user)
      {:status 401 :body "missing user"}
      (if (password/check (-> r :body-params :password) (:users/password_hash user))
        {:status 200 :body "logged in"
         :session {:user_name (:users/user_name user)}}
        {:status 401 :body "wrong password"}))))

(defn validate-username [username]
  (let [regex #"^(?!_)(?!.*?_$)[a-zA-Z0-9_]{3,20}$"]
    (re-matches regex username)))

(defn handle-register [r]
  (when-not (validate-username (-> r :body-params :user_name ))
    (throw (ex-info "invalid username" {:status 400})))
  
  {:status 200 :body (db/exec! (-> (h/insert-into :users)
                                   (h/values [{:user_name (-> r :body-params :user_name)
                                               :password_hash (password/encrypt (-> r :body-params :password))}])))
   :session {:user_name (-> r :body-params :user_name)}})

(defn reset-password [username new-pw]
  (db/exec! (-> (h/update :users)
                (h/set {:password_hash (password/encrypt new-pw)})
                (h/where [:= :user_name username]))))

(comment
  (+ 3 3)
  
  
  )

(defn handle-logout [r]
  {:status 200 :body "ok" :session {}})

(defn current-session [r]
  {:status 200 :body (-> r :session)})
