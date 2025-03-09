(ns app.tag
  (:require [app.database :as db]
            [honey.sql.helpers :as h]
            [sluj.core :refer [sluj]] 
            [hato.client :as hc]
            [clojure.tools.logging :as log]
            [app.permissions :as perms]
            [clojure.string :as string]
            [app.util :refer [urlencode-params]]))

;; Replace the existing test functions with a single handler
(defn count-votes [tag]
  (let [subquery (-> (h/select :items_in_tags/item_id)
                     (h/from :items_in_tags)
                     (h/where [:= :items_in_tags/tag_id (:tags/id tag)]))
        votes (-> (h/select [[:count :votes/id]])
                  (h/from :votes)
                  (h/where [:or
                            [:in :votes/left_item_id subquery]
                            [:in :votes/right_item_id subquery]])
                  db/exec! first :count)]
    (assoc tag :vote_count votes)))



(defn query-tags [r]
  {:status 200 :body
   {:public (->> (db/exec! (-> (h/select :tags/*
                                         [[:count :items_in_tags/item_id] :item_count])
                               (h/join :perms [:= :perms/tag_id :tags/id])
                               (h/where [:and
                                         [:= :perms/capability "view"]
                                         [:= :perms/user_id "all"]
                                         [:= :tags/unlisted false]])
                               (h/from :tags)

                               (h/left-join :items_in_tags [:= :items_in_tags/tag_id :tags/id])
                               (h/group-by :tags/id)))
                 (map count-votes))
    :private
    (let [groups (map :users_in_usergroups/usergroup_id
                      (db/exec! (-> {:select :* :from :users_in_usergroups
                                     :where [:= :user_id (-> r :session :user_name)]})))]
      (->> (db/exec! (-> (h/select :tags/*)
                         (h/from :tags)
                         (h/join :perms [:= :perms/tag_id :tags/id])
                         (h/where [:or
                                   [:and
                                    [:= :perms/capability "view"]
                                    (if (-> r :session :user_name)
                                      [:or
                                       [:like :perms/user_id (str "%" (-> r :session :user_name) "%")]
                                       (into [:or] (map #(vector :like :perms/user_id (str "%" % "%")) groups))]
                                      false)]
                                   [:and
                                    [:and
                                     [:= :perms/capability "view"]
                                     [:not [:= :perms/user_id "all"]]]
                                    (if (-> r :session :user_name)
                                      [:= :tags/owner (-> r :session :user_name)]
                                      false)]])))
           (map count-votes)))
    :unlisted
    (->> (db/exec! (-> (h/select :tags/*)
                       (h/from :tags)
                       (h/where [:and
                                 [:= :tags/unlisted true]
                                 (if (-> r :session :user_name)
                                   [:= :tags/owner (-> r :session :user_name)]
                                   false)])))
         (map count-votes))
    #_:namespaces #_(db/exec! "select domain_pk_namespace count(*) from items group_by domain_pk_namespace")}})

(comment
  (db/exec! (-> (h/select :*)
                (h/from :tags)
                (h/where [:= :tags/domain_pk_namespace "spotify.playlist"]))))

(defn post-tag [r]
  (log/debug "post-tag called with body-params:" (:body-params r))
  (when (nil? (-> r :session :user_name))
    (log/warn "Unauthorized attempt to create tag")
    (throw (ex-info "need to be logged in to make tag" {:status 401})))

  ;; Validate title and slug match
  (let [title (-> r :body-params :title)
        provided-slug (-> r :body-params :slug)
        generated-slug (sluj title)]

    ;; If a slug was explicitly provided, ensure it matches the generated one
    (when (and provided-slug (not= provided-slug generated-slug))
      (log/warn "Mismatched title and slug in tag creation request")
      (throw (ex-info "Title does not match provided slug"
                      {:status 422
                       :error "validation_failed"
                       :provided-slug provided-slug
                       :generated-slug generated-slug}))))

  ;; Check for Discord context
  (let [has-discord-context (boolean (:discord r))
        domain-pk-ns (-> r :body-params :domain_pk_namespace)
        domain-pk (-> r :body-params :domain_pk)
        is-discord-channel (and domain-pk-ns domain-pk
                                (= domain-pk-ns "discord.channel"))

        ;; Get tag ID (preferring 'id' over 'tag_id')
        tag-id (or (-> r :body-params :id)
                   (-> r :body-params :tag_id))

        ;; Get namespace using updated handling
        namespace-value (or (-> r :body-params :namespace)
                            (-> r :body-params :ns))
        slug (sluj (-> r :body-params :title))

        ;; Check if this is an update or a new tag creation
        is-update (boolean tag-id)

        ;; Check if tag already exists for this Discord channel
        existing-tag (when (and is-discord-channel
                                (or has-discord-context
                                    (db/exec! {:select 1
                                               :from :users
                                               :where [:and
                                                       [:= :user_name (-> r :session :user_name)]
                                                       [:not= :discord_id nil]]})))
                       (first (db/exec! {:select :*
                                         :from :tags
                                         :where [:and
                                                 [:= :tags/domain_pk_namespace domain-pk-ns]
                                                 [:= :tags/domain_pk domain-pk]]})))]

    ;; For non-update operations, check if slug already exists in the namespace
    (when (and (not is-update)
               (not existing-tag))
      (let [ns-query-condition (cond
                                 ;; If namespace explicitly provided but empty
                                 (and namespace-value (empty? namespace-value))
                                 [:= :tags/ns ""]

                                 ;; If namespace provided with value
                                 namespace-value
                                 [:= :tags/ns (sluj namespace-value)]

                                 ;; If no namespace specified
                                 :else
                                 [:or [:= :tags/ns nil] [:= :tags/ns ""]])
            existing-slug-tag (first (db/exec! {:select :*
                                                :from :tags
                                                :where [:and
                                                        [:= :tags/slug slug]
                                                        ns-query-condition]}))]
        (when existing-slug-tag
          (log/warn "Attempted to create tag with duplicate slug:" slug)
          (throw (ex-info "A tag with this name already exists in this namespace"
                          {:status 409
                           :error "duplicate_tag"
                           :existing_tag_id (:tags/id existing-slug-tag)})))))

    ;; Return a proper HTTP response with the tag data
    {:status 200
     :body (cond
      ;; Case 1: Explicit tag id in request (standard update)
             tag-id
             (do (when-not (perms/owns tag-id (-> r :session :user_name))
                   (log/warn "User" (-> r :session :user_name) "attempted to edit tag they don't own:" tag-id)
                   (throw (ex-info "you can not edit tags you do not own" {:status 403})))

                 (let [body-params (-> r :body-params)
                ;; Ensure description is always a string, never nil
                       description (if (contains? body-params :description)
                                     (or (:description body-params) "")
                                     "")
                       update-values (-> body-params
                                         (assoc :edited_at [:now] :description description)
                                         (dissoc :tag_id :id))
                       ret (db/exec! (-> (h/update :tags)
                                         (h/set update-values)
                                         (h/where [:= :tags/id tag-id])))]
                   (log/info "Tag updated:" tag-id)
                   (log/debug "Updated tag result:" ret)
                   (first ret)))

      ;; Case 2: Discord channel tag exists (update)
             (and is-discord-channel existing-tag)
             (do (when-not (perms/owns (:tags/id existing-tag)
                                       (-> r :session :user_name))
                   (log/warn "User" (-> r :session :user_name) "attempted to edit Discord channel tag they don't own:" (:tags/id existing-tag))
                   (throw (ex-info "you can not edit tags you do not own" {:status 403})))

                 (let [body-params (-> r :body-params)
                ;; Ensure description is always a string, never nil
                       description (if (contains? body-params :description)
                                     (or (:description body-params) "")
                                     "")
                       update-values (-> body-params
                                         (assoc :edited_at [:now] :description description)
                                         (dissoc :tag_id :id))
                       ret (db/exec! (-> (h/update :tags)
                                         (h/set update-values)
                                         (h/where [:= :tags/id (:tags/id existing-tag)])))]
                   (log/info "Discord channel tag updated:" (:tags/id existing-tag))
                   (log/debug "Updated Discord channel tag result:" ret)
                   (first ret)))

      ;; Case 3: Create new tag
             :else
             (let [body-params (-> r :body-params)
            ;; Prefer 'namespace' over 'ns' if both are provided
                   namespace-value (or (-> body-params :namespace)
                                       (-> body-params :ns))
            ;; Ensure description is always a string, never nil
                   description (if (contains? body-params :description)
                                 (or (:description body-params) "")
                                 "")
                   tag-values (merge
                               (-> body-params
                                   (dissoc :ns :namespace :tag_id :id)
                                   (assoc :description description)) ;; Explicitly set description
                               (when (and namespace-value (not= namespace-value ""))
                                 {:tags/ns (sluj namespace-value)})
                               {:tags/slug (sluj (-> body-params :title))
                                :tags/owner (-> r :session :user_name)})
                   ret (db/exec! (-> (h/insert-into :tags)
                                     (h/values [tag-values])
                                     (h/returning :*)))
                   tagid (-> ret first :tags/id)]
               (db/exec! (-> (h/insert-into :perms)
                             (h/values (perms/public-permissions tagid))))
               (log/info "New tag created:" tagid "by user:" (-> r :session :user_name))
               (first ret)))}))


(defn delete-tag [req]
  (let [tagid (-> req :params (get "id") Integer/parseInt)]
    (when-not (perms/owns tagid (-> req :session :user_name))
      (throw (ex-info "must own tag" {:status 401})))

    (db/exec! {:delete-from :perms :where [:= :tag_id tagid]})
    (db/exec! {:delete-from :items_in_tags :where [:= :tag_id tagid]})
    (db/exec! {:delete-from :tags :where [:= :id tagid]})
    {:status 200 :body {:deleted true}}))


(defn tag-info-request [r]
  (log/debug "tag-info-request called with params:" (-> r :params))
  (log/debug "tag-info-request called with session:" (-> r :session))
  (let [response @(hc/request {:as :json
                               :url (str "http://localhost:8081/api/tag/page?"
                                         (urlencode-params (cond-> (-> r :params)
                                                             (-> r :session :user_name) (assoc "user_name" (-> r :session :user_name)))))
                               :method :get})]
    (log/debug "tag-info-request response:" response)
    {:status 200
     :headers {"Content-Type" "application/json"}
     :body (:body response)}))

;; @deprecated: Use tag-info-request instead
(defn tag-info-request2 [r]
  (let [response @(hc/request {:as :json
                               :url (str "http://localhost:8081/api/tag/page2?"
                                         (urlencode-params (cond-> (-> r :params)
                                                             (-> r :session :user_name)
                                                             (assoc "user_name" (-> r :session :user_name)))))
                               :method :get})]
    {:status 200
     :headers {"Content-Type" "application/json"}
     :body (:body response)}))


(defn tag-slug-check [r]
  (let [title (-> r :query-params (get "title"))
        ;; Allow direct slug parameter to override generated slug
        direct-slug (-> r :query-params (get "slug"))
        ;; Prefer 'namespace' over 'ns' if both are provided
        ns-value (or (-> r :query-params (get "namespace"))
                     (-> r :query-params (get "ns")))
        ;; Generate slug from title if no direct slug provided
        slug (if direct-slug direct-slug (when title (sluj title)))
        ;; Build query based on params
        query (if slug
                (cond
                  ;; If namespace explicitly provided but empty, search for empty ns
                  (and ns-value (empty? ns-value))
                  {:select :*
                   :from :tags
                   :where [:and
                           [:= :tags/slug slug]
                           [:= :tags/ns ""]]}

                  ;; If namespace provided with value, search for that ns
                  ns-value
                  {:select :*
                   :from :tags
                   :where [:and
                           [:= :tags/slug slug]
                           [:= :tags/ns (sluj ns-value)]]}

                  ;; If no namespace specified, search for null/empty ns
                  :else
                  {:select :*
                   :from :tags
                   :where [:and
                           [:= :tags/slug slug]
                           [:or
                            [:= :tags/ns nil]
                            [:= :tags/ns ""]]]})
                nil)]

    (if slug
      (let [existing-tag (first (db/exec! query))]
        {:status 200
         :body (if existing-tag
                 ;; Return only the specific fields defined in the OpenAPI schema
                 {:exists true
                  :id (:tags/id existing-tag)
                  :slug (:tags/slug existing-tag)
                  :title (:tags/title existing-tag)
                  :owner (:tags/owner existing-tag)
                  :namespace (:tags/ns existing-tag)}
                 {:slug slug
                  :exists false})})
      ;; Return error if neither title nor slug provided
      {:status 400
       :body {:message "Either title or slug parameter is required"}})))

(defn tag-exists-check [r]
  (let [body (:body-params r)
        title (:title body)
        ;; Allow direct slug parameter to override generated slug
        direct-slug (:slug body)
        ;; Prefer 'namespace' over 'ns' if both are provided
        ns-value (or (:namespace body)
                     (:ns body))
        domain-pk-ns (:domain_pk_namespace body)
        domain-pk (:domain_pk body)

        ;; Generate slug from title if no direct slug provided
        slug (if direct-slug direct-slug (when title (sluj title)))

        query (cond
                ;; Use domain identifiers if provided
                (and domain-pk-ns domain-pk)
                {:select :*
                 :from :tags
                 :where [:and
                         [:= :tags/domain_pk_namespace domain-pk-ns]
                         [:= :tags/domain_pk domain-pk]]}

                ;; Use title/slug + namespace if available
                slug
                (let [base-query {:select :* :from :tags :where [:= :tags/slug slug]}]
                  (cond
                    ;; If namespace is explicitly provided as empty string, search for empty ns only
                    (and (some? ns-value) (empty? ns-value))
                    (update base-query :where (fn [where] [:and where [:= :tags/ns nil]]))

                    ;; If namespace provided with non-empty value, search for that ns
                    (some? ns-value)
                    (update base-query :where (fn [where] [:and where [:= :tags/ns (sluj ns-value)]]))

                    ;; If no namespace specified, search for null/empty ns
                    :else
                    (update base-query :where (fn [where] [:and where [:or [:= :tags/ns nil] [:= :tags/ns nil]]]))))

                ;; Error case - neither domain identifiers nor title/slug provided
                :else
                (throw (ex-info "Either title/slug or domain_pk_namespace+domain_pk are required" {:status 400})))]
    (let [existing-tag (first (db/exec! query))]
      {:status 200
       :body (if existing-tag
               ;; Return only the specific fields defined in the OpenAPI schema
               {:exists true
                :id (:tags/id existing-tag)
                :slug (:tags/slug existing-tag)
                :title (:tags/title existing-tag)
                :owner (:tags/owner existing-tag)
                :namespace (:tags/ns existing-tag)}
               {:exists false
                :slug slug})})))
