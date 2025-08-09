(ns sorter-test.test-http
  (:require [clojure.test :refer :all]
            [meander.epsilon :as m]
            [clojure.string :as str]
            [sorter-test.util :as util]))

;; Test state for managing created keys across tests
(def test-state (atom {:created-key-name nil
                       :created-full-key nil
                       :regenerated-full-key nil}))

(defn reset-test-state! []
  (reset! test-state {:created-key-name nil
                      :created-full-key nil
                      :regenerated-full-key nil}))

;; Helper functions
(defn uuid-str []
  (str (java.util.UUID/randomUUID)))

(defn assert-response-status [response expected-status]
  (is (= expected-status (:status response))
      (str "Expected status " expected-status ", got " (:status response)
           " with body: " (:body response))))

(defn assert-key-format [full-key]
  (is (string? full-key))
  (is (str/starts-with? full-key "sort_"))
  (let [parts (str/split full-key #"_")]
    (is (= 3 (count parts)) "Key should have 3 parts: sort_identifier_secret")
    (is (= "sort" (first parts)))
    (is (pos? (count (second parts))) "Identifier part should not be empty")
    (is (pos? (count (nth parts 2))) "Secret part should not be empty")))

(defn generate-fake-key []
  (let [fake-identifier (subs (str/replace (uuid-str) "-" "") 0 16)
        fake-secret (subs (str/replace (uuid-str) "-" "") 0 32)]
    (str "sort_" fake-identifier "_" fake-secret)))

;; Test fixtures
(deftest test-health-endpoint
  (testing "Health check endpoint basic functionality"
    (let [response (util/make-request :get "/health")]
      (assert-response-status response 200)
      (is (m/match (:body response)
            {:status "healthy"
             :version _}
            true))
      (println (str "Health check successful (Version: " (get-in response [:body :version]) ")")))))

;; Authentication Tests
(deftest test-protected-route-no-auth
  (testing "Accessing protected route without authentication"
    (let [response (util/make-request :get "/protected")]
      (assert-response-status response 401)
      (let [error-msg (get-in response [:body :error] "")]
        (is (or (str/includes? error-msg "No authentication credentials provided")
                (str/includes? error-msg "Unauthorized")))))))

(deftest test-protected-route-invalid-key-format
  (testing "Accessing protected route with invalid key format"
    (let [response (util/make-request :get "/protected" 
                                      :headers {"Authorization" "Bearer invalid-key-123"})]
      (assert-response-status response 401)
      (is (str/includes? (get-in response [:body :error] "") "Unauthorized")))))

(deftest test-protected-route-incorrect-key-value
  (testing "Accessing protected route with correctly formatted but non-existent key"
    (let [fake-key (generate-fake-key)
          response (util/make-request :get "/protected"
                                      :headers {"Authorization" (str "Bearer " fake-key)})]
      (assert-response-status response 401)
      (let [error-msg (get-in response [:body :error] "")]
        (is (or (str/includes? error-msg "Unauthorized")
                (str/includes? error-msg "verification failed")))))))

(deftest test-protected-route-static-key
  (testing "Accessing protected route using static debug key"
    (let [response (util/make-request :get "/protected" :is-authenticated? true)]
      (assert-response-status response 200)
      (is (str/includes? (get-in response [:body :message] "") "Hello")))))

;; Comprehensive API Key Flow Test
(deftest test-api-key-flow
  (testing "Complete API key lifecycle"
    (reset-test-state!)
    
    ;; Step 1: Create a new API key
    (testing "Create new API key"
      (let [key-name (str "test_key_" (uuid-str))
            response (util/make-request :post "/keys" 
                                        :is-authenticated? true
                                        :body {:name key-name})]
        (assert-response-status response 201)
        (let [data (:body response)]
          (is (= key-name (:name data)))
          (is (contains? data :full_key))
          (assert-key-format (:full_key data))
          (is (contains? data :message))
          
          ;; Store for subsequent tests
          (swap! test-state assoc 
                 :created-key-name key-name
                 :created-full-key (:full_key data))
          (println (str "Created key: Name='" key-name "', FullKey='" (:full_key data) "'")))))
    
    ;; Step 2: Test the created key works
    (testing "Use newly created key for authentication"
      (let [response (util/make-request :get "/protected"
                                        :headers {"Authorization" (str "Bearer " (:created-full-key @test-state))})]
        (assert-response-status response 200)
        (is (str/includes? (get-in response [:body :message] "") "Hello"))
        (Thread/sleep 200)))
    
    ;; Step 3: List keys and verify
    (testing "List keys contains created key"
      (Thread/sleep 100)
      (let [response (util/make-request :get "/keys" :is-authenticated? true)]
        (assert-response-status response 200)
        (let [data (:body response)
              found-key (some #(when (= (:name %) (:created-key-name @test-state)) %)
                              (:api_keys data))]
          (is (contains? data :api_keys))
          (is (vector? (:api_keys data)))
          (is (some? found-key) 
              (str "Newly created key '" (:created-key-name @test-state) "' not found in list"))
          
          (when found-key
            (is (contains? found-key :id))
            (is (contains? found-key :name))
            (is (not (contains? found-key :hashed_key)) "Hashed key should not be leaked")
            (is (not (contains? found-key :key_identifier)) "Key identifier should not be leaked")
            (is (contains? found-key :active))
            (is (contains? found-key :created_at))
            (is (true? (:active found-key)))
            (when (:last_used_at found-key)
              (println (str "Key '" (:name found-key) "' last used at: " (:last_used_at found-key))))))))
    
    ;; Step 4: Regenerate the key
    (testing "Regenerate API key"
      (let [response (util/make-request :post "/keys/regenerate"
                                        :is-authenticated? true
                                        :body {:name (:created-key-name @test-state)})]
        (assert-response-status response 200)
        (let [data (:body response)]
          (is (= (:created-key-name @test-state) (:name data)))
          (is (contains? data :full_key))
          (assert-key-format (:full_key data))
          (is (not= (:full_key data) (:created-full-key @test-state)) 
              "Should be a NEW full key")
          (is (contains? data :message))
          
          ;; Store the new key
          (swap! test-state assoc :regenerated-full-key (:full_key data))
          (println (str "Regenerated key: Name='" (:created-key-name @test-state) 
                        "', New FullKey='" (:full_key data) "'")))))
    
    ;; Step 5: Test old key fails, new key works
    (testing "Old key fails after regeneration"
      (let [response (util/make-request :get "/protected"
                                        :headers {"Authorization" (str "Bearer " (:created-full-key @test-state))})]
        (assert-response-status response 401)))
    
    (testing "New key works after regeneration"
      (let [response (util/make-request :get "/protected"
                                        :headers {"Authorization" (str "Bearer " (:regenerated-full-key @test-state))})]
        (assert-response-status response 200)
        (is (str/includes? (get-in response [:body :message] "") "Hello"))))
    
    ;; Step 6: Revoke the key
    (testing "Revoke API key"
      (let [response (util/make-request :post "/keys/revoke"
                                        :is-authenticated? true
                                        :body {:name (:created-key-name @test-state)})]
        (assert-response-status response 200)
        (is (str/includes? (get-in response [:body :message] "") "revoked successfully"))))
    
    ;; Step 7: Test revoked key fails
    (testing "Revoked key fails authentication"
      (let [response (util/make-request :get "/protected"
                                        :headers {"Authorization" (str "Bearer " (:regenerated-full-key @test-state))})]
        (assert-response-status response 401)))
    
    ;; Step 8: Verify key is inactive in list
    (testing "List shows key as inactive"
      (let [response (util/make-request :get "/keys" :is-authenticated? true)]
        (assert-response-status response 200)
        (let [found-key (some #(when (= (:name %) (:created-key-name @test-state)) %)
                              (get-in response [:body :api_keys]))]
          (is (some? found-key)
              (str "Revoked key '" (:created-key-name @test-state) 
                   "' should still be in list but inactive"))
          (when found-key
            (is (false? (:active found-key)) "Key should now be inactive")))))))

;; Individual validation tests
(deftest test-create-key-invalid-name-empty
  (testing "Creating a key with an empty name"
    (let [response (util/make-request :post "/keys"
                                      :is-authenticated? true
                                      :body {:name ""})]
      (assert-response-status response 400)
      (is (str/includes? (get-in response [:body :error] "") "Invalid key name")))))

(deftest test-regenerate-nonexistent-key-creates
  (testing "Regenerating a non-existent key name creates it"
    (let [key-name (str "nonexistent_then_created_" (uuid-str))
          response (util/make-request :post "/keys/regenerate"
                                      :is-authenticated? true
                                      :body {:name key-name})]
      (assert-response-status response 200)
      (let [data (:body response)]
        (is (= key-name (:name data)))
        (is (contains? data :full_key))
        (let [newly-created-key (:full_key data)]
          ;; Test if the newly created key works
          (let [auth-response (util/make-request :get "/protected"
                                                 :headers {"Authorization" (str "Bearer " newly-created-key)})]
            (assert-response-status auth-response 200))
          
          ;; Clean up by revoking the unexpectedly created key
          (let [revoke-response (util/make-request :post "/keys/revoke"
                                                   :is-authenticated? true
                                                   :body {:name key-name})]
            (assert-response-status revoke-response 200)))))))

(deftest test-revoke-nonexistent-key
  (testing "Trying to revoke a key name that never existed"
    (let [response (util/make-request :post "/keys/revoke"
                                      :is-authenticated? true
                                      :body {:name (str "does_not_exist_" (uuid-str))})]
      (assert-response-status response 404)
      (is (str/includes? (str/lower-case (get-in response [:body :error] "")) "not found")))))