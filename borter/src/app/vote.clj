(ns app.vote

  (:require [app.database :as db]
            [honey.sql.helpers :as h]
            [app.permissions :as perms]
            [sluj.core :refer [sluj]]
            [app.http :as http]
            [clojure.string :as str]))

(defn find-existing-vote [userid fst snd attr]
  (db/exec! (-> (h/select :*)
                (h/from :votes)
                (h/where [:and
                          [:= :votes/owner userid]
                          [:= :votes/attribute attr]
                          [:or
                           [:and
                            [:= :votes/left_item_id (:items/id fst)]
                            [:= :votes/right_item_id (:items/id snd)]]
                           [:and
                            [:= :votes/left_item_id (:items/id snd)]
                            [:= :votes/right_item_id (:items/id fst)]]]]))))

(defn vote-post [r]
  (let  [tagid (-> r :body-params :tag_id)
         userid (-> r :session :user_name)]
    
    (when (nil? userid)
      (throw (ex-info "need to be logged in to vote" {:status 401})))
    
    (when-not (or (perms/can-tag tagid "vote" userid)
                  (nil? tagid)
                  (= -1 tagid))
      (throw (ex-info "need vote permission" {:status 401})))

    (let [attributeid (if (= -1 (-> r :body-params :attribute :id))
                        (do (when (not-empty (db/exec! (-> {:select :id
                                                            :where [:= :title (sluj (-> r :body-params :attribute :title))]
                                                            :from :attributes})))
                              (throw (ex-info "already existing attribute title cant be created" {:status 400})))
                            (:attributes/id (first (db/exec! (-> (h/insert-into :attributes)
                                                                 (h/values [{:owner (-> r :session :user_name)
                                                                             :title (sluj (-> r :body-params :attribute :title))
                                                                             :description ""}])
                                                                 (h/returning :*))))))
                        (-> r :body-params :attribute :id))]
      
      (if-let [duplicate (first (find-existing-vote (-> r :session :user_name)
                                                    {:items/id (-> r :body-params :left_item_id)}
                                                    {:items/id (-> r :body-params :right_item_id)}
                                                    attributeid))]
        (db/exec! (-> (h/update :votes)
                      (h/set (-> (-> r :body-params)
                                 (assoc :owner (-> r :session :user_name)
                                        :attribute attributeid
                                        :edited_at [:now])
                                 (dissoc :tag_id)))
                      (h/where [:= :votes/id (:votes/id duplicate)])))
        
        (db/exec! (-> (h/insert-into :votes)
                      (h/values [(-> r
                                     :body-params
                                     (assoc :owner (-> r :session :user_name)
                                            :attribute attributeid)
                                     (dissoc :tag_id))])))))

    {:status 200 :body {:ok true}}))

(defn vote-get [r]
  (let [userid (-> r :session :user_name)
        tag-param (-> r :query-params (get "tag"))
        attribute-param (-> r :query-params (get "attribute"))
        until-param (-> r :query-params (get "until"))
        since-param (-> r :query-params (get "since"))
        user-param (-> r :query-params (get "user"))
        users-param (-> r :query-params (get "users"))
        
        ;; Ensure only one of 'user' or 'users' is used
        _ (when (and user-param users-param)
            (throw (ex-info "Cannot use 'user' and 'users' parameters simultaneously" {:status 400})))
        
        ;; Handle both tag_id and tag_slug cases
        tag-info (if (re-matches #"^\\d+$" tag-param)
                   ;; It's a numeric ID
                   (first (db/exec! (-> (h/select :*)
                                        (h/from :tags)
                                        (h/where [:= :tags/id (Integer/parseInt tag-param)]))))
                   ;; It's a slug
                   (first (db/exec! (-> (h/select :*)
                                        (h/from :tags)
                                        (h/where [:= :tags/slug tag-param])))))
        
        tag-id (:tags/id tag-info)]
    
    ;; Check if tag exists
    (when (nil? tag-id)
      (throw (ex-info "tag not found" {:status 404})))
    
    ;; Check permissions
    (when-not (perms/can-tag tag-id "view" userid)
      (throw (ex-info "not authorized to view this tag" {:status 403})))
    
    ;; Handle attribute parameter
    (let [attribute-condition 
          (when attribute-param
            (if (re-matches #"^\\d+$" attribute-param)
              ;; It's a numeric ID
              [:= :votes/attribute (Integer/parseInt attribute-param)]
              ;; It's a title
              (let [attr (first (db/exec! (-> (h/select :id)
                                              (h/from :attributes)
                                              (h/where [:= :attributes/title attribute-param]))))]
                (when attr
                  [:= :votes/attribute (:attributes/id attr)]))))
          
          ;; Handle until timestamp
          until-condition
          (when until-param
            [:< :votes/created_at until-param])
          
          ;; Handle since timestamp
          since-condition
          (when since-param
            [:> :votes/created_at since-param])
          
          ;; Handle user parameter
          user-condition
          (when user-param
            [:= :votes/owner user-param])
          
          ;; Handle users parameter
          users-condition
          (when users-param
            [:in :votes/owner (str/split users-param #",")])
          
          ;; Build the items subquery to get items in the tag
          items-in-tag-subquery
          (-> (h/select :items_in_tags/item_id)
              (h/from :items_in_tags)
              (h/where [:= :items_in_tags/tag_id tag-id]))
          
          ;; Build the WHERE conditions
          where-conditions
          (concat 
           [[:or
             [:in :votes/left_item_id items-in-tag-subquery]
             [:in :votes/right_item_id items-in-tag-subquery]]]
           (when attribute-condition [attribute-condition])
           (when until-condition [until-condition])
           (when since-condition [since-condition])
           (when user-condition [user-condition])
           (when users-condition [users-condition]))
          
          ;; Get the votes
          votes (db/exec! (-> (h/select :*)
                              (h/from :votes)
                              (h/where (if (= 1 (count where-conditions))
                                         (first where-conditions)
                                         (into [:and] where-conditions)))))]
      
      {:status 200
       :body {:votes votes}})))

(defn vote-delete [r]
  (let [admin-users (http/get-admin-users)
        username (-> r :session :user_name)
        vote-owner (-> (db/exec! (-> (h/select :owner) 
                                     (h/from :votes)
                                     (h/where [:= :votes/id (-> r :body-params :vote_id)])))
                       first 
                       :votes/owner)]
    (when-not (or (and admin-users (contains? admin-users username))
                  (= username vote-owner))
      (throw (ex-info "must own vote" {:status 401}))))

  (db/exec! (-> (h/delete-from :votes)
                (h/where [:= :votes/id (-> r :body-params :vote_id)])))
  {:status 200 :body {:ok true}})

(defn attribute-post [r]
  (let [userid (-> r :session :user_name)]
    
    (when (nil? userid)
      (throw (ex-info "need to be logged in to create attribute" {:status 401})))
    
    (let [title (-> r :body-params :title)
          description (or (-> r :body-params :description) "")]
      
      ;; Check if attribute with same title already exists
      (when (not-empty (db/exec! (-> {:select :id
                                      :where [:= :title (sluj title)]
                                      :from :attributes})))
        (throw (ex-info "attribute with this title already exists" {:status 400})))
      
      ;; Create the new attribute
      (let [result (first (db/exec! (-> (h/insert-into :attributes)
                                        (h/values [{:owner userid
                                                    :title (sluj title)
                                                    :description description}])
                                        (h/returning :*))))]
        
        {:status 200 :body result}))))
(defn attribute-get [r]
  (let [query (-> (h/select :*)
                  (h/from :attributes))]
    {:status 200
     :body {:attributes (db/exec! query)}}))
