(ns app.api-keys
  (:require [app.database :as db]
            [clojure.tools.logging :as log]
            [honey.sql.helpers :as h]
            [clojure.string :as string]
            [ring.util.response :as resp])
  (:import [java.util UUID]
           [java.security MessageDigest]
           [java.util Base64]))

;; Utility functions for API key management
(defn hash-api-key
  "Create a secure hash of an API key for storage"
  [api-key]
  (let [md (MessageDigest/getInstance "SHA-256")
        bytes (.digest md (.getBytes api-key "UTF-8"))]
    (.encodeToString (Base64/getEncoder) bytes)))

(defn generate-user-hash
  "Generate a short hash based on username"
  [username]
  (let [md (MessageDigest/getInstance "MD5")
        bytes (.digest md (.getBytes username "UTF-8"))
        encoded (.encodeToString (Base64/getEncoder) bytes)]
    (-> encoded
        (string/replace #"[^a-zA-Z0-9]" "")
        (subs 0 8))))

(defn create-api-key
  "Create a new API key with format sort_{user-hash}_{uuid}"
  [username]
  (let [user-hash (generate-user-hash username)
        uuid-part (str (UUID/randomUUID))]
    (str "sort_" user-hash "_" uuid-part)))

(defn create-api-key-preview
  "Create a preview of an API key showing first 8 chars and last 4"
  [api-key]
  (when api-key
    (let [length (count api-key)]
      (if (< length 13)
        api-key  ;; If key is too short, just return it
        (str (subs api-key 0 8) "..." (subs api-key (- length 4)))))))

(defn create-api-key-record
  "Create and store a new API key in the database"
  [username key-name]
  (let [api-key (create-api-key username)
        hashed-key (hash-api-key api-key)
        preview (create-api-key-preview api-key)]
    
    ;; Insert into database - ensure preview is included
    (db/exec! (-> (h/insert-into :api_keys)
                  (h/values [{:user_name username
                              :name key-name
                              :hashed_key hashed-key
                              :preview preview
                              :created_at [:now]
                              :active true}])))
    
    ;; Return the unhashed key (only time it will be available)
    api-key))

;; API handlers
(defn generate-api-key
  "Generate a new API key for a user"
  [req]
  (let [username (-> req :session :user_name)
        key-name (-> req :body-params :name)]
    
    (when-not username
      (throw (ex-info "Must be logged in to generate API key" {:status 401})))
    
    (when-not key-name
      (throw (ex-info "API key name is required" {:status 400})))
    
    ;; Check if name already exists for this user
    (let [existing-key (first (db/exec! (-> (h/select :*)
                                           (h/from :api_keys)
                                           (h/where [:and
                                                     [:= :user_name username]
                                                     [:= :name key-name]
                                                     [:= :active true]]))))]
      
      (when existing-key
        (throw (ex-info "API key with this name already exists" {:status 400})))
      
      (let [api-key (create-api-key-record username key-name)]
        (log/info "API key generated for user:" username "with name:" key-name)
        {:status 201
         :body {:api_key api-key
                :name key-name}}))))

(defn regenerate-api-key
  "Regenerate an existing API key"
  [req]
  (let [username (-> req :session :user_name)
        key-name (-> req :body-params :name)]
    
    (when-not username
      (throw (ex-info "Must be logged in to regenerate API key" {:status 401})))
    
    (when-not key-name
      (throw (ex-info "API key name is required" {:status 400})))
    
    ;; Check if key exists and belongs to user
    (let [existing-key (first (db/exec! (-> (h/select :*)
                                           (h/from :api_keys)
                                           (h/where [:and
                                                     [:= :user_name username]
                                                     [:= :name key-name]
                                                     [:= :active true]]))))]
      
      (when-not existing-key
        (throw (ex-info "API key not found or already revoked" {:status 404})))
      
      ;; Deactivate old key
      (db/exec! (-> (h/update :api_keys)
                    (h/set {:active false})
                    (h/where [:= :id (:api_keys/id existing-key)])))
      
      ;; Generate new key
      (let [api-key (create-api-key-record username key-name)]
        (log/info "API key regenerated for user:" username "with name:" key-name)
        {:status 200
         :body {:api_key api-key
                :name key-name}}))))

(defn revoke-api-key
  "Revoke an API key"
  [req]
  (let [username (-> req :session :user_name)
        key-name (-> req :body-params :name)]
    
    (when-not username
      (throw (ex-info "Must be logged in to revoke API key" {:status 401})))
    
    (when-not key-name
      (throw (ex-info "API key name is required" {:status 400})))
    
    ;; Check if key exists and belongs to user
    (let [existing-key (first (db/exec! (-> (h/select :*)
                                           (h/from :api_keys)
                                           (h/where [:and
                                                     [:= :user_name username]
                                                     [:= :name key-name]
                                                     [:= :active true]]))))]
      
      (when-not existing-key
        (throw (ex-info "API key not found or already revoked" {:status 404})))
      
      ;; Delete key instead of deactivating
      (db/exec! (-> (h/delete-from :api_keys)
                    (h/where [:and
                              [:= :user_name username]
                              [:= :name key-name]])))
      
      (log/info "API key revoked for user:" username "with name:" key-name)
      {:status 200
       :body {:success true
              :message "API key revoked successfully"}})))

(defn list-api-keys
  "List all active API keys for a user with previews"
  [req]
  (let [username (-> req :session :user_name)]
    
    (when-not username
      (throw (ex-info "Must be logged in to list API keys" {:status 401})))
    
    (let [keys (db/exec! (-> (h/select :name :created_at :preview :last_used_at)
                            (h/from :api_keys)
                            (h/where [:and
                                      [:= :user_name username]
                                      [:= :active true]])))]
      
      ;; Transform the keys to match the expected schema format
      (let [formatted-keys (mapv (fn [key]
                                  {:name (get key :api_keys/name)
                                   :created_at (str (get key :api_keys/created_at))
                                   :last_used_at (str (get key :api_keys/last_used_at))
                                   :preview (or (get key :api_keys/preview) "sort_...")})
                                keys)]
        {:status 200
         :body {:api_keys formatted-keys}}))))

(defn validate-api-key
  "Validate an API key and return the associated username if valid"
  [api-key]
  (when api-key
    (let [hashed-key (hash-api-key api-key)
          key-record (first (db/exec! (-> (h/select :*)
                                         (h/from :api_keys)
                                         (h/where [:and
                                                   [:= :hashed_key hashed-key]
                                                   [:= :active true]]))))]
      
      (when key-record
        ;; Update last_used_at
        (db/exec! (-> (h/update :api_keys)
                      (h/set {:last_used_at [:now]})
                      (h/where [:= :id (:api_keys/id key-record)])))
        
        ;; Return the username
        (:api_keys/user_name key-record)))))

;; Define routes for API key management
(def routes
  [["/"
    {:get {:no-doc false
           :summary "List all active API keys for a user"
           :tags ["API Keys"] 
           :responses {200 {:description "List of active API keys"
                            :body [:map [:api_keys [:vector [:map 
                                                             [:name {:json-schema/example "my-key"} string?]
                                                             [:created_at {:json-schema/example "2024-01-01 12:00:00"} string?]
                                                             [:last_used_at {:json-schema/example "2024-01-01 12:00:00"} string?]
                                                             [:preview {:json-schema/example "sort_..."} string?]]]]]}
                       401 {:description "Unauthorized - User not logged in"}}
           :handler list-api-keys}
     :post {:no-doc false
            :summary "Generate a new API key"
            :tags ["API Keys"]
            :parameters {:body [:map 
                                [:name {:json-schema/example "my-key"} string?]]}
            :responses {201 {:description "API key generated successfully"
                             :body [:map [:api_key {:json-schema/example "sort_1234567890_1234567890"} string?]
                                         [:name {:json-schema/example "my-key"} string?]]}
                        400 {:description "Bad request - Missing key name or key with name already exists"
                             :body [:map [:error {:json-schema/example "API key name is required"} string?]]} 
                        401 {:description "Unauthorized - User not logged in"
                             :body [:map [:error {:json-schema/example "Must be logged in to generate API key"} string?]]}}
            :handler generate-api-key}}]
   ["/regenerate"
    {:post {:no-doc false
            :summary "Regenerate an existing API key by name"
            :tags ["API Keys"]
            :parameters {:body [:map 
                                [:name {:json-schema/example "my-key"} string?]]}
            :responses {200 {:description "API key regenerated successfully"
                             :body [:map [:api_key {:json-schema/example "sort_1234567890_1234567890"} string?
                                          :name {:json-schema/example "my-key"} string?]]}
                        400 {:description "Bad request - Missing key name"
                             :body [:map [:error {:json-schema/example "API key name is required"} string?]]}
                        401 {:description "Unauthorized - User not logged in"
                             :body [:map [:error {:json-schema/example "Must be logged in to regenerate API key"} string?]]}
                        404 {:description "Not found - API key not found or already revoked"
                             :body [:map [:error {:json-schema/example "API key not found or already revoked"} string?]]}}
            :handler regenerate-api-key}}]
   ["/revoke"
    {:post {:no-doc false
            :summary "Revoke an API key by name"
            :tags ["API Keys"]
            :parameters {:body [:map 
                                [:name {:json-schema/example "my-key"} string?]]}
            :responses {200 {:description "API key revoked successfully"
                             :body [:map [:success {:json-schema/example true} boolean?
                                          :message {:json-schema/example "API key revoked successfully"} string?]]}
                        400 {:description "Bad request - Missing key name"
                             :body [:map [:error {:json-schema/example "API key name is required"} string?]]}
                        401 {:description "Unauthorized - User not logged in"
                             :body [:map [:error {:json-schema/example "Must be logged in to revoke API key"} string?]]}
                        404 {:description "Not found - API key not found or already revoked"
                             :body [:map [:error {:json-schema/example "API key not found or already revoked"} string?]]}}
            :handler revoke-api-key}}]]) 
