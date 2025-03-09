(ns app.http
  (:require [reitit.ring :as ring]
            [reitit.ring.malli]
            [reitit.coercion.malli]
            [reitit.ring.coercion :as coercion]
            [reitit.ring.spec :as spec]
            [reitit.swagger :as swagger]
            [reitit.swagger-ui :as swagger-ui] 
            [reitit.openapi :as openapi]
            [reitit.dev.pretty :as pretty] 
            [clojure.tools.logging :as log]
            [ring.adapter.jetty :as jetty]
            [ring.middleware.params :as params]
            ;; [ring.swagger.middleware :as swagger-m]
            
            [ring.middleware.session :as session]
            [ring.middleware.session.memory :as memory]
            [ring.middleware.resource :refer [wrap-resource]]
            [ring.middleware.content-type :refer [wrap-content-type]]
            [ring.middleware.reload :refer [wrap-reload]]
            
            [ring.util.response :as resp]
            [clojure.string :as string]
            
            [reitit.ring.middleware.muuntaja :as muuntaja]
            [reitit.ring.middleware.exception :as exception]
            [reitit.ring.middleware.multipart :as multipart]
            [reitit.ring.middleware.parameters :as parameters] 
            
            
            
            [muuntaja.core :as m]
            [malli.core :as malli]
            [malli.util :as mu]
            [malli.error :as me]

            

            [io.staticweb.rate-limit.middleware :refer [ip-rate-limit wrap-rate-limit]]

            
            
            [app.login :as login]
            [app.spotify :as spotify]
            [app.item :as item]
            [app.vote :as vote]

            [app.permissions :as perms]
            [app.youtube :as youtube]
            [app.integrations :as integrations]
            [app.linear :as linear]
            [app.feed :as feed]
            [app.comments :as comments]
            [app.reddit :as reddit]
            [app.twitter :as twitter]
            [app.groups :as groups]
            [app.health :as health]
            [app.oauth :as oauth]
            [app.discord :as discord]
            [app.discord-oauth :as discord-oauth]
            [com.rpl.specter :refer :all]
            [app.api-keys :as api-keys]

            [app.schemas :refer [ItemSchema VoteSchema UserSchema TagSchema ErrorSchema InfoSchema AttributeSchema TagPageResponseSchema PermsSchema]]
            [app.ratelimits :refer :all]
            [app.tag :refer :all]
            [app.misc :refer :all]
            [app.users :refer :all])
  (:import
   [java.net URLEncoder]))

(defn current-session
  "Handler for retrieving the current session information"
  [r]
  (let [username (-> r :session :user_name)]
    {:status 200
     :body (if username
             {:authenticated true
              :user_name username}
             {:authenticated false})}))


(def routes
  [["/openapi.json"
    {:get {:no-doc true
           :openapi {:info {:title "Sorter API"
                            :description "API for sorter.social - a platform for democratic consensus on any content"
                            :version "1.0.1"}
                     :tags [{:name "System" :description "System and health endpoints"}
                            {:name "Authentication" :description "User authentication endpoints"}
                            {:name "API Keys" :description "API key management endpoints"}
                            {:name "Feed" :description "Feed and frontpage endpoints"}
                            {:name "Tags" :description "Tag management endpoints"}
                            {:name "Items" :description "Item management endpoints"}
                            {:name "Votes" :description "Voting and attribute management endpoints"}
                            {:name "Users" :description "User management endpoints"}
                            {:name "Comments" :description "Comment management endpoints"}
                            {:name "Groups" :description "Group management endpoints"} 
                            {:name "Integrations" :description "External service integration endpoints"}]  
                     :components {:securitySchemes {"apiKeyAuth" {:type :apiKey
                                                                  :in :header
                                                                  :name "x-api-key"}
                                                    "cookieAuth" {:type :apiKey
                                                                  :in :cookie
                                                                  :name "ring-session"}}}}
           :handler (openapi/create-openapi-handler)}}] 

   ["/api" 
    {:no-doc true}
    ["/health" {:get {:no-doc false
                      :summary "Health check endpoint"
                      :tags ["System"]
                      :description "Simple health check to verify the API is running"
                      :responses {200 {:description "Health status"
                                       :content {:default {:schema [:map
                                                                    [:status :string]
                                                                    [:version :string] 
                                                                    [:database :string]]}}}}
                      :handler health/check-health}}] 
    ["/feed" {:get {:no-doc false
                    :summary "Get feed for a tag"
                    :tags ["Feed"] 
                    :description "Retrieves feed items for a specific tag, including recent votes and activity. WARNING: if the tag is new, or has no items, this will return an empty list, which is sort of strange. account for that until we fix it."
                    :parameters {:query [:map
                                         [:tag_id {:description "ID of the tag to get feed for"} :int]]}
                    :responses {200 {:description "Feed items"
                                     :content {:default {:schema [:map {:closed false} 
                                                                  [:items {:optional true} [:vector {:min 0} ItemSchema]] 
                                                                  [:votes {:optional true} [:vector {:min 0} VoteSchema]]]
                                                         :examples {:ok {:description "Feed items retrieved"
                                                                         :value {:items [{:id 1 :title "Example Item" :description "Description" :owner "user1" :created_at "2023-01-01T12:00:00Z"}]
                                                                                 :votes [{:id 1 :left_item_id 1 :right_item_id 2 :magnitude 35 :owner "user1" :created_at "2023-01-01T12:00:00Z"}]}}}}}} 
                                400 {:description "Invalid tag ID"
                                     :content {:default {:schema ErrorSchema
                                                         :examples {:invalid-tag-id {:value {:message "Invalid tag ID"}}}}}}
                                429 {:description "Rate limit exceeded"
                                     :content {:default {:schema ErrorSchema
                                                         :examples {:rate-limit-exceeded {:value {:message "Rate limit exceeded"}}}}}}}
                    :handler feed/get-feed}}]
    ["/frontpage" {:get {:no-doc false
                         :summary "Get frontpage feed"
                         :tags ["Feed"]
                         :description "Retrieves a 'frontpage' feed showing recent activity across all accessible tags"
                         :responses {200 {:description "Frontpage feed items"
                                          :content {:default {:schema [:map  
                                                                       [:items [:vector ItemSchema]]
                                                                       [:votes [:vector VoteSchema]]
                                                                       [:tags [:vector TagSchema]]]
                                                              :examples {:ok {:value {:items [{:id 1 :title "Example Item"}] 
                                                                                      :owner "user1"
                                                                                      :created_at "2023-01-01T12:00:00Z"
                                                                                      :votes [{:id 1 :left_item_id 1 :right_item_id 2 :magnitude 40}]
                                                                                      :tags [{:id 1 :title "Example Tag" 
                                                                                              :slug "example-tag"
                                                                                              :owner "user1"
                                                                                              :created_at "2023-01-01T12:00:00Z"}]}}}}}}}}
                   :handler feed/get-frontpage-feed}] 
    ["/leaderboard" {:get {:no-doc false
                           :summary "Get user leaderboard"
                           :tags ["Users"]
                           :description "Returns aggregated voting statistics by user, sorted by vote count"
                           :responses {200 {:description "User leaderboard"
                                            :content {:default {:schema [:vector [:map
                                                                                  [:users/user_name :string]
                                                                                  [:count :int]]]
                                                                :examples {:ok {:value [{:user_name "user1" :count 150}
                                                                                        {:user_name "user2" :count 120}]}}}}}}}
                     :handler get-leaderboard}]
    ["/users" {:get {:no-doc false
                     :summary "Lookup users"
                     :tags ["Users"]
                     :description "Lookup users by various identifiers (username, email, login ID, or Discord ID)"
                     :parameters {:query [:map                                         [:user_name {:description "Username to lookup" :optional true} :string]
                                          [:email {:description "Email to lookup" :optional true} :string]
                                          [:login_id {:description "Login ID (username or email) to lookup" :optional true} :string]
                                          [:discord_id {:description "Discord ID to lookup" :optional true} :string]]}
                     :responses {200 {:description "User found"
                                      :content {:default {:schema UserSchema
                                                          :examples {:ok {:value {:user_name "example_user" :temporary false}}}}}}
                                 404 {:description "User not found"
                                      :content {:default {:schema ErrorSchema
                                                          :examples {:ok {:value {:message "user not found"}}}}}}}
                     :handler get-user}}]
    ["/tag" {:get {:no-doc false 
                   :summary "List accessible tags" 
                   :tags ["Tags"] 
                   :description "Lists tags the user has access to, separated into public, private, and unlisted categories" 
                   :responses {200 {:description "Available tags"
                                    :content {:default {:schema [:map
                                                                 [:public [:vector TagSchema]]
                                                                 [:private [:vector TagSchema]]
                                                                 [:unlisted [:vector TagSchema]]]
                                                        :examples {:ok {:value {:public [{:id 1 :title "Public Tag" :slug "public-tag" :vote_count 10 :owner "user1" :created_at "2023-01-01T12:00:00Z"}]
                                                                                :private [{:id 2 :title "Private Tag" :slug "private-tag" :vote_count 5 :owner "user1" :created_at "2023-01-01T12:00:00Z"}]
                                                                                :unlisted [{:id 3 :title "Unlisted Tag" :slug "unlisted-tag" :vote_count 2 :owner "user1" :created_at "2023-01-01T12:00:00Z"}]}}}}}}} 
                   :handler query-tags} 
             :post {:no-doc false
                    :openapi {:security [{"apiKeyAuth" []
                                          "cookieAuth" []}]}
                    :middleware [[wrap-rate-limit one-per-minute]]
                    :summary "Create or update tag"
                    :tags ["Tags"]
                    :description "Creates a new tag or updates an existing one. For updates, include tag_id. For new tags, omit tag_id. The system prevents creation of duplicate tags in the same namespace and validates that provided slugs match the title."
                    :parameters {:body [:map
                                        [:id {:description "ID of tag to update (omit for new tags)" :optional true} [:maybe :int]]
                                        [:title {:description "Title of the tag" :jsonschema/example "Techno Bangers"} :string]
                                        [:slug {:description "Optional slug override (must match sluj of title if provided)" :optional true} [:maybe :string]]
                                        [:description {:description "Description of the tag" :optional true :jsonschema/example "a collection of techno bangers"} :string]
                                        [:ns {:description "Namespace for the tag (deprecated, use namespace instead)" :optional true :jsonschema/example "_deprecated_use_namespace_instead"} [:maybe :string]]
                                        [:namespace {:description "Namespace for the tag" :optional true :jsonschema/example "music"} [:maybe :string]]
                                        [:unlisted {:description "Whether the tag is unlisted" :optional true :jsonschema/example false} :boolean]
                                        [:nsfw {:description "Whether the tag is NSFW" :optional true :jsonschema/example false} :boolean]
                                        [:domain_pk_namespace {:description "Domain namespace" :optional true :jsonschema/example "spotify.playlist"} :string]
                                        [:domain_pk {:description "Domain primary key" :optional true :jsonschema/example "1234567890"} :string]
                                        [:domain_url {:description "Domain URL" :optional true :jsonschema/example "https://open.spotify.com/playlist/1234567890"} :string]
                                        [:hide_item_authors {:description "Whether to hide the author of items in the tag" :optional true :jsonschema/example false} :boolean]]}
                    :responses {200 {:description "Tag created/updated successfully"
                                     :content {:default {:schema [:map
                                                                  [:id :int]
                                                                  [:title :string]
                                                                  [:slug :string]
                                                                  [:description {:optional true} :string] 
                                                                  [:owner :string]
                                                                  [:created_at :string]
                                                                  [:edited_at :string]
                                                                  [:unlisted :boolean]
                                                                  [:ns {:optional true} [:maybe :string]]
                                                                  [:nsfw {:optional true} [:maybe :boolean]]
                                                                  [:domain_pk_namespace {:optional true} [:maybe :string]]
                                                                  [:domain_pk {:optional true} [:maybe :string]]
                                                                  [:domain_url {:optional true} [:maybe :string]]
                                                                  [:hide_item_authors {:optional true} [:maybe :boolean]]] 
                                                         :examples {:ok {:value {:id 356
                                                                                 :title "r and b"
                                                                                 :slug "r-and-b"
                                                                                 :description "thje wekend"
                                                                                 :owner "admin"
                                                                                 :created_at "2025-03-06T02:05:44.483Z"
                                                                                 :edited_at "2025-03-06T02:05:44.483Z"
                                                                                 :unlisted false
                                                                                 :ns "spotify" 
                                                                                 :domain_pk_namespace "spotify.playlist"
                                                                                 :domain_pk "1234567890"}}}}}}
                                401 {:description "Authentication required"
                                     :content {:default {:schema ErrorSchema
                                                         :examples {:ok {:value {:message "need to be logged in to make tag"}}}}}}
                                403 {:description "Not authorized to edit this tag"
                                     :content {:default {:schema ErrorSchema
                                                         :examples {:ok {:value {:message "you can not edit tags you do not own"}}}}}}
                                409 {:description "Tag already exists"
                                     :content {:default {:schema ErrorSchema
                                                         :examples {:ok {:value {:message "A tag with this name already exists in this namespace"}
                                                                                :error "duplicate_tag"
                                                                                :existing_tag_id 123}}}}}
                                422 {:description "Validation failed"
                                     :content {:default {:schema ErrorSchema
                                                         :examples {:ok {:value {:message "Title does not match provided slug"}
                                                                                :error "validation_failed"
                                                                                :provided-slug "wrong-slug"
                                                                                :generated-slug "correct-slug"}}}}}}
                    :handler post-tag}
             :delete {:no-doc false
                      :openapi {:security [{"apiKeyAuth" []
                                            "cookieAuth" []}]}
                      :summary "Delete tag"
                      :tags ["Tags"]
                      :description "Deletes an existing tag. User must be the owner of the tag."
                      :parameters {:query [:map
                                           [:id {:description "ID of the tag to delete"} :string]]}
                      :responses {200 {:description "Tag deleted successfully"
                                       :content {:default {:schema [:map [:deleted :boolean]]
                                                           :examples {:ok {:value {:deleted true}}}}}}
                                  401 {:description "Authentication required"
                                       :content {:default {:schema ErrorSchema
                                                           :examples {:ok {:value {:message "must own tag"}}}}}}} 
                      :handler delete-tag}}]
    ["/tag/namespace" {:get {:no-doc false
                             :summary "List available namespaces"
                             :tags ["Tags"]
                             :description "Returns a list of all namespaces the current user can view"
                             :responses {200 {:description "List of accessible namespaces"
                                              :content {:default {:schema [:map
                                                                           [:namespaces [:vector :string]]]
                                                                  :examples {:ok {:value {:namespaces ["music" "movies" "books"]}}}}}}} 
                             :handler get-namespaces}}]
    ["/tag/exists" {:get {:no-doc false
                          :summary "Check if tag exists by title, slug and namespace"
                          :tags ["Tags"]
                          :description "Checks if a tag with given title or slug exists in the specified namespace"
                          :parameters {:query [:map
                                               [:title {:description "Title to check" :optional true} :string]
                                               [:slug {:description "Slug to check directly (overrides title if provided)" :optional true} :string]
                                               [:ns {:description "Namespace to check in (deprecated, use namespace instead)" :optional true} [:maybe :string]]
                                               [:namespace {:description "Namespace to check in" :optional true} [:maybe :string]]]}
                          :responses {200 {:description "Existence check results"
                                           :content {:default {:schema [:map
                                                                        [:slug :string]
                                                                        [:exists :boolean]
                                                                        [:id {:optional true} :int]
                                                                        [:title {:optional true} :string]
                                                                        [:namespace {:optional true} [:maybe :string]]
                                                                        [:owner {:optional true} :string]]
                                                               :examples {:ok {:value {:slug "example-tag" 
                                                                                       :exists false
                                                                                       :id 123
                                                                                       :title "example-tag"
                                                                                       :namespace "music"
                                                                                       :owner "admin"}}}}}}
                                      400 {:description "Missing required parameters"
                                           :content {:default {:schema ErrorSchema
                                                               :examples {:ok {:value {:message "Either title or slug parameter is required"}}}}}}}
                          :handler tag-slug-check}

                    :post {:no-doc false
                           :summary "Check if tag exists"
                           :tags ["Tags"]
                           :description "Checks if a tag exists by various identifiers: title/slug with namespace, or domain identifiers"
                           :parameters {:body [:map
                                               [:title {:description "Title to check" :optional true} :string]
                                               [:slug {:description "Slug to check directly (overrides title if provided)" :optional true} :string]
                                               [:ns {:description "Namespace to check in (deprecated, use namespace instead)" :optional true} :string]
                                               [:namespace {:description "Namespace to check in" :optional true} [:maybe :string]]
                                               [:domain_pk_namespace {:description "Domain namespace" :optional true} :string]
                                               [:domain_pk {:description "Domain primary key" :optional true} :string]]}
                           :responses {200 {:description "Existence check results"
                                            :content {:default {:schema [:map
                                                                         [:exists :boolean]
                                                                         [:slug :string]
                                                                         [:id {:optional true} :int]
                                                                         [:title {:optional true} :string]
                                                                         [:namespace {:optional true} [:maybe :string]]
                                                                         [:owner {:optional true} :string]]
                                                                :examples {:non_existent {:value {:exists false
                                                                                                  :slug "example-tag"}}
                                                                           :exists {:value {:exists true
                                                                                            :slug "example-tag"
                                                                                            :id 123
                                                                                            :title "Example Tag"
                                                                                            :namespace "examples"
                                                                                            :owner "admin"}}}}}}
                                       400 {:description "Invalid request parameters"
                                            :content {:default {:schema ErrorSchema
                                                                :examples {:ok {:value {:message "Either title/slug or domain_pk_namespace+domain_pk are required"}}}}}}}
                           :handler tag-exists-check}}] 
    ["/tag/page" {:get {:no-doc false
                        :tags ["Tags"]
                        :summary "Get tag page with sorted items and voting pairs"
                        :description "Retrieves a tag page with sorted items, voting pairs, and permissions. This endpoint provides all the data needed to display a tag's ranking page."
                        :parameters {:query [:map
                                             [:id {:description "ID of the tag to get page for"} :int]
                                             [:users {:description "Filter votes by specific users (dot-separated list of usernames or group IDs)" :optional true} :string]
                                             [:pinned_left {:description "ID of item to pin on the left side of the voting pair" :optional true} :int]
                                             [:pinned_right {:description "ID of item to pin on the right side of the voting pair" :optional true} :int] 
                                             [:elo {:description "Whether to use ELO ranking algorithm" :optional true} :boolean]
                                             [:attribute {:description "Title of attribute to filter votes by" :optional true} :string]
                                             [:namespace {:description "Namespace to filter items by instead of using tag ID" :optional true} :string]]}
                        :responses {200 {:description "Tag page data retrieved successfully"
                                         :content {:default {:schema TagPageResponseSchema
                                                             :examples {:ok {:value {:tag {:id 1
                                                                                           :title "Example Tag"
                                                                                           :slug "example-tag"
                                                                                           :owner "user1"
                                                                                           :created_at "2023-01-01T12:00:00Z"}
                                                                                     :sorted [{:id 1
                                                                                               :title "Top Item"
                                                                                               :elo 1500.0
                                                                                               :vote_count 10
                                                                                               :num_comments 0
                                                                                               :owner "user1"
                                                                                               :created_at "2023-01-01T12:00:00Z"}]
                                                                                     :unsorted [{:id 2
                                                                                                 :title "New Item"
                                                                                                 :owner "user2"
                                                                                                 :created_at "2023-01-01T12:00:00Z"
                                                                                                 :num_comments 0}]
                                                                                     :skipped []
                                                                                     :perms {:can_vote true
                                                                                             :can_add true
                                                                                             :can_view true}
                                                                                     :users_who_voted [{:user_name "user1"}]
                                                                                     :pair [{:id 3
                                                                                             :title "Left Item"
                                                                                             :owner "user1"
                                                                                             :num_comments 0
                                                                                             :created_at "2023-01-01T12:00:00Z"}
                                                                                            {:id 4
                                                                                             :title "Right Item"
                                                                                             :owner "user2"
                                                                                             :num_comments 0
                                                                                             :created_at "2023-01-01T12:00:00Z"}]
                                                                                     :votes [{:id 1
                                                                                              :left_item_id 3
                                                                                              :right_item_id 4
                                                                                              :magnitude 36
                                                                                              :owner "user1"
                                                                                              :attribute 0
                                                                                              :created_at "2023-01-01T12:00:00Z"}]
                                                                                     :attributes [{:id 0
                                                                                                   :title "default"
                                                                                                   :owner "all"
                                                                                                   :created_at "2023-01-01T12:00:00Z"}]
                                                                                     :selected_attribute {:id 0
                                                                                                          :title "default"
                                                                                                          :owner "all"
                                                                                                          :created_at "2023-01-01T12:00:00Z"}}}}}}}}
                        :handler tag-info-request}}] 
    ["/tag/page2" {:get {:no-doc false

                         :openapi {:deprecated true}
                         :tags ["Tags"]
                         :summary "Get tag info"
                         :description "Get the info for a tag"
                         :handler tag-info-request2}}]
    ["/tag/permissions" {:get {:no-doc false
                               :tags ["Tags"]
                               :summary "Get tag permissions"
                               :description "Get the permissions for a tag"
                               :handler perms/get-perms}
                         :post {:no-doc false
                                :tags ["Tags"]
                                :middleware [[wrap-rate-limit one-per-minute]]
                                :summary "Update tag permissions"
                                :description "Update the permissions for a tag"
                                :handler perms/post-perms}}]
    ["/vote" {:post {:no-doc false
                     :openapi {:security [{"apiKeyAuth" []
                                           "cookieAuth" []}]}
                     :middleware [[wrap-rate-limit one-per-second]]
                     :summary "Record a vote"
                     :tags ["Votes"]
                     :description "Records a user's vote comparing two items. The magnitude indicates the strength of preference. \nThe attribute parameter can be specified in multiple ways: as a direct numeric ID, as an object with ID field, or as an object with a title field to create a new attribute."
                     :parameters {:body [:map
                                         [:left_item_id {:description "ID of the left item in comparison"} :int]
                                         [:right_item_id {:description "ID of the right item in comparison"} :int]
                                         [:magnitude {:description "Strength of preference (1-5)"} :int]
                                         [:tag_id {:description "ID of the tag context for this vote"} :int] 
                                         [:attribute {:description "attribute id"} :int]]}
                     :responses {200 {:description "Vote recorded"
                                      :content {:default {:schema VoteSchema
                                                          :examples {:ok {:value {:id 1
                                                                                  :left_item_id 1
                                                                                  :right_item_id 2
                                                                                  :magnitude 3
                                                                                  :owner "user1"
                                                                                  :attribute 1
                                                                                  :created_at "2023-01-01T12:00:00Z"}}}}}}
                                 401 {:description "Authentication required"
                                      :content {:default {:schema ErrorSchema
                                                          :examples {:unauthenticated {:value {:message "must be logged in to vote"}}}}}}}
                     :handler vote/vote-post}
              :delete {:no-doc false
                       :openapi {:security [{"apiKeyAuth" []
                                             "cookieAuth" []}]}
                       :summary "Delete a vote"
                       :tags ["Votes"]
                       :description "Deletes a vote by ID. User must be the owner of the vote or an admin."
                       :parameters {:body [:map
                                           [:vote_id {:description "ID of the vote to delete"} :int]]}
                       :responses {200 {:description "Vote deleted"
                                        :content {:default {:schema [:map [:ok :boolean]]
                                                            :examples {:ok {:value {:ok true}}}}}}
                                   401 {:description "Not authorized to delete this vote"
                                        :content {:default {:schema ErrorSchema
                                                            :examples {:ok {:value {:message "must own vote"}}}}}}}
                       :handler vote/vote-delete}
              :get {:no-doc false
                    :openapi {:security [{"apiKeyAuth" []
                                          "cookieAuth" []}]}
                    :summary "Get votes for a tag"
                    :tags ["Votes"]
                    :description "Retrieves votes for items in a specific tag. User must have view permission for the tag."
                    :parameters {:query [:map
                                         [:tag {:description "Tag ID or slug to get votes for"} :string]
                                         [:attribute {:description "Optional attribute ID or title to filter by" :optional true} :string]
                                         [:user {:description "Optional username to filter votes by" :optional true} :string]
                                         [:users {:description "Optional list of usernames to filter votes by, comma separated" :optional true} :string]
                                         [:until {:description "Optional timestamp to filter votes up until (ISO format)" :optional true} :string]
                                         [:since {:description "Optional timestamp to filter votes since (ISO format)" :optional true} :string]]}
                    :responses {200 {:description "Votes retrieved"
                                     :content {:default {:schema [:map
                                                                  [:votes [:vector VoteSchema]]]
                                                         :examples {:ok {:value {:votes [{:id 1
                                                                                          :left_item_id 1
                                                                                          :right_item_id 2
                                                                                          :magnitude 3
                                                                                          :owner "user1"
                                                                                          :created_at "2023-01-01T12:00:00Z"
                                                                                          :attribute 1}]}}}}}}
                                404 {:description "Tag not found"
                                     :content {:default {:schema ErrorSchema
                                                         :examples {:ok {:value {:message "tag not found"}}}}}}
                                403 {:description "Not authorized to view this tag"
                                     :content {:default {:schema ErrorSchema
                                                         :examples {:ok {:value {:message "not authorized to view this tag"}}}}}}}
                    :handler vote/vote-get}}]
    ["/attribute" {:post {:no-doc false
                          :openapi {:security [{"apiKeyAuth" []
                                                "cookieAuth" []}]}
                          :middleware [[wrap-rate-limit one-per-second]]
                          :summary "Create attribute"
                          :tags ["Votes"]
                          :description "Creates a new attribute used for votes"
                          :parameters {:body [:map
                                              [:title {:description "Title of the attribute"} :string]
                                              [:description {:description "Description of the attribute" :optional true} :string]]}
                          :responses {200 {:description "Attribute created"
                                           :content {:default {:schema AttributeSchema
                                                               :examples {:ok {:value {:id 1
                                                                                       :title "quality"
                                                                                       :description "How good is this item"
                                                                                       :owner "user1"
                                                                                       :created_at "2023-01-01T12:00:00Z"
                                                                                       :edited_at "2023-01-01T12:00:00Z"}}}}}}
                                      400 {:description "Attribute already exists"
                                           :content {:default {:schema ErrorSchema
                                                               :examples {:ok {:value {:message "attribute with this title already exists"}}}}}}
                                      401 {:description "Authentication required"
                                           :content {:default {:schema ErrorSchema
                                                               :examples {:ok {:value {:message "need to be logged in to create attribute"}}}}}}}
                          :handler vote/attribute-post}
                    :get {:no-doc false
                          :summary "List attributes"
                          :tags ["Votes"]
                          :description "Retrieves all available attributes"
                          :responses {200 {:description "List of attributes"
                                           :content {:default {:schema [:map
                                                                        [:attributes [:vector AttributeSchema]]]
                                                               :examples {:ok {:value {:attributes [
                                                                                                    {:id 0
                                                                                                     :title "default"
                                                                                                     :description "default attribute, means what upvoting means on other sites"
                                                                                                     :owner "all"
                                                                                                     :created_at "2023-01-01T12:00:00Z"
                                                                                                     :edited_at "2023-01-01T12:00:00Z"},
                                                                                                    {:id 1
                                                                                                     :title "quality"
                                                                                                     :description "How good is this item"
                                                                                                     :owner "user1"
                                                                                                     :created_at "2023-01-01T12:00:00Z"
                                                                                                     :edited_at "2023-01-01T12:00:00Z"}]}}}}}}} 
                                      
                          :handler vote/attribute-get}}]
    ["/item" {:middleware [[wrap-rate-limit one-per-second]]
              :post {:no-doc false
                     :openapi {:security [{"apiKeyAuth" []
                                           "cookieAuth" []}]}
                     :summary "Create or update item"
                     :tags ["Items"]
                     :description "Creates a new item or updates an existing one. For updates, include the item ID. For new items, omit the ID. When creating an item, it will automatically be added to the specified tag. URLs for YouTube, TikTok, Spotify, and Twitter will be automatically processed to extract domain-specific identifiers.\nWARNING: returns a LIST of items, not a single item. This is because the item may be added to multiple tags, and the list is the only way to return all of them."
                     :parameters {:body [:map
                                         [:id {:description "ID of item to update (omit for new items)" :optional true :jsonschema/example 123} :int]
                                         [:title {:description "Title of the item" :jsonschema/example "My Awesome Item"} :string]
                                         [:body {:description "Body of the item, can be markdown, will render images & code blocks" :optional true :jsonschema/example "This is the content of my item with **markdown** support."} :string]
                                         [:url {:description "URL of the item. URLs from YouTube, TikTok, Spotify, and Twitter will be automatically processed." :optional true :jsonschema/example "https://example.com/resource"} :string]
                                         [:tag_id {:description "ID of the tag to add this item to" :jsonschema/example 42} :int]
                                         [:domain_pk_namespace {:description "Domain namespace. If set to IMG, manual forced image rendering will be used for the URL." :optional true :jsonschema/example "IMG"} :string]
                                         [:domain_pk {:description "Domain primary key -- ie for spotify, the playlist id" :optional true :jsonschema/example "item-unique-id-123"} :string]
                                         [:discord_channel_id {:description "Discord channel ID when creating an item from Discord" :optional true} :string]
                                         [:discord_server_id {:description "Discord server ID when creating an item from Discord" :optional true} :string]]}
                     :responses {200 {:description "Item created/updated"
                                      :content {:default {:schema ItemSchema
                                                          :examples {:ok {:value {:id 1
                                                                                  :title "New Item"
                                                                                  :slug "new-item"
                                                                                  :body "Item content"
                                                                                  :url "https://example.com/resource"
                                                                                  :owner "user1"
                                                                                  :created_at "2023-01-01T12:00:00Z"
                                                                                  :domain_pk_namespace "youtube.video"
                                                                                  :domain_pk "dQw4w9WgXcQ"}}}}}}
                                 401 {:description "Authentication required"
                                      :content {:default {:schema ErrorSchema
                                                          :examples {:ok {:value {:message "must be logged in to create items"}}}}}}
                                 403 {:description "Not authorized to update this item"
                                      :content {:default {:schema ErrorSchema
                                                          :examples {:ok {:value {:message "must own item to update it"}}}}}}}}
              :handler item/item-post}]
    ["/item/exists" {:get {:no-doc false
                           :summary "Check if item exists by title and optionally tag_id"
                           :tags ["Items"]
                           :description "Checks if an item with given title exists and optionally if it belongs to the specified tag"
                           :parameters {:query [:map
                                                [:title {:description "Title to check"} :string]
                                                [:tag_id {:description "Tag ID to check if item belongs to" :optional true} :string]]}
                           :responses {200 {:description "Existence check results"
                                            :content {:default {:schema [:map
                                                                         [:slug :string]
                                                                         [:exists :boolean]
                                                                         [:in_tag {:optional true} :boolean] 
                                                                         [:id {:optional true} :int]
                                                                         [:title {:optional true} :string]]
                                                                :examples {:ok {:value {:slug "example-item" 
                                                                                        :exists true
                                                                                        :in_tag true
                                                                                        :id 123
                                                                                        :title "Example Item"}}}}}}}}
                     :handler item/item-slug-check
                     :post {:no-doc false
                            :summary "Check if item exists by various parameters"
                            :tags ["Items"]
                            :description "Checks if an item exists by title, domain identifiers, and optionally checks if it belongs to a tag"
                            :parameters {:body [:map
                                                [:title {:description "Title to check" :optional true} :string]
                                                [:tag_id {:description "Tag ID to check if item belongs to" :optional true} :int]
                                                [:domain_pk_namespace {:description "Domain namespace" :optional true} :string]
                                                [:domain_pk {:description "Domain primary key" :optional true} :string]]}
                            :responses {200 {:description "Existence check results"
                                             :content {:default {:schema [:map
                                                                          [:exists :boolean]
                                                                          [:in_tag {:optional true} :boolean]
                                                                          [:id {:optional true} :int]
                                                                          [:title {:optional true} :string]]
                                                                 :examples {:ok {:value {:exists true
                                                                                         :in_tag false
                                                                                         :id 123
                                                                                         :title "Example Item"}}}}}}
                                        400 {:description "Invalid request parameters"
                                             :content {:default {:schema ErrorSchema
                                                                 :examples {:ok {:value {:message "Either title or domain_pk_namespace+domain_pk are required"}}}}}}}
                            :handler item/item-exists-check}}]
    ["/item/membership" {:get {:no-doc false
                               :tags ["Items"]
                               :summary "Get item membership information"
                               :description "Retrieves information about which tags an item belongs to and which items the user has skipped"
                               :parameters {:query [:map
                                                    [:item_id {:description "ID of the item to get membership information for"} :string]]}
                               :responses {200 {:description "Item membership information"
                                                :content {:default {:schema [:map
                                                                             [:membership [:vector [:map
                                                                                                    [:item_id :int]
                                                                                                    [:tag_id :int]
                                                                                                    [:discord_channel_id {:optional true} [:maybe :string]]
                                                                                                    [:discord_server_id {:optional true} [:maybe :string]]
                                                                                                    [:tags/id :int]
                                                                                                    [:tags/title :string]
                                                                                                    [:tags/slug :string]
                                                                                                    [:tags/owner :string]]]]
                                                                             [:skips [:vector [:map
                                                                                               [:item_id :int]
                                                                                               [:owner :string]]]]]
                                                                    :examples {:ok {:value {:membership [{:item_id 123
                                                                                                          :tag_id 42
                                                                                                          :tags/id 42
                                                                                                          :tags/title "Example Tag"
                                                                                                          :tags/slug "example-tag"
                                                                                                          :tags/owner "user1"}]
                                                                                            :skips []}}}}}}}
                               :handler item/item-m-get}
                         :delete {:no-doc false
                                  :tags ["Items"]
                                  :openapi {:security [{"apiKeyAuth" []
                                                        "cookieAuth" []}]}
                                  :summary "Remove item from tag"
                                  :description "Removes an item from a tag. User must be the owner of the item or an admin."
                                  :parameters {:body [:map
                                                      [:item_id {:description "ID of the item to remove from tag"} :int]
                                                      [:tag_id {:description "ID of the tag to remove item from"} :int]]}
                                  :responses {200 {:description "Item removed from tag"
                                                   :content {:default {:schema [:map [:ok :boolean]]
                                                                       :examples {:ok {:value {:ok true}}}}}}
                                              401 {:description "Not authorized to remove this item"
                                                   :content {:default {:schema ErrorSchema
                                                                       :examples {:ok {:value {:message "must own item to remove it from tag"}}}}}}}
                                  :handler item/item-m-delete}
                         :post {:no-doc false
                                :tags ["Items"]
                                :openapi {:security [{"apiKeyAuth" []
                                                      "cookieAuth" []}]}
                                :summary "Add item to tag"
                                :description "Adds an existing item to a tag. User must have add permission on the target tag."
                                :parameters {:body [:map
                                                    [:item_id {:description "ID of the item to add to tag"} :int]
                                                    [:tag_id {:description "ID of the tag to add item to"} :int]
                                                    [:discord_channel_id {:description "Discord channel ID when adding from Discord" :optional true} :string]
                                                    [:discord_server_id {:description "Discord server ID when adding from Discord" :optional true} :string]]}
                                :responses {200 {:description "Item added to tag"
                                                 :content {:default {:schema [:map [:ok :boolean]]
                                                                     :examples {:ok {:value {:ok true}}}}}}
                                            401 {:description "Not authorized to add to this tag"
                                                 :content {:default {:schema ErrorSchema
                                                                     :examples {:ok {:value {:message "must have add permission on target tag"}}}}}}}
                                :handler item/item-m-post}}]
    ["/item/skip" {:post {:no-doc false
                          :tags ["Items"]
                          :openapi {:security [{"apiKeyAuth" []
                                                "cookieAuth" []}]}
                          :summary "Skip item"
                          :description "Marks an item as skipped for the current user, so it won't appear in voting pairs for them"
                          :parameters {:body [:map
                                              [:item_id {:description "ID of the item to skip"} :int]]}
                          :responses {200 {:description "Item skipped"
                                           :content {:default {:schema [:map [:ok :boolean]]
                                                               :examples {:ok {:value {:ok true}}}}}}
                                      401 {:description "Authentication required"
                                           :content {:default {:schema ErrorSchema
                                                               :examples {:ok {:value {:message "must be logged in to skip"}}}}}}}
                          :handler item/item-skip}
                   :delete {:no-doc false
                            :tags ["Items"]
                            :openapi {:security [{"apiKeyAuth" []
                                                  "cookieAuth" []}]}
                            :summary "Unskip item"
                            :description "Removes an item from the user's skipped items list, so it can appear in voting pairs again"
                            :parameters {:body [:map
                                                [:item_id {:description "ID of the item to unskip"} :int]]}
                            :responses {200 {:description "Item unskipped"
                                             :content {:default {:schema [:map [:ok :boolean]]
                                                                 :examples {:ok {:value {:ok true}}}}}}
                                        401 {:description "Authentication required"
                                             :content {:default {:schema ErrorSchema
                                                                 :examples {:ok {:value {:message "must be logged in to skip"}}}}}}}
                            :handler item/item-skip-delete}}]
    ["/register" {:post {:no-doc false
                         :summary "Register user"
                         :tags ["Authentication"]
                         :description "Creates a new user account and sends verification email"
                         :parameters {:body [:map
                                             [:user_name {:description "Username for new account"} :string]
                                             [:email {:description "Email address for new account"} :string]
                                             [:password {:description "Password for new account"} :string]]}
                         :responses {200 {:description "Registration successful"
                                          :content {:default {:schema [:map
                                                                       [:success :boolean]
                                                                       [:message :string]]
                                                              :examples {:ok {:value {:success true :message "Verification email sent"}}}}}}
                                     400 {:description "Invalid registration data"
                                          :content {:default {:schema ErrorSchema
                                                              :examples {:ok {:value {:message "Username already taken"}}}}}}}
                         :handler login/handle-register}}]
    ["/login" {:post {:no-doc false
                      :summary "Login user"
                      :tags ["Authentication"]
                      :description "Authenticates user by username/email and password"
                      :parameters {:body [:map
                                          [:user_name {:description "Username or email"} :string]
                                          [:password {:description "Password"} :string]]}
                      :responses {200 {:description "Logged in successfully"
                                       :content {:default {:schema [:map
                                                                    [:success :boolean]
                                                                    [:user_name :string]]
                                                           :examples {:ok {:value {:success true :user_name "example_user"}}}}}}
                                  401 {:description "Invalid credentials"
                                       :content {:default {:schema ErrorSchema
                                                           :examples {:ok {:value {:message "Invalid username or password"}}}}}}
                                  403 {:description "Email verification required"
                                       :content {:default {:schema ErrorSchema
                                                           :examples {:ok {:value {:message "Please verify your email address"}}}}}}}
                      :handler login/handle-login}

               :get {:no-doc false
                     :summary "Get current session"
                     :tags ["Authentication"]
                     :description "Returns information about the current session"
                     :responses {200 {:description "Current session information"
                                      :content {:default {:schema [:map
                                                                   [:authenticated :boolean]
                                                                   [:user_name {:optional true} :string]]
                                                          :examples {:authenticated {:value {:authenticated true :user_name "example_user"}}
                                                                     :not-authenticated {:value {:authenticated false}}}}}}}
                     :handler current-session}}]

    ["/logout" {:post {:no-doc false
                       :openapi {:security [{"cookieAuth" []}]}
                       :summary "Logout user"
                       :tags ["Authentication"]
                       :description "Ends the current session for user"
                       :responses {200 {:description "Logged out successfully"
                                        :content {:default {:schema [:map [:success :boolean]]
                                                            :examples {:ok {:value {:success true}}}}}}}
                       :handler login/handle-logout}}]

    ["/send-confirmation" {:post {:no-doc false
                                  :openapi {:security [{"cookieAuth" []}]}
                                  :summary "send/resend verification email" 
                                  :tags ["Authentication"]
                                  :description "Sends a verification email to the user's email address to confirm their email address / finish registration"
                                  :middleware [[wrap-rate-limit three-per-five-minutes]]
                                  :handler login/handle-resend-verification}}]
    ["/verify" {:get {:no-doc false
                      :openapi {:security [{"cookieAuth" []}]}
                      :tags ["Authentication"]
                      :summary "Verify email"
                      :description "Verifies the user's email address"
                      :middleware [[wrap-rate-limit five-per-minute]]
                      :handler login/handle-verify-email}}]
    ["/update-email" {:post {:no-doc false
                             :openapi {:security [{"cookieAuth" []}]}
                             :tags ["Authentication"]
                             :summary "Update email"
                             :description "Updates the user's email address"
                             :middleware [[wrap-rate-limit three-per-five-minutes]]
                             :handler login/handle-update-email}}]
    ["/forgot-password" {:post {:no-doc false
                                :openapi {:security [{"cookieAuth" []}]}
                                :tags ["Authentication"]
                                :summary "Forgot password"
                                :description "Sends a password reset email to the user's email address"
                                :middleware [[wrap-rate-limit three-per-five-minutes]]
                                :handler login/handle-forgot-password}}]
    ["/reset-password" {:post {:no-doc false
                               :openapi {:security [{"cookieAuth" []}]}
                               :tags ["Authentication"]
                               :summary "Reset password"
                               :description "Resets the user's password"
                               :middleware [[wrap-rate-limit three-per-five-minutes]]
                               :handler login/handle-reset-password}}]

    ["/spotify" {:tags ["Integrations"]} spotify/routes]
    ["/youtube" {:tags ["Integrations"]} youtube/routes]
    ["/linear" {:tags ["Integrations"]} linear/routes]
    ["/reddit" {:tags ["Integrations"]} reddit/routes]
    ["/twitter" {:tags ["Integrations"]} twitter/routes]
    ["/discord" {:tags ["Integrations"]} discord/routes]

    ["/integrations" {:tags ["Integrations"]} integrations/routes]
    ["/comments" {:tags ["Comments"]} comments/routes]
    ["/user_group" {:tags ["Groups"]} groups/routes]
    ;; ["/viz" 
    ;;  ["/items" {:get {:no-doc true
    ;;                   :middleware [[wrap-rate-limit five-per-minute]]
    ;;                   :handler get-viz-items}}]
    ;;  ["/votes" {:get {:no-doc true
    ;;                   :middleware [[wrap-rate-limit five-per-minute]]
    ;;                   :handler get-viz-votes}}]] 
    ["/keys" {:tags #{"API Keys"} 
              :openapi {:security [{"apiKeyAuth" []
                                    "cookieAuth" []}]}
              :middleware [[wrap-rate-limit five-per-minute]]} 
     api-keys/routes]
    ["/docs"
     {:get {:no-doc true
            :handler (fn [_] {:status 302
                              :headers {"Location" "/api/docs/"}
                              :body ""})}}]
    ["/docs/*"
     {:get {:no-doc true
            :handler (swagger-ui/create-swagger-ui-handler
                      {:url "/openapi.json"
                       :config {:validatorUrl nil 
                                :operationsSorter "alpha"}})}}]]])
   

(defn wrap-request-logging [handler]
  (fn [request]
    (log/info "Request:" (:request-method request) (:uri request))
    (log/debug "Full request details:"
               {:uri (:uri request)
                :request-method (:request-method request)
                :params (:params request)
                :query-params (:query-params request)
                :body-params (:body-params request)
                :session (:session request)})
    (let [response (handler request)]
      (log/info "Response:" (:status response))
      (log/debug "Full response details:"
                 {:status (:status response)
                  :headers (:headers response)
                  :body (if (and (map? (:body response))
                                 (not (instance? java.io.InputStream (:body response))))
                          (str "Body: " (:body response))
                          "Body: [binary or stream]")})
      response)))

(defn wrap-discord-user-auth
  "Middleware that adds user context for Discord requests"
  [handler]
  (fn [request]
    (try
      ;;(log/info "DISCORD USER AUTH START" (:discord request))
      (if-let [discord-context (:discord request)]
        (let [user-id (:user-id discord-context)
              username (:username discord-context)
              user (discord/get-or-create-discord-user user-id username)
              request-with-user (assoc-in request [:session :user_name] (:users/user_name user))]
          (handler request-with-user))
        (do
          (handler request)))
      (catch Exception e
        (log/error e "CRITICAL: Unhandled exception in wrap-discord-user-auth")
        (handler request)))))

(defn wrap-discord-auth
  "Middleware that authenticates requests from the Discord bot"
  [handler]
  (fn [request]
    (let [auth-header (get-in request [:headers "authorization"])
          discord-user-id (get-in request [:headers "x-discord-user-id"])
          discord-username (get-in request [:headers "x-discord-username"])]
      (log/debug "Discord auth attempt with user-id:" discord-user-id "username:" discord-username)
      (if (and (discord/validate-discord-request auth-header)
               discord-user-id
               discord-username)
        (do
          (log/info "Discord authentication successful for discord user:" discord-username)
          ;; Add Discord context to the request
          (handler (assoc request :discord {:user-id discord-user-id
                                            :username discord-username})))
        ;; Continue without Discord context
        (do
          (when auth-header
            (log/debug "Discord authentication failed or incomplete"))
          (handler request))))))


(def default-handler
  (fn [_] (resp/content-type (resp/resource-response "public/index.html") "text/html")))

(defn wrap-api-key-auth
  "Middleware that authenticates requests via API key if present"
  [handler]
  (fn [request]
    (let [api-key (get-in request [:headers "x-api-key"])] 
      (if api-key
        (if-let [username (api-keys/validate-api-key api-key)]
          ;; API key is valid, add user to session
          (do
            (log/debug "API key authentication successful for user:" username)
            (handler (assoc-in request [:session :user_name] username)))
          ;; Invalid API key
          (do
            (log/warn "Invalid API key attempt")
            {:status 403
             :body "no authorization"}))
        ;; No API key in request, continue with normal authentication
        (handler request)))))


(defn wrap-dev-session
  "Middleware that injects a dev session when AUTO_LOGIN=true"
  [handler]
  (fn [request]
    (if (= (System/getenv "AUTO_LOGIN") "true")
      (do
        (log/info "AUTO_LOGIN is true, injecting dev session")
        (handler (assoc request :session {:user_name "admin"})))
      (handler request))))

(defn error-response [exception request]
  (def exception exception)
  ;;(log/error "ex-data" ((ex-data exception)))
  (log/debug "exception" exception)
  (log/debug "exception type" (type exception))
  (log/debug "exception data" (ex-data exception))
  ;;(log/debug "can we coerce?" (= :reitit.coercion/response-coercion (:type (ex-data exception))))
  ;;(log/debug "malli explanation" (me/humanize (:data (ex-data exception))))
  (cond 
    (= (type exception) clojure.lang.ExceptionInfo)
    {:status (:status (ex-data exception))
     :body {:message (.getMessage exception)
            :error (ex-data exception)}} 
    
    :else
    {:status 500
     :body {:message (.getMessage exception)
            :data (ex-data exception)
            :error (->> exception Throwable->map)}}))

(def exception-middleware
  (exception/create-exception-middleware
   (merge exception/default-handlers 
          {::exception/wrap
           (fn [handler e request]
             ;;(log/error "error" (:uri request) e)
             (error-response e request))})))

(def m-instance (m/create
                 (-> m/default-options
                     (assoc-in [:formats "application/json" :encoder-opts]
                               {:encode-key-fn name}))))
  
;; Create a single shared session store instance
(def session-store (memory/memory-store))

(def app
  (-> (ring/ring-handler
       (ring/router routes
                    {:validate spec/validate
                     :exception pretty/exception
                     :conflicts nil
                     :data {:coercion (reitit.coercion.malli/create)
                            :muuntaja m-instance
                            :middleware
                            [(fn [handler]
                               (session/wrap-session handler {:store session-store}))
                             wrap-api-key-auth
                             wrap-dev-session 
                             swagger/swagger-feature
                             openapi/openapi-feature
                             parameters/parameters-middleware
                             muuntaja/format-negotiate-middleware
                             muuntaja/format-response-middleware
                             muuntaja/format-request-middleware
                             exception-middleware
                             coercion/coerce-request-middleware
                             coercion/coerce-response-middleware]}})
                            ;;  coercion/coerce-request-middleware
                            ;;  coercion/coerce-response-middleware
                              
                             
       (-> #'default-handler
           (wrap-resource "public")
           (wrap-content-type)))))

(defn start [{:keys [port]}]
  (log/info "Starting HTTP server on port" port)
  (jetty/run-jetty #'app {:port port :join? false :host "0.0.0.0"})
  (log/info "HTTP server running on port" port)
  (println (str "http server running on port " port)))
