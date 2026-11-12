(ns app.spotify
  (:require [app.oauth :as oauth]
            [app.util :as util]
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

(defn get-track-metadata
  "Get metadata for a specific track from Spotify API"
  [track-id token]
  (let [response (hc/request
                  {:url (str "https://api.spotify.com/v1/tracks/" track-id)
                   :method :get
                   :headers {"Authorization" (str "Bearer " token)}})
        track-data (-> response :body (json/read-str {:key-fn keyword}))]
    track-data))

(defn get-album-tracks
  "Get all tracks from an album"
  [album-id token]
  (let [response (hc/request
                  {:url (str "https://api.spotify.com/v1/albums/" album-id "/tracks")
                   :method :get
                   :headers {"Authorization" (str "Bearer " token)}})
        tracks (-> response :body (json/read-str {:key-fn keyword}) :items)]
    tracks))


(defn get-hostname []
  (util/get-base-url))

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
  {:spotify/access-token (get-client-token)})

(pco/defresolver spotify-search [{:keys [spotify/query spotify/access-token] :as input}]
  {::pco/input [:spotify/query :spotify/access-token]
   ::pco/output [{:spotify/search-results
                  [{:spotify.artist/artists [:spotify.artist/id :spotify.artist/name :spotify.artist/images]}
                   {:spotify.album/albums [:spotify.album/id :spotify.album/name :spotify.album/images]}
                   {:spotify.track/tracks [:spotify.track/id :spotify.track/name :spotify.track/album]}]}]}
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
     {:spotify.artist/artists (map (fn [artist]
                                    {:spotify.artist/id (:id artist)
                                     :spotify.artist/name (:name artist)
                                     :spotify.artist/images (:images artist)
                                     :spotify.artist/existing-tag (first (filter #(= (:domain_pk %) (:id artist)) 
                                                                          existing-records))})
                               (get-in results [:artists :items]))
      :spotify.album/albums (map (fn [album]
                                  {:spotify.album/id (:id album)
                                   :spotify.album/name (:name album)
                                   :spotify.album/images (:images album)
                                   :spotify.album/existing-tag (first (filter #(= (:domain_pk %) (:id album)) 
                                                                        existing-records))})
                             (get-in results [:albums :items]))
      :spotify.track/tracks (map (fn [track]
                                  {:spotify.track/id (:id track)
                                   :spotify.track/name (:name track)
                                   :spotify.track/album (:album track)
                                   :spotify.track/existing-tag (first (filter #(= (:domain_pk %) (:id track)) 
                                                                        existing-records))})
                             (get-in results [:tracks :items]))}}))

(pco/defresolver ensure-artist-tag [{:keys [spotify.artist/artist-id spotify.artist/artist-name]}]
  {::pco/input [:spotify.artist/artist-id :spotify.artist/artist-name]
   ::pco/output [:spotify.artist/tag-id]}
  (println "Running ensure-artist-tag resolver")
  (let [tag (create-spotify-tag 
             "spotify.artist"
             {:id artist-id
              :name artist-name})]
    {:spotify.artist/tag-id (:tags/id tag)}))

(pco/defresolver ensure-album-tag [{:keys [spotify.album/album-id spotify.album/name]}]
  {::pco/input [:spotify.album/album-id :spotify.album/name]
   ::pco/output [:spotify.album/tag-id]}
  (println "Running ensure-album-tag resolver")
  (let [tag (create-spotify-tag 
             "spotify.album"
             {:id album-id
              :name name})]
    {:spotify.album/tag-id (:tags/id tag)}))

(pco/defresolver add-track-to-tags [{:keys [spotify.track/item-id spotify.artist/tag-id spotify.album/tag-id] :as input}]
  {::pco/input [:spotify.track/item-id :spotify.artist/tag-id :spotify.album/tag-id]
   ::pco/output [:spotify.track/tags-added?]}
  (println "Running add-track-to-tags resolver with input:" input)
  (println "add-track-to-tags")
  (def input input)
  (db/exec! 
   (-> (h/insert-into :items_in_tags)
       (h/values [{:item_id item-id
                   :tag_id (:spotify.album/tag-id input)}
                  {:item_id item-id
                   :tag_id (:spotify.artist/tag-id input)}])
       (h/on-conflict)
       (h/do-nothing)))
  {:spotify.track/tags-added? true})

(pco/defresolver ensure-track-exists [{:keys [spotify.track/track-id] :as input}]
  {::pco/input [:spotify.track/track-id]
   ::pco/output [:spotify.track/item-id :spotify.track/name]}
  (println "Running ensure-track-exists resolver with input:" input)
  (println "ensure-track-exists")
  (when-let [existing (first 
                       (db/exec! 
                        (-> (h/select :*)
                            (h/from :items)
                            (h/where [:and
                                      [:= :domain_pk track-id]
                                      [:= :domain_pk_namespace "spotify.track"]]))))]
    {:spotify.track/item-id (:items/id existing)
     :spotify.track/name (:items/title existing)}))

(pco/defresolver create-track-record [{:keys [spotify.track/track-id spotify.track/name] :as input}]
  {::pco/input [:spotify.track/track-id :spotify.track/name]
   ::pco/output [:spotify.track/item-id :spotify.track/name]}
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
    {:spotify.track/item-id (:items/id new-record)
     :spotify.track/name (:items/title new-record)}))

(pco/defresolver spotify-track-metadata [{:keys [spotify.track/track-id spotify/access-token] :as input}]
  {::pco/input [:spotify.track/track-id :spotify/access-token]
   ::pco/output [:spotify.track/name
                 :spotify.album/album-id
                 :spotify.artist/artist-id
                 :spotify.track/release-date
                 :spotify.album/album-name
                 :spotify.artist/artist-name
                 :spotify.album/images]}
  (println "Running spotify-track-metadata resolver with input:" input)
  (println "spotify-track-metadata")
  (when-let [track-data (get-track-metadata track-id access-token)]
    {:spotify.track/name (:name track-data)
     :spotify.album/album-id (-> track-data :album :id)
     :spotify.artist/artist-id (-> track-data :artists first :id)
     :spotify.track/release-date (:release_date track-data)
     :spotify.album/album-name (-> track-data :album :name)
     :spotify.artist/artist-name (-> track-data :artists first :name)
     :spotify.album/images (-> track-data :album :images)}))

(pco/defresolver spotify-album-metadata [{:keys [spotify.album/album-id spotify/access-token]}]
  {::pco/input [:spotify.album/album-id :spotify/access-token]
   ::pco/output [:spotify.album/name
                 :spotify.artist/artist-id
                 :spotify.album/release-date
                 :spotify.artist/artist-name
                 :spotify.album/images]}
  (println "Running spotify-album-metadata resolver")
  (let [response (hc/request
                  {:url (str "https://api.spotify.com/v1/albums/" album-id)
                   :method :get
                   :headers {"Authorization" (str "Bearer " access-token)}})
        album-data (-> response :body (json/read-str {:key-fn keyword}))]
    {:spotify.album/name (:name album-data)
     :spotify.artist/artist-id (-> album-data :artists first :id)
     :spotify.album/release-date (:release_date album-data)
     :spotify.artist/artist-name (-> album-data :artists first :name)
     :spotify.album/images (:images album-data)}))

(pco/defresolver ensure-album-exists [{:keys [spotify.album/album-id] :as input}]
  {::pco/input [:spotify.album/album-id]
   ::pco/output [:spotify.album/item-id :spotify.album/name]
   ::pco/priority 1}  ; Higher priority for DB lookup
  (println "Running ensure-album-exists resolver with input:" input)
  (when-let [existing (first
                       (db/exec!
                        (-> (h/select :*)
                            (h/from :items)
                            (h/where [:and
                                      [:= :domain_pk album-id]
                                      [:= :domain_pk_namespace "spotify.album"]]))))]
    {:spotify.album/item-id (:items/id existing)
     :spotify.album/name (:items/title existing)}))

(pco/defresolver create-album-record [{:keys [spotify.album/album-id spotify.album/name] :as input}]
  {::pco/input [:spotify.album/album-id :spotify.album/name]
   ::pco/output [:spotify.album/item-id :spotify.album/name]
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
    {:spotify.album/item-id (:items/id new-record)
     :spotify.album/name (:items/title new-record)}))

(pco/defresolver add-album-to-tags [{:keys [spotify.album/item-id spotify.artist/tag-id spotify.album/name spotify.album/album-id] :as input}]
  {::pco/input [:spotify.album/item-id :spotify.artist/tag-id :spotify.album/name :spotify.album/album-id]
   ::pco/output [:spotify.album/tags-added? :spotify.album/tag-id :spotify.album/slug]}
  (println "Running add-album-to-tags resolver with input:" input)
  (let [tag (create-spotify-tag
             "spotify.album"
             {:id album-id
              :name name})]
    (db/exec!
     (-> (h/insert-into :items_in_tags)
         (h/values [{:item_id item-id
                     :tag_id tag-id}])
         (h/on-conflict)
         (h/do-nothing)))
    {:spotify.album/tags-added? true
     :spotify.album/tag-id (:tags/id tag)}))

(pco/defresolver album-tracks [{:keys [spotify.album/album-id spotify/access-token] :as input}]
  {::pco/input [:spotify.album/album-id :spotify/access-token]
   ::pco/output [{:spotify.album/tracks [:spotify.track/id :spotify.track/name]}]}
  (println "Running album-tracks resolver with input:" input)
  (let [tracks (get-album-tracks album-id access-token)]
    {:spotify.album/tracks (map (fn [track]
                                 {:spotify.track/id (:id track)
                                  :spotify.track/name (:name track)})
                            tracks)}))

(pco/defresolver process-album-tracks [{:keys [spotify.album/tracks spotify.artist/tag-id spotify.album/tag-id] :as input}]
  {::pco/input [:spotify.album/tracks
                :spotify.artist/tag-id
                :spotify.album/tag-id]
   ::pco/output [:spotify.album/tracks-processed?]}
  (println "Running process-album-tracks resolver with input:" input)
  (doseq [{:keys [spotify.track/id spotify.track/name]} tracks]
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
                       :tag_id (:spotify.artist/tag-id input)}
                      {:item_id item-id
                       :tag_id (:spotify.album/tag-id input)}])
           (h/on-conflict)
           (h/do-nothing)))))
  {:spotify.album/tracks-processed? true})

(pco/defresolver album-tag-details [{:keys [spotify.album/tag-id]}]
  {::pco/input [:spotify.album/tag-id]
   ::pco/output [:tags/id
                 :tags/slug
                 :tags/title
                 :tags/domain-pk
                 :tags/domain-pk-namespace
                 :tags/owner]}
  (println "Running album-tag-details resolver")
  (when-let [tag (first
                  (db/exec!
                   (-> (h/select :*)
                       (h/from :tags)
                       (h/where [:= :id tag-id]))))]
    {:tags/id (:tags/id tag)
     :tags/slug (:tags/slug tag)
     :tags/title (:tags/title tag)
     :tags/domain-pk (:tags/domain_pk tag)
     :tags/domain-pk-namespace (:tags/domain_pk_namespace tag)
     :tags/owner (:tags/owner tag)}))

(pco/defresolver album-complete? [{:keys [spotify.album/album-id] :as input}]
  {::pco/input [:spotify.album/album-id]
   ::pco/output [:spotify.album/name
                 :spotify.album/tracks-processed?
                 :spotify.album/tag-id
                 :tags/slug]}
  (println "Running album-complete? resolver")
  (when-let [album-tag (first
                        (db/exec!
                         (-> (h/select :*)
                             (h/from :tags)
                             (h/where [:and
                                       [:= :domain_pk album-id]
                                       [:= :domain_pk_namespace "spotify.album"]]))))]
    (let [tracks-in-db (db/exec!
                        (-> (h/select :*)
                            (h/from :items_in_tags)
                            (h/join :items [:= :items.id :items_in_tags.item_id])
                            (h/where [:and
                                      [:= :tag_id (:tags/id album-tag)]
                                      [:= :items.domain_pk_namespace "spotify.track"]])))]
      ; Always return a map with all promised outputs, even if some are nil
      {:spotify.album/name (:tags/title album-tag)
       :spotify.album/tracks-processed? (boolean (seq tracks-in-db))  ; Ensure this is always returned
       :spotify.album/tag-id (:tags/id album-tag)
       :tags/slug (:tags/slug album-tag)})))

;; Register both resolvers
(def env
  (-> [album-complete?  ; Keep this first for fast path
       ensure-album-exists
       album-tag-details
       ;; Add back Spotify API resolvers for new items
       spotify-client-token
       spotify-search
       ensure-track-exists
       create-track-record
       spotify-track-metadata
       ensure-artist-tag
       ensure-album-tag
       add-track-to-tags
       spotify-album-metadata
       create-album-record
       add-album-to-tags
       album-tracks
       process-album-tracks]
      (pci/register)))

(comment
  ;; First get the access token
  ;; Then use it in the track query
  (p.eql/process env
                 {:spotify.track/track-id "0nj9Bq5sHDiTxSHunhgkFb"}
                 [:spotify.track/name :spotify.track/item-id :spotify.track/tags-added?])

  (p.eql/process env
                 {:spotify.album/album-id "0y17shGWtVIUSETo8d4mMB"}
                 [:spotify.album/name
                  :spotify.album/tracks-processed?
                  :spotify.album/tag-id
                  :tags/domain-pk
                  :tags/domain-pk-namespace
                  :tags/slug])

  (clean-spotify-data!)

  (db/exec! ["delete from items where domain_pk = ?" "0nj9Bq5sHDiTxSHunhgkFb"])

  (count (db/exec! {:select :* :from :items :where [:= :domain_pk_namespace "spotify.track"]})))

;; Example usage in your API endpoint:
(defn search-endpoint [req]
  (let [query (-> req :params (get "q"))
        results (first (vals (p.eql/process env [{[:spotify/query query]
                                                  [{:spotify/search-results
                                                    [:spotify.artist/artists :spotify.album/albums :spotify.track/tracks]}]}])))]
    {:status 200
     :body results}))

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
    (def domain_pk domain_pk)
    (case domain_pk_namespace
      "spotify.track"
      (let [result (p.eql/process env
                                  {:spotify.track/track-id domain_pk}
                                  [:spotify.track/name 
                                   :spotify.track/item-id 
                                   :spotify.track/tags-added?])]
        {:status 200
         :body result})

      "spotify.album"
      (let [result (p.eql/process env
                                  {:spotify.album/album-id domain_pk}
                                  [:spotify.album/name
                                   :spotify.album/tracks-processed?
                                   :spotify.album/tag-id
                                   :tags/slug])]
        {:status 200
         :body result})

      {:status 501
       :body {:error "Not yet implemented for this entity type"}})))

(comment
  (db/exec! {:select :* :from :tags :where [:= :domain_pk_namespace "spotify.album"]}))
  
  



  

(def routes 
  (concat
    so/oauth-routes  ; Use the pre-defined OAuth routes
    [["/resolve" {:post {:no-doc false
                         :handler resolve-spotify-entity}}]
     ["/search" {:get {:no-doc false
                       :handler search-endpoint}}]]))

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





