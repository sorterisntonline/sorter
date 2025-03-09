(ns app.feed
  (:require [app.database :as db]
            [honey.sql.helpers :as h]
            [app.permissions :as perms]
            [clojure.set :as set]
            [hato.client :as hc]
            [next.jdbc.types :as typ]
            [borkdude.deflet :refer [deflet]])
  (:import [java.util Date]))

(defn get-feed [{:keys [params]}]
  (try
    ;; Extract tag_id - try both keyword and string access
    (let [tag-id (or (get params :tag_id)
                     (get params "tag_id"))
          _ (when (nil? tag-id)
              (throw (ex-info "Missing required parameter: tag_id" {:status 400})))
          
          ;; Ensure tag-id is a string
          tag-id-str (str tag-id)
          
          response @(hc/request {:as :json
                                 :url (str "http://localhost:8081/api/feed?tag_id=" tag-id-str)
                                 :method :get
                                 :connect-timeout 5000
                                 :socket-timeout 10000})
          feed (get-in response [:body :data :response])
          feed (or feed [])
          items (filter #(= (get % "type") "Item") feed)
          votes (filter #(= (get % "type") "Vote") feed)]
      {:status 200
       :headers {"Content-Type" "application/json"}
       :body {:items (vec items)
              :votes (vec votes)}})
    (catch clojure.lang.ExceptionInfo e
      (let [data (ex-data e)]
        {:status (or (:status data) 500)
         :headers {"Content-Type" "application/json"}
         :body {:error "Error processing request"
                :message (.getMessage e)}}))
    (catch Exception e
      (println "Error in get-feed:" (.getMessage e))
      {:status 503
       :headers {"Content-Type" "application/json"}
       :body {:error "Internal server error"
              :message (.getMessage e)}})))

(defn get-hierarchy [req]
  (let [response @(hc/request {:as :json
                               :url "http://localhost:8081/api/hierarchy"
                               :method :get})]
    {:status 200
     :headers {"Content-Type" "application/json"}
     :body (:response response)}))

(defn days-ago [days]
  {:start (typ/as-timestamp (Date. (- (.getTime (Date.)) (* 1000 60 60 24 days))))
   :end (typ/as-timestamp (Date. (- (.getTime (Date.)) (* 1000 60 60 24 (inc days)))))})


(defn get-frontpage-feed [req]
  "get one days worth of all three (items, votes, comments, tags)"
  (def req req)

  (deflet
    
    (def req req)
    
    (def yesterday (days-ago (-> req :params (get "day") Integer/parseInt)))
    
    "TODO check if tags are public"
    (def items (->> (db/exec! (-> {:select [:items/*
                                            [:tags/title :tag_title]
                                            [:tags/id :tag_id]
                                            [:tags/slug :tag_slug]]
                                   :from [:items]
                                   :where [:and
                                           [:< :items/created_at (:start yesterday)]
                                           [:> :items/created_at (:end yesterday)]
                                           [:= :tags/unlisted false]]
                                   :order-by [:items/created_at]}
                                  (h/join :items_in_tags [:= :item_id :items/id])
                                  (h/join :tags [:= :tags/id :items_in_tags/tag_id])))
                    (filter (fn [item]
                              (perms/can-tag
                               (:tags/tag_id item)
                               "view"
                               (-> req :session :user_name))))))
    
    (def comments (->> (db/exec! (-> {:select [:comments/*
                                               [:tags/title :tag_title]
                                               [:tags/id :tag_id]
                                               [:tags/slug :tag_slug]
                                               [:items/title :item_title]
                                               [:items/id :item_id]]
                                      :from [:comments]
                                      :where [:and
                                              [:< :comments/created_at (:start yesterday)]
                                              [:> :comments/created_at (:end yesterday)]
                                              [:= :tags/unlisted false]]
                                      :order-by [:comments/created_at]}
                                     (h/join :items_in_tags [:and
                                                             [:= :item_id :comments/pk]
                                                             [:= :comments/pk_namespace "item"]])
                                     (h/join :tags [:= :tags/id :items_in_tags/tag_id])
                                     (h/join :items [:= :items/id :items_in_tags/item_id])))
                       (filter (fn [item]
                                 (perms/can-tag
                                  (:tags/tag_id item)
                                  "view"
                                  (-> req :session :user_name))))))

    (def votes (->> (db/exec! (-> {:select [:votes/* :tags/title
                                            [:left_item/title :left_title]
                                            [:right_item/title :right_title]
                                            [:tags/id :tag_id]
                                            [:tags/slug :tag_slug]]
                                   :from :votes
                                   :where [:and
                                           [:< :votes/created_at (:start yesterday)]
                                           [:> :votes/created_at (:end yesterday)]
                                           [:= :tags/unlisted false]]
                                   :order-by [:votes/created_at]}
                                  (h/join [:items :left_item] [:= :votes/left_item_id :left_item/id])
                                  (h/join [:items :right_item] [:= :votes/right_item_id :right_item/id])
                                  (h/join :items_in_tags [:= :left_item/id :items_in_tags/item_id])
                                  (h/join :tags [:= :tags/id :items_in_tags/tag_id])))
                    (filter (fn [item]
                              (perms/can-tag
                               (:tags/tag_id item)
                               "view"
                               (-> req :session :user_name))))))
    {:status 200 :body {:votes votes
                        :items items
                        :comments comments
                        :date (str ((:end yesterday)))}}))
