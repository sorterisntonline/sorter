(ns app.spotify
  (:require [app.oauth :as oauth]
            [hato.client :as hc]
            [clojure.data.json :as json]
            [ring.util.codec :as codec]
            [app.database :as db]
            [app.spotify-oauth :as so]
            [honey.sql.helpers :as h]
            [sluj.core :refer [ sluj]]
            [ring.util.response :refer [redirect]]
            [app.permissions :as perms]
            [clojure.string :as str]
            [com.wsscode.pathom3.connect.indexes :as pci]
            [com.wsscode.pathom3.connect.operation :as pco]
            [com.wsscode.pathom3.interface.eql :as p.eql]
            [com.wsscode.pathom3.connect.built-in.resolvers :as pbir]
            [com.wsscode.pathom3.connect.built-in.plugins :as pbip]
            [com.wsscode.pathom3.interface.async.eql :as p.a.eql]
            [com.wsscode.pathom3.interface.smart-map :as psm]
            [com.wsscode.pathom3.plugin :as p.plugin])
  (:import [java.util Base64]))

(def global-token (atom nil))

(defn get-valid-token [username]
  (oauth/get-valid-token so/spotify-provider username "spotify"))


(defn get-hostname []
  (case (System/getenv "ENVIRONMENT")
    "production" "https://sorter.social"
    "staging" "https://staging.sorter.social"
    "http://localhost:3000"))

(defn get-client-token []
  (try
    (when (or (nil? @global-token) 
              (nil? (:expires_at @global-token))
              (> (System/currentTimeMillis) (:expires_at @global-token)))
      (let [response (hc/request {:url "https://accounts.spotify.com/api/token"
                                  :method :post
                                  :headers {"Authorization" (str "Basic " (oauth/encode-to-base64 (str so/client-id ":" so/client-secret)))}
                                  :form-params {:grant_type "client_credentials"}})
            body (-> response :body (json/read-str {:key-fn keyword}))
            expires-in (* (:expires_in body) 1000)]
        (reset! global-token {:access_token (:access_token body)
                              :expires_at (+ (System/currentTimeMillis) expires-in)})))
    (or (:access_token @global-token)
        (throw (ex-info "Failed to get client token" {:status 500})))))

(pco/defresolver spotify-client-token []
  {::pco/output [:spotify/access-token]}
  (println "Running spotify-client-token resolver")
  (when (or (nil? @global-token) 
            (nil? (:expires_at @global-token))
            (> (System/currentTimeMillis) (:expires_at @global-token)))
    (let [response (hc/request {:url "https://accounts.spotify.com/api/token"
                                :method :post
                                :headers {"Authorization" (str "Basic " (oauth/encode-to-base64 (str so/client-id ":" so/client-secret)))}
                                :form-params {:grant_type "client_credentials"}})
          body (-> response :body (json/read-str {:key-fn keyword}))
          expires-in (* (:expires_in body) 1000)]
      (reset! global-token {:access_token (:access_token body)
                            :expires_at (+ (System/currentTimeMillis) expires-in)})))
  {:spotify/access-token (or (:access_token @global-token)
                             (throw (ex-info "Failed to get client token" {:status 500})))})

(pco/defresolver spotify-search [{:keys [spotify/query spotify/access-token] :as input}]
  {::pco/input [:spotify/query :spotify/access-token]
   ::pco/output [{:spotify/search-results
                  [{:spotify/artists [:spotify/id :spotify/name :spotify/images]}
                   {:spotify/albums [:spotify/id :spotify/name :spotify/images]}
                   {:spotify/tracks [:spotify/id :spotify/name :spotify/album]}]}]}
  (println "Running spotify-search resolver with input:" input)
  (let [response (hc/request 
                  {:url "https://api.spotify.com/v1/search"
                   :method :get
                   :headers {"Authorization" (str "Bearer " access-token)}
                   :query-params {"q" query
                                  "type" "album,track,artist"
                                  "limit" 5}})
        results (-> response :body (json/read-str {:key-fn keyword}))
        ;; Extract Spotify IDs for database lookup
        spotify-ids (concat 
                     (map :id (get-in results [:artists :items]))
                     (map :id (get-in results [:albums :items]))
                     (map :id (get-in results [:tracks :items])))
        
        ;; Look up existing tags
        existing-records (when (seq spotify-ids)
                           (db/exec! 
                            (-> (h/select :*)
                                (h/from :tags)
                                (h/where [:and 
                                          [:in :domain_pk spotify-ids]
                                          [:like :domain_pk_namespace "spotify.%"]]))))]
    
    {:spotify/search-results
     {:spotify/artists (map (fn [artist]
                              {:spotify/id (:id artist)
                               :spotify/name (:name artist)
                               :spotify/images (:images artist)
                               :spotify/existing-tag (first (filter #(= (:domain_pk %) (:id artist)) 
                                                                    existing-records))})
                            (get-in results [:artists :items]))
      :spotify/albums (map (fn [album]
                             {:spotify/id (:id album)
                              :spotify/name (:name album)
                              :spotify/images (:images album)
                              :spotify/existing-tag (first (filter #(= (:domain_pk %) (:id album)) 
                                                                   existing-records))})
                           (get-in results [:albums :items]))
      :spotify/tracks (map (fn [track]
                             {:spotify/id (:id track)
                              :spotify/name (:name track)
                              :spotify/album (:album track)
                              :spotify/existing-tag (first (filter #(= (:domain_pk %) (:id track)) 
                                                                   existing-records))})
                           (get-in results [:tracks :items]))}}))

(pco/defresolver ensure-artist-tag [{:keys [spotify/artist-id spotify/artist-name] :as input}]
  {::pco/input [:spotify/artist-id :spotify/artist-name]
   ::pco/output [:db/artist-tag-id]}
  (println "Running ensure-artist-tag resolver with input:" input)
  (let [tag (create-spotify-tag 
             "spotify.artist"
             {:id artist-id
              :name artist-name})]
    {:db/artist-tag-id (:tags/id tag)}))

(pco/defresolver ensure-album-tag [{:keys [spotify/album-id spotify/album-name] :as input}]
  {::pco/input [:spotify/album-id :spotify/album-name]
   ::pco/output [:db/album-tag-id :db/album-slug]}
  (println "Running ensure-album-tag resolver with input:" input)
  (let [tag (create-spotify-tag 
             "spotify.album"
             {:id album-id
              :name album-name})]
    {:db/album-tag-id (:tags/id tag)
     :db/album-slug (:tags/slug tag)}))

(pco/defresolver add-track-to-tags [{:keys [db/item-id db/artist-tag-id db/album-tag-id] :as input}]
  {::pco/input [:db/item-id :db/artist-tag-id :db/album-tag-id]
   ::pco/output [:db/tags-added?]}
  (println "Running add-track-to-tags resolver with input:" input)
  (println "add-track-to-tags")
  (db/exec! 
   (-> (h/insert-into :items_in_tags)
       (h/values [{:item_id item-id
                   :tag_id artist-tag-id}
                  {:item_id item-id
                   :tag_id album-tag-id}])
       (h/on-conflict)
       (h/do-nothing)))
  {:db/tags-added? true})

(pco/defresolver ensure-track-exists [{:keys [spotify/track-id] :as input}]
  {::pco/input [:spotify/track-id]
   ::pco/output [:db/item-id :spotify/name]}
  (println "Running ensure-track-exists resolver with input:" input)
  (println "ensure-track-exists")
  (when-let [existing (first 
                       (db/exec! 
                        (-> (h/select :*)
                            (h/from :items)
                            (h/where [:and
                                      [:= :domain_pk track-id]
                                      [:= :domain_pk_namespace "spotify.track"]]))))]
    {:db/item-id (:items/id existing)
     :spotify/name (:items/title existing)}))

(pco/defresolver create-track-record [{:keys [spotify/track-id spotify/name] :as input}]
  {::pco/input [:spotify/track-id :spotify/name]
   ::pco/output [:db/item-id :spotify/name]}
  (println "Running create-track-record resolver with input:" input)
  (println "creating track record!")
  (let [new-record (first
                    (db/exec! 
                     (-> (h/insert-into :items)
                         (h/values [{:title name
                                     :slug (sluj name)
                                     :domain_pk track-id
                                     :domain_pk_namespace "spotify.track"
                                     :owner "spotify"}])
                         (h/returning :*))))]
    {:db/item-id (:items/id new-record)
     :spotify/name (:items/title new-record)}))

(pco/defresolver spotify-track-metadata [{:keys [spotify/track-id spotify/access-token] :as input}]
  {::pco/input [:spotify/track-id :spotify/access-token]
   ::pco/output [:spotify/name
                 :spotify/album-id
                 :spotify/artist-id
                 :spotify/release-date
                 :spotify/album-name
                 :spotify/artist-name
                 :spotify/images]}
  (println "Running spotify-track-metadata resolver with input:" input)
  (println "spotify-track-metadata")
  (when-let [track-data (get-track-metadata track-id access-token)]
    {:spotify/name (:name track-data)
     :spotify/album-id (-> track-data :album :id)
     :spotify/artist-id (-> track-data :artists first :id)
     :spotify/release-date (:release_date track-data)
     :spotify/album-name (-> track-data :album :name)
     :spotify/artist-name (-> track-data :artists first :name)
     :spotify/images (-> track-data :album :images)}))

(pco/defresolver spotify-album-metadata [{:keys [spotify/album-id spotify/access-token db/item-id] :as input}]
  {::pco/input [:spotify/album-id 
                :spotify/access-token
                (pco/? :db/item-id)]  ; Make item-id optional
   ::pco/output [:spotify/name
                 :spotify/artist-id
                 :spotify/release-date
                 :spotify/artist-name
                 :spotify/images]}
  (println "Running spotify-album-metadata resolver with input:" input)
  ;; Only make API call if we don't have an item-id (meaning it's not in our DB)
  (when-not item-id
    (let [response (hc/request 
                    {:url (str "https://api.spotify.com/v1/albums/" album-id)
                     :method :get
                     :headers {"Authorization" (str "Bearer " access-token)}})
          album-data (-> response :body (json/read-str {:key-fn keyword}))]
      {:spotify/name (:name album-data)
       :spotify/artist-id (-> album-data :artists first :id)
       :spotify/release-date (:release_date album-data)
       :spotify/artist-name (-> album-data :artists first :name)
       :spotify/images (:images album-data)})))

(pco/defresolver ensure-album-exists [{:keys [spotify/album-id] :as input}]
  {::pco/input [:spotify/album-id]
   ::pco/output [:db/item-id :spotify/name]
   ::pco/priority 1}  ; Higher priority for DB lookup
  (println "Running ensure-album-exists resolver with input:" input)
  (when-let [existing (first 
                      (db/exec! 
                       (-> (h/select :*)
                           (h/from :items)
                           (h/where [:and
                                   [:= :domain_pk album-id]
                                   [:= :domain_pk_namespace "spotify.album"]]))))]
    {:db/item-id (:items/id existing)
     :spotify/name (:items/title existing)}))

(pco/defresolver create-album-record [{:keys [spotify/album-id spotify/name] :as input}]
  {::pco/input [:spotify/album-id :spotify/name]
   ::pco/output [:db/item-id :spotify/name]
   ::pco/priority 0}  ; Lower priority than ensure-album-exists
  (println "Running create-album-record resolver with input:" input)
  (let [new-record (first
                    (db/exec! 
                     (-> (h/insert-into :items)
                         (h/values [{:title name
                                   :slug (sluj name)
                                   :domain_pk album-id
                                   :domain_pk_namespace "spotify.album"
                                   :owner "spotify"}])
                         (h/returning :*))))]
    {:db/item-id (:items/id new-record)
     :spotify/name (:items/title new-record)}))

(pco/defresolver add-album-to-tags [{:keys [db/item-id db/artist-tag-id spotify/name] :as input}]
  {::pco/input [:db/item-id :db/artist-tag-id :spotify/name]
   ::pco/output [:db/tags-added? :db/album-tag-id :db/album-slug]}
  (println "Running add-album-to-tags resolver with input:" input)
  (let [tag (create-spotify-tag 
             "spotify.album"
             {:id (str item-id)
              :name name})]
    (db/exec! 
     (-> (h/insert-into :items_in_tags)
         (h/values [{:item_id item-id
                    :tag_id artist-tag-id}])
         (h/on-conflict)
         (h/do-nothing)))
    {:db/tags-added? true
     :db/album-tag-id (:tags/id tag)
     :db/album-slug (:tags/slug tag)}))

(pco/defresolver album-tracks [{:keys [spotify/album-id spotify/access-token] :as input}]
  {::pco/input [:spotify/album-id :spotify/access-token]
   ::pco/output [{:spotify/tracks [:spotify/id :spotify/name]}]}
  (println "Running album-tracks resolver with input:" input)
  (let [tracks (get-album-tracks album-id access-token)]
    {:spotify/tracks (map (fn [track]
                          {:spotify/id (:id track)
                           :spotify/name (:name track)})
                        tracks)}))

(pco/defresolver process-album-tracks [{:keys [spotify/tracks db/artist-tag-id db/album-tag-id] :as input}]
  {::pco/input [:spotify/tracks 
                :db/artist-tag-id 
                :db/album-tag-id]
   ::pco/output [:db/tracks-processed?]}
  (println "Running process-album-tracks resolver with input:" input)
  (doseq [{:keys [spotify/id spotify/name]} tracks]
    (when-let [item-id (:items/id
                       (or (first 
                           (db/exec! 
                            (-> (h/select :*)
                                (h/from :items)
                                (h/where [:and
                                        [:= :domain_pk id]
                                        [:= :domain_pk_namespace "spotify.track"]]))))
                           (first
                            (db/exec! 
                             (-> (h/insert-into :items)
                                 (h/values [{:title name
                                           :slug (sluj name)
                                           :domain_pk id
                                           :domain_pk_namespace "spotify.track"
                                           :owner "spotify"}])
                                 (h/returning :*))))))]
      (db/exec! 
       (-> (h/insert-into :items_in_tags)
           (h/values [{:item_id item-id
                      :tag_id artist-tag-id}
                     {:item_id item-id
                      :tag_id album-tag-id}])
           (h/on-conflict)
           (h/do-nothing)))))
  {:db/tracks-processed? true})

(pco/defresolver album-tag-details [{:keys [db/album-tag-id] :as input}]
  {::pco/input [:db/album-tag-id]
   ::pco/output [:tags/id 
                 :tags/slug 
                 :tags/title
                 :tags/domain_pk
                 :tags/domain_pk_namespace
                 :tags/owner]}
  (println "Running album-tag-details resolver with input:" input)
  (when-let [tag (first 
                  (db/exec! 
                   (-> (h/select :*)
                       (h/from :tags)
                       (h/where [:= :id album-tag-id]))))]
    {:tags/id (:tags/id tag)
     :tags/slug (:tags/slug tag)
     :tags/title (:tags/title tag)
     :tags/domain_pk (:tags/domain_pk tag)
     :tags/domain_pk_namespace (:tags/domain_pk_namespace tag)
     :tags/owner (:tags/owner tag)}))

;; Register both resolvers
(def env
  (-> [spotify-client-token
       spotify-search
       ensure-track-exists
       create-track-record
       spotify-track-metadata
       ensure-artist-tag
       ensure-album-tag
       add-track-to-tags
       spotify-album-metadata
       ensure-album-exists
       create-album-record
       add-album-to-tags
       album-tracks
       process-album-tracks
       album-tag-details]
      (pci/register)))

(comment
  ;; First get the access token
  ;; Then use it in the track query
  (p.eql/process env
                 {:spotify/track-id "0nj9Bq5sHDiTxSHunhgkFb"}
                 [:spotify/name :db/item-id :db/tags-added?])
  
  (p.eql/process env
                 {:spotify/album-id "0y17shGWtVIUSETo8d4mMB"}
                 [:spotify/name
                  :db/tracks-processed?
                  :db/album-tag-id
                  :tags/domain_pk
                  :tags/domain_pk_namespace
                  :tags/slug])
  
  (clean-spotify-data!)

  (db/exec! ["delete from items where domain_pk = ?" "0nj9Bq5sHDiTxSHunhgkFb"])
  
  (count (db/exec! {:select :* :from :items :where [:= :domain_pk_namespace "spotify.track"]})))

;; Example usage in your API endpoint:
(defn search-endpoint [req]
  (let [query (-> req :params (get "q"))
        results (first (vals (p.eql/process env [{[:spotify/query query] 
                                                  [{:spotify/search-results 
                                                    [:spotify/artists :spotify/albums :spotify/tracks]}]}])))]
    {:status 200
     :body results}))

;; Create the standard OAuth route handlers
(defn create-spotify-tag
  "Creates a tag for a Spotify entity (artist, album, track) if it doesn't exist"
  [domain_pk_namespace entity]
  ;; First ensure spotify system user exists
  (db/exec! 
   ["INSERT INTO users (user_name, email, password_hash)
     VALUES (?, ?, ?)
     ON CONFLICT (user_name) DO NOTHING"
    "spotify" "spotify@sorter.social" "not-a-real-password"])

  (let [title (:name entity)
        slug (sluj title)
        domain-pk (:id entity)
        tag (or 
             (first (db/exec! 
                     ["SELECT * FROM tags 
                      WHERE domain_pk_namespace = ? AND domain_pk = ?"
                      domain_pk_namespace domain-pk]))
             (first (db/exec! 
                     ["INSERT INTO tags (title, slug, owner, domain_pk_namespace, domain_pk)
                      VALUES (?, ?, ?, ?, ?)
                      ON CONFLICT (domain_pk_namespace, domain_pk) 
                      DO NOTHING
                      RETURNING *"
                      title slug "spotify" domain_pk_namespace domain-pk])))]
    ;; Create public permissions for the tag
    (when tag
      (db/exec! (-> (h/insert-into :perms)
                    (h/values (perms/public-permissions (:tags/id tag)))
                    (h/on-conflict)
                    (h/do-nothing))))
    tag))


(defn get-artist-tracks
  "Get all tracks for an artist from Spotify API"
  [artist-id token]
  (let [response (hc/request 
                  {:url (str "https://api.spotify.com/v1/artists/" artist-id "/top-tracks")
                   :method :get
                   :headers {"Authorization" (str "Bearer " token)}
                   :query-params {"market" "US"}})
        tracks (-> response :body (json/read-str {:key-fn keyword}) :tracks)]
    tracks))

(defn get-album-tracks
  "Get all tracks from an album"
  [album-id token]
  (try
    (let [response (hc/request 
                    {:url (str "https://api.spotify.com/v1/albums/" album-id "/tracks")
                     :method :get
                     :headers {"Authorization" (str "Bearer " token)}})
          tracks (-> response :body (json/read-str {:key-fn keyword}) :items)]
      tracks)
    (catch Exception e
      (println "Error getting album tracks:" (ex-message e))
      [])))

(defn get-decade-from-date
  "Convert a release date to a decade tag (e.g., '1970s')"
  [release-date]
  (when release-date
    (let [year (Integer/parseInt (first (str/split release-date #"-")))
          decade (* (quot year 10) 10)]
      (str decade "s"))))

(defn resolve-spotify-entity [req]
  (let [{:keys [domain_pk domain_pk_namespace name]} (-> req :body-params)
        username (-> req :session :user_name)]
    (when-not username
      (throw (ex-info "Must be logged in" {:status 401})))

    (case domain_pk_namespace
      "spotify.track" 
      (let [result (p.eql/process env
                                  {:spotify/track-id domain_pk}
                                  [:spotify/name :db/item-id :db/tags-added?])]
        {:status 200
         :body result})
      
      "spotify.album"
      (let [result (p.eql/process env
                                  {:spotify/album-id domain_pk}
                                  [:spotify/name
                                   :db/tracks-processed?
                                   :db/album-tag-id])]
        {:status 200
         :body result})
      
      {:status 501
       :body {:error "Not yet implemented for this entity type"}})))

(comment
  (db/exec! {:select :* :from :tags :where [:= :domain_pk_namespace "spotify.artist"]})
  
  
  
  )

(def routes [["/resolve" {:post {:handler #'resolve-spotify-entity}}]
             ["/search" {:get {:handler #'search-endpoint}}]])

(defn clean-spotify-data! []
  ;; First remove votes for spotify items
  (db/exec! ["DELETE FROM votes 
             WHERE left_item_id IN (
               SELECT id FROM items 
               WHERE domain_pk_namespace = 'spotify.track'
             )"])
  (db/exec! ["DELETE FROM votes 
             WHERE right_item_id IN (
               SELECT id FROM items 
               WHERE domain_pk_namespace = 'spotify.track'
             )"])
  
  ;; Then remove permissions for spotify tags
  (db/exec! ["DELETE FROM perms 
             WHERE tag_id IN (
               SELECT id FROM tags 
               WHERE domain_pk_namespace LIKE 'spotify.%'
             )"])
  
  ;; Then remove items_in_tags connections
  (db/exec! ["DELETE FROM items_in_tags 
             WHERE tag_id IN (
               SELECT id FROM tags 
               WHERE domain_pk_namespace LIKE 'spotify.%'
             )
             OR item_id IN (
               SELECT id FROM items 
               WHERE domain_pk_namespace = 'spotify.track'
             )"])
  
  ;; Then remove the tags
  (db/exec! ["DELETE FROM tags 
             WHERE domain_pk_namespace LIKE 'spotify.%'"])
  
  ;; Finally remove the items
  (db/exec! ["DELETE FROM items 
             WHERE domain_pk_namespace = 'spotify.track'"]))

(comment
  ;; Usage:
  (clean-spotify-data!)
  
  ;; Verify counts including votes
  (count (db/exec! ["SELECT * FROM votes 
                    WHERE item_id IN (SELECT id FROM items WHERE domain_pk_namespace = 'spotify.track')"]))
  (count (db/exec! ["SELECT * FROM items WHERE domain_pk_namespace = 'spotify.track'"]))
  (count (db/exec! ["SELECT * FROM tags WHERE domain_pk_namespace LIKE 'spotify.%'"]))
  (count (db/exec! ["SELECT * FROM items_in_tags 
                    WHERE tag_id IN (SELECT id FROM tags WHERE domain_pk_namespace LIKE 'spotify.%')"]))
  (count (db/exec! ["SELECT * FROM perms 
                    WHERE tag_id IN (SELECT id FROM tags WHERE domain_pk_namespace LIKE 'spotify.%')"])))



