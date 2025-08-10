(ns sorter-test.test-api-key
  (:require [clojure.test :refer :all]
            [matcher-combinators.test] ;; adds match? support to clojure.test
            [matcher-combinators.matchers :as m]
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

(defn generate-fake-key []
  (let [fake-identifier (subs (str/replace (uuid-str) "-" "") 0 16)
        fake-secret (subs (str/replace (uuid-str) "-" "") 0 32)]
    (str "sort_" fake-identifier "_" fake-secret)))

;; Custom matchers
(def valid-api-key? 
  "Matcher for valid API key format"
  (m/pred #(and (string? %)
                (re-matches #"^sort_[a-zA-Z0-9]+_[a-zA-Z0-9]+$" %))))

(def timestamp?
  "Matcher for ISO timestamp strings"
  (m/pred #(and (string? %)
                (re-matches #"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}" %))))

;; Test fixtures
(deftest test-health-endpoint
  (testing "Health check endpoint basic functionality"
    (let [response (util/make-request :get "/health")]
      (is (match? {:status 200
                   :body {:status "healthy"
                          :version string?}}
                  response))
      (println (str "Health check successful (Version: " (get-in response [:body :version]) ")")))))

;; Authentication Tests
(deftest test-protected-route-no-auth
  (testing "Accessing protected route without authentication"
    (is (match? {:status 401
                 :body {:error #"(?i)(no authentication credentials|unauthorized)"}}
                (util/make-request :get "/protected")))))

(deftest test-protected-route-invalid-key-format
  (testing "Accessing protected route with invalid key format"
    (is (match? {:status 401
                 :body {:error #"(?i)unauthorized"}}
                (util/make-request :get "/protected" 
                                  :headers {"Authorization" "Bearer invalid-key-123"})))))

(deftest test-protected-route-incorrect-key-value
  (testing "Accessing protected route with correctly formatted but non-existent key"
    (let [fake-key (generate-fake-key)]
      (is (match? {:status 401
                   :body {:error #"(?i)(unauthorized|verification failed)"}}
                  (util/make-request :get "/protected"
                                    :headers {"Authorization" (str "Bearer " fake-key)}))))))

(deftest test-protected-route-static-key
  (testing "Accessing protected route using static debug key"
    (is (match? {:status 200
                 :body {:message #"Hello"}}
                (util/make-request :get "/protected" :is-authenticated? true)))))

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
        (is (match? {:status 201
                     :body {:name key-name
                            :full_key valid-api-key?
                            :message string?}}
                    response))
        
        ;; Store for subsequent tests
        (swap! test-state assoc 
               :created-key-name key-name
               :created-full-key (get-in response [:body :full_key]))
        (println (str "Created key: Name='" key-name 
                     "', FullKey='" (get-in response [:body :full_key]) "'"))))
    
    ;; Step 2: Test the created key works
    (testing "Use newly created key for authentication"
      (is (match? {:status 200
                   :body {:message #"Hello"}}
                  (util/make-request :get "/protected"
                                    :headers {"Authorization" (str "Bearer " (:created-full-key @test-state))})))
      (Thread/sleep 200))
    
    ;; Step 3: List keys and verify
    (testing "List keys contains created key"
      (Thread/sleep 100)
      (let [response (util/make-request :get "/keys" :is-authenticated? true)
            key-name (:created-key-name @test-state)]
        (is (match? {:status 200
                     :body {:api_keys (m/embeds [{:id pos-int?
                                                  :name key-name
                                                  :active true
                                                  :created_at string?
                                                  :last_used_at (m/any-of string? nil)}])}}
                    response))
        
        ;; Verify sensitive fields are not exposed
        (when-let [found-key (some #(when (= (:name %) key-name) %) 
                                  (get-in response [:body :api_keys]))]
          (is (not (contains? found-key :hashed_key)))
          (is (not (contains? found-key :key_identifier)))
          (when (:last_used_at found-key)
            (println (str "Key '" key-name "' last used at: " (:last_used_at found-key)))))))
    
    ;; Step 4: Regenerate the key
    (testing "Regenerate API key"
      (let [old-key (:created-full-key @test-state)
            response (util/make-request :post "/keys/regenerate"
                                        :is-authenticated? true
                                        :body {:name (:created-key-name @test-state)})]
        (is (match? {:status 200
                     :body {:name (:created-key-name @test-state)
                            :full_key valid-api-key?
                            :message string?}}
                    response))
        
        (is (not= old-key (get-in response [:body :full_key])))
        
        (swap! test-state assoc :regenerated-full-key (get-in response [:body :full_key]))
        (println (str "Regenerated key: Name='" (:created-key-name @test-state) 
                     "', New FullKey='" (get-in response [:body :full_key]) "'"))))
    
    ;; Step 5: Test old key fails, new key works
    (testing "Old key fails after regeneration"
      (is (match? {:status 401}
                  (util/make-request :get "/protected"
                                    :headers {"Authorization" (str "Bearer " (:created-full-key @test-state))}))))
    
    (testing "New key works after regeneration"
      (is (match? {:status 200
                   :body {:message #"Hello"}}
                  (util/make-request :get "/protected"
                                    :headers {"Authorization" (str "Bearer " (:regenerated-full-key @test-state))}))))
    
    ;; Step 6: Revoke the key
    (testing "Revoke API key"
      (is (match? {:status 200
                   :body {:message #"revoked successfully"}}
                  (util/make-request :post "/keys/revoke"
                                    :is-authenticated? true
                                    :body {:name (:created-key-name @test-state)}))))
    
    ;; Step 7: Test revoked key fails
    (testing "Revoked key fails authentication"
      (is (match? {:status 401}
                  (util/make-request :get "/protected"
                                    :headers {"Authorization" (str "Bearer " (:regenerated-full-key @test-state))}))))
    
    ;; Step 8: Verify key is inactive in list
    (testing "List shows key as inactive"
      (let [response (util/make-request :get "/keys" :is-authenticated? true)
            key-name (:created-key-name @test-state)]
        (is (match? {:status 200
                     :body {:api_keys (m/embeds [{:name key-name
                                                  :active false}])}}
                    response))))))

;; Individual validation tests
(deftest test-create-key-invalid-name-empty
  (testing "Creating a key with an empty name"
    (is (match? {:status 400
                 :body {:error #"(?i)invalid key name"}}
                (util/make-request :post "/keys"
                                  :is-authenticated? true
                                  :body {:name ""})))))

(deftest test-regenerate-nonexistent-key-creates
  (testing "Regenerating a non-existent key name creates it"
    (let [key-name (str "nonexistent_then_created_" (uuid-str))
          response (util/make-request :post "/keys/regenerate"
                                      :is-authenticated? true
                                      :body {:name key-name})]
      (is (match? {:status 200
                   :body {:name key-name
                          :full_key valid-api-key?
                          :message string?}}
                  response))
      
      (let [newly-created-key (get-in response [:body :full_key])]
        ;; Test if the newly created key works
        (is (match? {:status 200}
                    (util/make-request :get "/protected"
                                      :headers {"Authorization" (str "Bearer " newly-created-key)})))
        
        ;; Clean up by revoking the created key
        (is (match? {:status 200}
                    (util/make-request :post "/keys/revoke"
                                      :is-authenticated? true
                                      :body {:name key-name})))))))

(deftest test-revoke-nonexistent-key
  (testing "Trying to revoke a key name that never existed"
    (is (match? {:status 404
                 :body {:error #"(?i)not found"}}
                (util/make-request :post "/keys/revoke"
                                  :is-authenticated? true
                                  :body {:name (str "does_not_exist_" (uuid-str))})))))