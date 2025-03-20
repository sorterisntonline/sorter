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
  (def req req)
  (let [tagid (-> req :query-params (get "tag_id") Integer/parseInt)
        owner (get-owner tagid)]
    (when-not (= owner (-> req :session :user_name))
      (throw (ex-info "must own tag to get its perms" {:status 400})))
    
    {:status 200 :body (db/exec! {:select :* :from :perms
                                  :where [:= :tag_id tagid]})}))

(defn post-perms [req]
  (def req req)

  (let [tagid (-> req :body-params :tag_id)
        p (-> req :body-params :perms)]
    (when-not (= (get-owner tagid) (-> req :session :user_name))
      (throw (ex-info "must own tag to modify its permissions" {:status 403})))
    
    (db/exec! (-> {:insert-into :perms
                   :values (for [[cap perm] p]
                             {:tag_id tagid :capability (name cap) :user_id perm})}
                  (h/on-conflict :tag_id :capability)
                  (h/do-update-set {:fields [ :user_id]})))
    
    {:status 200 :body (db/exec! {:select :* :from :perms
                                  :where [:= :tag_id tagid]})}))

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
