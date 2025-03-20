(ns app.item
  (:require [sluj.core :refer [sluj]]
            [app.database :as db]
            [honey.sql.helpers :as h]
            [lambdaisland.regal :as r]
            [ring.util.codec :as codec]
            [app.permissions :as perms]))

(defn get-admin-users []
  (when-let [admins (System/getenv "BORTER_STATIC_ADMINS")]
    (set (clojure.string/split admins #","))))

(def yt (r/regex [:cat
                  [:? [:capture "http" [:? "s"] "://"]]
                  [:? [:capture "www."]]
                  [:alt
                   "youtu.be/"
                   "youtube.com/watch?v="]
                  [:capture [:repeat :any 11]]
                  [:capture [:* :any]]]))

(defn extract-timestamp [s]
  (when s
    (let [m (codec/form-decode s)]
      (or (get m "t") (get m "?t")))))

(defn extract-youtube-code [url]
  (def url url)
  (let [matches (re-matches yt url)
        code (nth matches 3)
        maybe-timestamp (extract-timestamp (nth matches 4))]
    (if matches
      (if maybe-timestamp
        (str code "?t=" maybe-timestamp)
        code)
      nil)))

(comment
  (extract-youtube-code "")
  (extract-youtube-code "https://google.com")
  (extract-youtube-code "https://youtu.be/i8VFi-XMkgc?si=RLOzzIQXBXRl40Ty")
  (extract-youtube-code "https://youtu.be/i8VFi-XMkgc?si=RLOzzIQXBXRl40Ty")
  (extract-youtube-code "https://youtu.be/8oYi-TBAhFg?si=QnRCagKQXMtXPs68&t=281")
  (extract-youtube-code "https://www.youtube.com/watch?v=uzQZ-ilS1ps?t=40")
  (extract-youtube-code "https://www.youtube.com/watch?v=uzQZ-ilS1ps?si=arstarst&t=30"))

(defn extract-yt-timecode [item]
  (if-let [ytcode (extract-youtube-code (:url item))]
    (assoc item
           :domain_pk ytcode
           :domain_pk_namespace "youtube.video")
    item))

(def tt (r/regex [:cat
                  [:? [:capture "http" [:? "s"] "://"]]
                  [:? [:capture "www."]]
                  "tiktok.com/"
                  [:capture [:* :any]]
                  "/video/"
                  [:capture [:repeat :any 19]]
                  [:* :any]]))

(defn extract-tiktok-code-url [url]
  (def url url)
  (let [matches (re-matches tt url)
        code (nth matches 4)]
    code))

(comment
  (extract-tiktok-code-url "https://www.tiktok.com/@simnsanto/video/7116596588570594602")
  (extract-tiktok-code-url "https://www.tiktok.com/@curlyfuq/video/7141187403468885290?is_from_webapp=1&sender_device=pc&web_id=7225392053000963627")
  (extract-tiktok-code-url "https://google.com")
  (extract-tiktok-code-url "https://youtube.com/watch?v=uzQZ-ilS1ps?si=arstarst&t=30"))

(defn extract-tiktok-code [item]
  (def item item)
  (if-let [ttcode (extract-tiktok-code-url (:url item))]
    (assoc item
           :domain_pk ttcode
           :domain_pk_namespace "tiktok.video")
    item))

"https://open.spotify.com/track/1151Q8Aev8vtz6UfuaBhAy?si=03a8ac8a75ed4aa8"
(def spo (r/regex [:cat
                   [:? [:capture "http" [:? "s"] "://"]]
                   "open.spotify.com/track/"
                   
                   [:capture [:repeat :any 22]]
                   [:* :any]]))

(comment
  (re-matches spo url))

(defn extract-spotify-code-url [url]
  (def url url)
  (nth (re-matches spo url) 2))

(defn extract-spotify-code [item]
  (def item item)
  (if-let [spcode (extract-spotify-code-url (:url item))]
    (assoc item
           :domain_pk_namespace "spotify.track"
           :domain_pk spcode)
    item))

"https://x.com/fraxiommusic/status/1814736083407487204"
(def x (r/regex [:cat
                 [:? [:capture "http" [:? "s"] "://"]]
                 "x.com/"
                 [:* :any]
                 "/"
                 [:capture [:repeat :any 19]]
                 [:* :any]]))
(comment
  (re-matches x url))

(defn extract-twitter-code [item]
  (if-let [xcode (last (re-matches x (:url item)))]
    (assoc item
           :domain_pk_namespace "x.xeet"
           :domain_pk xcode)
    item))


(defn create-item [r]
  (def r r)
  (-> r :body-params)
  (let [_ " create item  "
        item (-> r :body-params (dissoc :tag_id
                                        :discord_channel_id
                                        :discord_server_id))
        item (assoc item
                    :owner (-> r :session :user_name)
                    :slug (sluj (:title item)))
        item (if (:url item) (extract-yt-timecode item) item)
        item (if (:url item) (extract-tiktok-code item) item)
        item (if (:url item) (extract-spotify-code item) item)
        item (if (:url item) (extract-twitter-code item) item)
        ret (db/exec! (-> (h/insert-into :items)
                          (h/values [item])
                          (h/returning :*)
                          (h/on-conflict :domain_pk :domain_pk_namespace)
                          (h/do-update-set {:domain_pk (:domain_pk item)})))
        
        itemid (-> ret first :items/id)
        tagids [(-> r :body-params :tag_id)]]

    "add item to items_in_tags"
    (def tagids tagids)
    (def itemid itemid)
    (def item item)
    (db/exec! (-> (h/insert-into :items_in_tags)
                  (h/values (for [tagid tagids]
                              {:tag_id tagid
                               :item_id itemid
                               :discord_channel_id (-> r :body-params :discord_channel_id)
                               :discord_server_id (-> r :body-params :discord_server_id)}))))
    ret))

(defn update-item [r]
  (db/exec! (-> (h/update :items)
                (h/set (-> r :body-params
                           (dissoc :id :tag_id)
                           (assoc :edited_at [:now])
                           (extract-yt-timecode)
                           (extract-tiktok-code)
                           (extract-spotify-code)
                           (extract-twitter-code)))
                (h/where [:= :items/id (-> r :body-params :id)])
                (h/returning :*))))

(defn item-slug-check [r]
  (let [title (-> r :query-params (get "title"))
        tag-id (some-> (-> r :query-params (get "tag_id")) Integer/parseInt)
        slug (sluj title)
        
        ;; Check if item exists by title/slug
        existing-item (first (db/exec! {:select :*
                                        :from :items
                                        :where [:= :items/slug slug]}))]
    
    ;; If we have a tag_id, also check if the item is in that tag
    (let [item-in-tag (when (and existing-item tag-id)
                        (not-empty (db/exec! {:select :*
                                              :from :items_in_tags
                                              :where [:and
                                                      [:= :item_id (:items/id existing-item)]
                                                      [:= :tag_id tag-id]]})))]
      
      {:status 200 
       :body (cond
               ;; Item exists and is in the specified tag
               (and existing-item tag-id item-in-tag)
               (assoc existing-item 
                      :exists true
                      :in_tag true)
               
               ;; Item exists but is not in the specified tag
               (and existing-item tag-id)
               (assoc existing-item
                      :exists true
                      :in_tag false)
               
               ;; Item exists (no tag check requested)
               existing-item
               (assoc existing-item
                      :exists true)
               
               ;; Item doesn't exist
               :else
               {:slug slug
                :exists false})})))

(defn item-exists-check [r]
  (let [body (:body-params r)
        title (:title body)
        tag-id (:tag_id body)
        domain-pk-ns (:domain_pk_namespace body)
        domain-pk (:domain_pk body)
        
        ;; Build query based on parameters
        query (cond
                ;; Use title if available
                title
                {:select :*
                 :from :items
                 :where [:= :items/slug (sluj title)]}
                
                ;; Use domain identifiers if no title
                (and domain-pk-ns domain-pk)
                {:select :*
                 :from :items
                 :where [:and
                         [:= :items/domain_pk_namespace domain-pk-ns]
                         [:= :items/domain_pk domain-pk]]}
                
                :else
                (throw (ex-info "Either title or domain_pk_namespace+domain_pk are required" {:status 400})))]
        
    (let [existing-item (first (db/exec! query))
          
          ;; If we have a tag_id, also check if the item is in that tag
          item-in-tag (when (and existing-item tag-id)
                        (not-empty (db/exec! {:select :*
                                              :from :items_in_tags
                                              :where [:and
                                                      [:= :item_id (:items/id existing-item)]
                                                      [:= :tag_id tag-id]]})))]
      
      {:status 200 
       :body (cond
               ;; Item exists and is in the specified tag
               (and existing-item tag-id item-in-tag)
               (assoc existing-item 
                      :exists true
                      :in_tag true)
               
               ;; Item exists but is not in the specified tag
               (and existing-item tag-id)
               (assoc existing-item
                      :exists true
                      :in_tag false)
               
               ;; Item exists (no tag check requested)
               existing-item
               (assoc existing-item
                      :exists true)
               
               ;; Item doesn't exist
               :else
               {:exists false})})))


(defn item-owner [id] (-> {:select [:owner] :from :items :where [:= :items/id id]}
                          db/exec! first :items/owner))
(defn item-post [req] ;; TODO: fix that this returns really ugly global scoped fields (ie, :items_in_tags/discord_channel_id)
  (let [username (-> req :session :user_name)
        tagids [(-> req :body-params :tag_id)]
        admin-users (get-admin-users)
        is-admin (and admin-users (contains? admin-users username))]

    {:status 200 :body (if (-> req :body-params :id)
                         (do
                           (when-not (or is-admin
                                         (= (item-owner (-> req :body-params :id)) username))
                             (throw (ex-info "must own item to update it" {:status 403})))

                           ;; TODO: i don't think this works to unwrap our output -- and it might be best that it is wrapped, honestly...
                           (let [result (update-item req)]
                             (if (and (sequential? result) (= 1 (count result)))
                               (first result)
                               result)))
                         (let [result (create-item req)]
                           (if (and (sequential? result) (= 1 (count result)))
                             (first result)
                             result)))}))

(defn item-m-get [r]
  (let [itemid (-> r :query-params (get "item_id"))]
    (if (= -1 itemid)
      {:status 200 :body {:membership [] :skips []}}
      {:status 200 :body (let [itemid (Integer/parseInt itemid)]
                           {:membership
                            (db/exec! (-> (h/select :*)
                                          (h/from :items_in_tags)
                                          (h/where [:= :item_id itemid]) (h/join :tags [:= :items_in_tags.tag_id :tags.id])))
                            :skips
                            (db/exec! (-> (h/select :*)
                                          (h/from :skipped)
                                          (h/where [:and
                                                    [:= :item_id itemid]
                                                    [:= :owner (-> r :session :user_name)]])))})})))

(defn item-m-delete [r]
  (let [admin-users (get-admin-users)
        username (-> r :session :user_name)
        item-owner (-> (db/exec! (-> (h/select :owner) 
                                     (h/from :items)
                                     (h/where [:= :items/id (-> r :body-params :item_id)])))
                       first 
                       :items/owner)]
    (when-not (or (and admin-users (contains? admin-users username))
                  (= username item-owner))
      (throw (ex-info "must own item to remove it from tag" {:status 401}))))

  (db/exec! (-> (h/delete-from :items_in_Tags)
                (h/where [:and
                          [:= :item_id (-> r :body-params :item_id)]
                          [:= :tag_id (-> r :body-params :tag_id)]])))
  {:status 200 :body {:ok true}})

(defn item-m-post [req]
  ;; TODO change so that you just need add permission on that tag?
  (when-not (perms/can-tag (-> req :body-params :tag_id) "add" (-> req :session :user_name))
    (throw (ex-info "must have add permission on target tag" {:status 401})))

  (db/exec! (-> (h/insert-into :items_in_tags)
                (h/values [(-> req :body-params)])))
  {:status 200 :body {:ok true}})

(defn item-skip [req]
  (when-not (-> req :session :user_name)
    (throw (ex-info "must be logged in to skip" {:status 401})))

  (db/exec! {:insert-into :skipped
             :values [{:owner (-> req :session :user_name)
                       :item_id (-> req :body-params :item_id)}]})

  {:status 200 :body {:ok true}})

(defn item-skip-delete [req]
  (when-not (-> req :session :user_name)
    (throw (ex-info "must be logged in to skip" {:status 401})))

  (db/exec! (-> (h/delete-from :skipped)
                (h/where [:and
                          [:= :item_id (-> req :body-params :item_id)]
                          [:= :owner (-> req :session :user_name)]])))
  {:status 200 :body {:ok true}})

;; Define routes
(def routes
  ["/item" {:swagger {:tags ["item"]}}
   
   ["" {:post {:handler item-post
               :parameters {:body {:title string?
                                   :body string?
                                   :url string?
                                   :id int?
                                   :tag_id int?
                                   :discord_channel_id string?
                                   :discord_server_id string?}}}}]
   
   ["/slug-check" {:get {:handler item-slug-check
                         :parameters {:query {:title string?
                                              :tag_id string?}}}}]
   
   ["/exists" {:post {:handler item-exists-check
                      :parameters {:body {:title string?
                                          :tag_id int?
                                          :domain_pk_namespace string?
                                          :domain_pk string?}}}}]
   
   ["/membership" {:get {:handler item-m-get
                         :parameters {:query {:item_id string?}}}
                   
                   :post {:handler item-m-post
                          :parameters {:body {:tag_id int?
                                              :item_id int?}}}
                   
                   :delete {:handler item-m-delete
                            :parameters {:body {:tag_id int?
                                                :item_id int?}}}}]
   
   ["/skip" {:post {:handler item-skip
                    :parameters {:body {:item_id int?}}}
             
             :delete {:handler item-skip-delete
                      :parameters {:body {:item_id int?}}}}]])