(ns app.permissions
  (:require [app.database :as db]
            [honey.sql.helpers :as h]
            [clojure.string :as str]))


(comment
  (db/exec! (-> (h/select :*)
                (h/from :perms)))
  (db/exec! (-> (h/select :*)
                (h/from :users))))


(defn public-permissions [tagid]
  [{:tag_id tagid :capability "view" :user_id "all"}
   {:tag_id tagid :capability "vote" :user_id "all"}
   {:tag_id tagid :capability "add" :user_id "none"}])

(comment
  
  (db/exec! (-> {:delete-from :perms
                 :where  [:and
                          [:= :tag_id 10]
                          [:= :capability "add"]]})) 
  (db/exec! (-> {:insert-into :perms
                 :values [{:tag_id 10 :capability "add" :user_id "blobbed"}]})))


(defn populate-current-tags-migration [config]
  (println "populating perms table")
  (doall (for [tagid (map :tags/id (db/exec! (-> (h/select :id)
                                                 (h/from :tags))))]
           (db/exec! (-> (h/insert-into :perms)
                         (h/values (public-permissions tagid)))))))

(defn populate-current-tags-down-migration [config]
  (db/exec! (-> (h/delete-from :perms)
                (h/where true))))

(defn group-check [users-or-groups userid]
  (def users-or-groups users-or-groups)
  (def userid userid)
  (boolean (some identity (for [group users-or-groups]
                            (not-empty (db/exec! {:select :*
                                                  :from :users_in_usergroups
                                                  :where [:and
                                                          [:= userid :user_id]
                                                          [:= group :usergroup_id]]}))))))

(defn get-admin-users []
  (when-let [admins (System/getenv "BORTER_STATIC_ADMINS")]
    (set (clojure.string/split admins #","))))

(defn can [action perms owner userid]
  (let [admin-users (get-admin-users)]
    (or (and admin-users (contains? admin-users userid))
        (= owner userid)
        (let [voters (->> perms
                          (filter #(= (:perms/capability %) action))
                          (map :perms/user_id)
                          (map #(clojure.string/split % #"\."))
                          flatten
                          set)]
          (or (contains? voters "all")
              (contains? voters userid)
              (group-check voters userid))))))

(defn get-tag-perms [tagid userid]
  (let [perms (->> (db/exec! (-> (h/select :*)
                                 (h/from :perms)
                                 (h/where [:= :tag_id tagid]))))
        owner (-> (h/select :owner)
                  (h/from :tags)
                  (h/where [:= :tags/id tagid])
                  db/exec! first :tags/owner)]
    {:can_vote (can "vote" perms owner userid)
     :can_view (can "view" perms owner userid)
     :can_add (can "add" perms owner userid)}))

(defn get-owner [tagid]
  (-> (db/exec! {:select [:owner] :from :tags :where [:= :tags/id tagid]})
      first :tags/owner))

(defn can-tag [tagid action userid]
  (let [perms (db/exec! {:select :* :from :perms :where [:= :tag_id tagid]})
        owner (get-owner tagid)]
    (can action perms owner userid)))

(comment
  (db/exec! {:select :* :from :users}))
  
  








(defn get-perms [req]
   (let [username (-> req :session :user_name)]
    (if-not username
      {:status 401 :body {:message "must be logged in to get tag permissions"}}
      (try
        (let [tag-id-param (get-in req [:query-params "tag_id"])]
          (if-not tag-id-param
            {:status 400 :body {:message "tag_id parameter is required"}}
            (let [tagid (try (Integer/parseInt tag-id-param)
                          (catch Exception _ nil))]
              (if-not tagid
                {:status 400 :body {:message "tag_id must be a valid integer"}}
                (let [owner (get-owner tagid)]
                  (if-not (= owner username)
                    {:status 403 :body {:message "must own tag to get its permissions"}}
                    {:status 200 
                     :body (get-tag-perms tagid username)}))))))
        (catch Exception e
          {:status 400 :body {:message (.getMessage e)}})))))

(defn post-perms [req]
   (let [username (-> req :session :user_name)]
    (if-not username
      {:status 401 :body {:message "must be logged in to update tag permissions"}}
      (try
        (let [tagid (-> req :body-params :tag_id)
              perms (-> req :body-params :perms)]
          (if-not tagid
            {:status 400 :body {:message "tag_id is required"}}
            (if-not perms
              {:status 400 :body {:message "perms object is required"}}
              (if-not (= (get-owner tagid) username)
                {:status 403 :body {:message "must own tag to modify its permissions"}}
                (do
                  (db/exec! (-> {:insert-into :perms
                                 :values (for [[cap perm] perms]
                                           {:tag_id tagid :capability (name cap) :user_id perm})}
                                (h/on-conflict :tag_id :capability)
                                (h/do-update-set {:fields [:user_id]})))
                  
                  {:status 200 :body (get-tag-perms tagid username)})))))
        (catch Exception e
          {:status 400 :body {:message (.getMessage e)}})))))

(comment


  [#:perms{:tag_id 46, :capability "vote", :user_id "test.test1"}
   #:perms{:tag_id 46, :capability "add", :user_id "none"}
   #:perms{:tag_id 46, :capability "view", :user_id "all"}]
  
  (assert (can "vote"
               [#:perms{:tag_id 46, :capability "vote", :user_id "test.test1"}
                #:perms{:tag_id 46, :capability "add", :user_id "none"}
                #:perms{:tag_id 46, :capability "view", :user_id "all"}]
               "tommy"
               "test"))
  
  (assert (can "vote"
               [#:perms{:tag_id 46, :capability "vote", :user_id "test.test1"}
                #:perms{:tag_id 46, :capability "add", :user_id "none"}
                #:perms{:tag_id 46, :capability "view", :user_id "all"}]
               "tommy"
               "test1"))
  
  (assert (not (can "vote"
                    [#:perms{:tag_id 46, :capability "vote", :user_id "test.test1"}
                     #:perms{:tag_id 46, :capability "add", :user_id "none"}
                     #:perms{:tag_id 46, :capability "view", :user_id "all"}]
                    "tommy"
                    "randomuser")))
  
  (assert (can "add"
               [#:perms{:tag_id 46, :capability "vote", :user_id "test.test1"}
                #:perms{:tag_id 46, :capability "add", :user_id "randomuser"}
                #:perms{:tag_id 46, :capability "view", :user_id "all"}]
               "tommy"
               "randomuser"))
  
  (assert (can "add"
               [#:perms{:tag_id 46, :capability "vote", :user_id "test.test1"}
                #:perms{:tag_id 46, :capability "add", :user_id "randomuser.randomuser2"}
                #:perms{:tag_id 46, :capability "view", :user_id "all"}]
               "tommy"
               "randomuser2")))

(defn owns [tagid username]
  (let [admin-users (get-admin-users)]
    (or (and admin-users (contains? admin-users username))
        (= (get-owner tagid) username))))
