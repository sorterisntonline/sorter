(ns app.vote

  (:require [app.database :as db]
            [honey.sql.helpers :as h]
            [app.permissions :as perms]
            [sluj.core :refer [sluj]]))

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
