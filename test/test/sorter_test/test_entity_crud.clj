(ns sorter-test.test-entity-crud
  (:require [clojure.test :refer :all]
            [matcher-combinators.test] ;; adds match? support to clojure.test
            [matcher-combinators.matchers :as m]
            [clojure.string :as str]
            [sorter-test.util :as util]))

;; Test state for managing created entities across tests
(def test-state (atom {:created-entity-ns nil
                       :created-entity-pk nil}))

(defn reset-test-state! []
  (reset! test-state {:created-entity-ns nil
                      :created-entity-pk nil}))

;; Helper functions
(defn uuid-str []
  (str (java.util.UUID/randomUUID)))

(defn cleanup-entity 
  "Attempts to delete an entity, ignoring errors if it's already gone."
  [ns pk]
  (println (str "Cleanup Attempt: Deleting entity " ns "/" pk))
  (util/make-request :delete (str "/entity/" ns "/" pk) 
                     :is-authenticated? true))

(defn cleanup-relationship 
  "Attempts to delete a relationship, ignoring errors."
  [parent-ns parent-pk child-ns child-pk]
  (println (str "Cleanup Attempt: Deleting relationship " 
                parent-ns "/" parent-pk " -> " child-ns "/" child-pk))
  (util/make-request :delete "/relationships"
                     :params {:parent_pk_namespace parent-ns
                             :parent_pk parent-pk
                             :child_pk_namespace child-ns
                             :child_pk child-pk}
                     :is-authenticated? true))

;; Comprehensive Entity CRUD Test Suite
(deftest test-entity-crud-flow
  (testing "Complete entity CRUD lifecycle"
    (reset-test-state!)
    
    ;; Create Tests
    (testing "Successfully creating a new entity"
      (let [ns "test.namespace"
            pk (str "test_pk_" (uuid-str))
            payload {:pk_namespace ns
                    :pk pk
                    :title "My Test Entity"
                    :metadata {:key "value" :num 123}}
            response (util/make-request :post "/entity" 
                                       :body payload
                                       :is-authenticated? true)]
        (is (match? {:status 201
                     :body {:pk_namespace ns
                           :pk pk
                           :title "My Test Entity"
                           :metadata {:key "value" :num 123}
                           :created_at string?}}
                    response))
        
        ;; Store for subsequent tests
        (swap! test-state assoc 
               :created-entity-ns ns
               :created-entity-pk pk)
        (println (str "Created entity: " ns "/" pk))))
    
    (testing "Creating an entity with the same primary key (conflict)"
      (let [ns (:created-entity-ns @test-state)
            pk (:created-entity-pk @test-state)
            payload {:pk_namespace ns
                    :pk pk
                    :title "Attempt to duplicate"
                    :metadata {}}
            response (util/make-request :post "/entity"
                                       :body payload
                                       :is-authenticated? true)]
        (is (match? {:status 409
                     :body {:error #"(?i)already exists"}}
                    response))))
    
    ;; Read Tests
    (testing "Successfully retrieving the created entity"
      (let [ns (:created-entity-ns @test-state)
            pk (:created-entity-pk @test-state)
            response (util/make-request :get (str "/entity/" ns "/" pk)
                                       :is-authenticated? true)]
        (is (match? {:status 200
                     :body {:entity {:pk_namespace ns
                                   :pk pk
                                   :title "My Test Entity"
                                   :metadata {:key "value" :num 123}}}}
                    response))))
    
    ;; List Tests
    (testing "Listing entities and finding the created one"
      (let [ns (:created-entity-ns @test-state)
            pk (:created-entity-pk @test-state)
            response (util/make-request :get "/entity"
                                       :is-authenticated? true)]
        (is (match? {:status 200
                     :body (m/embeds [{:pk_namespace ns
                                      :pk pk
                                      :title "My Test Entity"}])}
                    response))))
    
    ;; Update Tests
    (testing "Successfully updating the created entity"
      (let [ns (:created-entity-ns @test-state)
            pk (:created-entity-pk @test-state)
            payload {:pk_namespace ns
                    :pk pk
                    :title "Updated Test Entity Title"
                    :metadata {:new_key "new_value"}}
            response (util/make-request :put (str "/entity/" ns "/" pk)
                                       :body payload
                                       :is-authenticated? true)]
        (is (match? {:status 200
                     :body {:pk_namespace ns
                           :pk pk
                           :title "Updated Test Entity Title"
                           :metadata {:new_key "new_value"}}}
                    response))
        
        ;; Verify update by GETting again
        (let [verify-response (util/make-request :get (str "/entity/" ns "/" pk)
                                                :is-authenticated? true)]
          (is (match? {:status 200
                       :body {:entity {:title "Updated Test Entity Title"
                                     :metadata {:new_key "new_value"}}}}
                      verify-response)))))
    
    (testing "Updating with mismatched primary key between path and payload"
      (let [ns (:created-entity-ns @test-state)
            pk (:created-entity-pk @test-state)
            payload {:pk_namespace "mismatch.ns"
                    :pk "mismatch.pk"
                    :title "Mismatch Test"
                    :metadata {}}
            response (util/make-request :put (str "/entity/" ns "/" pk)
                                       :body payload
                                       :is-authenticated? true)]
        (is (match? {:status 400
                     :body {:error #"(?i)must match payload primary key"}}
                    response))))
    
    ;; Delete Tests
    (testing "Successfully deleting the created entity"
      (let [ns (:created-entity-ns @test-state)
            pk (:created-entity-pk @test-state)
            response (util/make-request :delete (str "/entity/" ns "/" pk)
                                       :is-authenticated? true)]
        (is (match? {:status 204}
                    response))
        
        ;; Verify deletion by trying to GET it again
        (let [verify-response (util/make-request :get (str "/entity/" ns "/" pk)
                                                :is-authenticated? true)]
          (is (match? {:status 404}
                      verify-response)))
        
        ;; Clear state as entity is gone
        (swap! test-state assoc
               :created-entity-ns nil
               :created-entity-pk nil)))))

;; Individual validation tests
(deftest test-create-entity-no-auth
  (testing "Creating an entity without authentication"
    (let [payload {:pk_namespace "noauth.ns"
                  :pk (str "noauth_pk_" (uuid-str))
                  :title "No Auth Test"
                  :metadata nil}]
      (is (match? {:status 401}
                  (util/make-request :post "/entity"
                                    :body payload))))))

(deftest test-create-entity-invalid-payload
  (testing "Creating an entity with missing required fields"
    (let [payload {:pk_namespace "invalid.ns"
                  ;; Missing "pk"
                  :title "Invalid Payload"}]
      (is (match? {:status (m/any-of 400 422)
                   :body {:error string?}}
                  (util/make-request :post "/entity"
                                    :body payload
                                    :is-authenticated? true))))))

(deftest test-get-entity-not-found
  (testing "Retrieving a non-existent entity"
    (let [ns "nonexistent.ns"
          pk (str "nonexistent_pk_" (uuid-str))]
      (is (match? {:status 404
                   :body {:error #"(?i)not found"}}
                  (util/make-request :get (str "/entity/" ns "/" pk)
                                    :is-authenticated? true))))))

(deftest test-list-entities-no-auth
  (testing "Listing entities without authentication (should work)"
    (let [response (util/make-request :get "/entity")]
      (is (= 200 (:status response)))
      (is (sequential? (:body response)) "Response body should be a sequence")
      (is (pos? (count (:body response))) "Should have at least one entity"))))

(deftest test-update-entity-not-found
  (testing "Updating a non-existent entity"
    (let [ns "nonexistent.ns"
          pk (str "nonexistent_pk_" (uuid-str))
          payload {:pk_namespace ns
                  :pk pk
                  :title "Update Non Existent"
                  :metadata {}}]
      (is (match? {:status 404}
                  (util/make-request :put (str "/entity/" ns "/" pk)
                                    :body payload
                                    :is-authenticated? true))))))

(deftest test-update-entity-no-auth
  (testing "Updating an entity without authentication"
    ;; First create an entity
    (let [ns "tempupdate.ns"
          pk (str "tempupdate_pk_" (uuid-str))
          create-payload {:pk_namespace ns
                         :pk pk
                         :title "Temp Update"
                         :metadata {}}]
      ;; Create with auth
      (util/make-request :post "/entity"
                        :body create-payload
                        :is-authenticated? true)
      
      ;; Try to update without auth
      (let [update-payload {:pk_namespace ns
                           :pk pk
                           :title "No Auth Update"}]
        (is (match? {:status 401}
                    (util/make-request :put (str "/entity/" ns "/" pk)
                                      :body update-payload))))
      
      ;; Cleanup
      (cleanup-entity ns pk))))

(deftest test-delete-entity-not-found
  (testing "Deleting a non-existent entity"
    (let [ns "nonexistent.ns"
          pk (str "nonexistent_pk_" (uuid-str))]
      (is (match? {:status 404}
                  (util/make-request :delete (str "/entity/" ns "/" pk)
                                    :is-authenticated? true))))))

(deftest test-delete-entity-no-auth
  (testing "Deleting an entity without authentication"
    ;; Create a temporary entity to try deleting without auth
    (let [temp-ns "tempdel.ns"
          temp-pk (str "tempdel_pk_" (uuid-str))
          payload {:pk_namespace temp-ns
                  :pk temp-pk
                  :title "Temp Delete"}]
      ;; Create with auth
      (util/make-request :post "/entity"
                        :body payload
                        :is-authenticated? true)
      
      ;; Attempt delete without auth
      (is (match? {:status 401}
                  (util/make-request :delete (str "/entity/" temp-ns "/" temp-pk))))
      
      ;; Cleanup the temporary entity
      (cleanup-entity temp-ns temp-pk))))
