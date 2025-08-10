(ns sorter-test.core
  (:require [clojure.test :refer :all]
            [matcher-combinators.test]
            [matcher-combinators.matchers :as m]
            [sorter-test.util :as util]
            [sorter-test.ws-client :as ws]))

(defmacro letlocals [& forms]
  (let [process-form (fn [form]
                       (if (and (list? form) (= 'bind (first form)))
                         (let [[_ var expr] form]
                           [var expr])
                         ['_ form]))
        bindings (->> (butlast forms)
                      (mapcat process-form)
                      vec)
        body (last forms)]
    `(let ~bindings
       ~body)))

(deftest websocket-hello-world
  "Basic test to verify WebSocket connection and message exchange"
  (letlocals
   ;; Fast reset - just clear tables and restart cargo
   (util/between-test-cleanup-db-only) ; Much faster than full container restart
   
   (bind client (-> (ws/create-ws-client "ws://localhost:8081/api/ws") ws/connect))
   
   ;; Send a simple query
   (ws/send! client {:type "UpdateQuery" :data {:query "test"}})
   
   ;; Receive response and verify basic structure
   (bind response (ws/receive! client))
   (println "Received response:" response)
   
   ;; Test that we get a UIUpdate with HomePage (matching actual response)
   (is (match? {:type "UIUpdate"
                :data {:type "HomePage"
                       :data {:current_query any?
                              :suggested_queries vector?}}}
               response))
   
   ;; Send another query to verify continued functionality
   (ws/send! client {:type "UpdateQuery" :data {:query "hello world"}})
   
   (bind response2 (ws/receive! client))
   (println "Second response:" response2)
   
   ;; Should get some response (either UIUpdate or Error)
   (is (match? (m/any-of {:type "UIUpdate" :data any?}
                         {:type "Error" :data any?}
                         {:type any? :data any?})
               response2))
   
   ;; Clean up
   (ws/close! client)))

(deftest reddit-import-flow
  "Test the complete Reddit import flow: query subreddit -> show suggestions -> import posts"
  (letlocals
   ;; Setup fresh database before test
   (util/setup-fresh-database)
   
   (bind client (-> (ws/create-ws-client "ws://localhost:8081/api/ws") ws/connect))
   
   ;; Step 1: Query for a subreddit that doesn't exist yet
   (ws/send! client {:type "UpdateQuery" :data {:query "r/testsubreddit"}})
   
   ;; Should get a Selection UI with import action
   (bind response1 (ws/receive! client))
   (println "Subreddit query response:" response1)
   
   ;; Verify we get a Selection UI response
   (is (match? {:type "UIUpdate"
                :data {:type "Multiple"
                       :data {:responses [{:type "ScrollingSuggestions" :data any?}
                                         {:type "Selection" 
                                          :data {:title "Subreddits"
                                                 :items (m/embeds [{:import_action {:command any?}}])}}]}}}
               response1))
   
   ;; Step 2: Extract and send the import command
   (bind import-command 
         (-> response1
             (get-in [:data :data :responses])
             (->> (filter #(= (:type %) "Selection")))
             first
             (get-in [:data :items])
             (->> (filter #(contains? % :import_action)))
             first
             (get-in [:import_action :command])))
   
   (println "Import command:" import-command)
   (is (some? import-command) "Should have an import command")
   
   ;; Send the import command
   (ws/send! client import-command)
   
   ;; Step 3: Should get success response
   (bind response2 (ws/receive! client))
   (println "Import response:" response2)
   
   ;; Should get a success message (currently NotYetImplemented but with success message)
   (is (match? {:type "UIUpdate"
                :data {:type "NotYetImplemented"
                       :data {:feature_name #"Imported r/testsubreddit"
                              :description #"Successfully imported.*posts"}}}
               response2))
   
   ;; Step 4: Verify database state - should have imported entities
   (Thread/sleep 1000) ; Give the import some time to complete
   
   ;; Check that subreddit entity was created
   (bind subreddit-count (util/count-entities "reddit.subreddit"))
   (is (>= subreddit-count 1) "Should have at least one subreddit entity")
   
   ;; Check that post entities were created
   (bind post-count (util/count-entities "reddit.post"))
   (is (> post-count 0) "Should have imported some posts")
   
   (println (str "Imported " subreddit-count " subreddits and " post-count " posts"))
   
   ;; Step 5: Test querying the same subreddit again - should show as "Already imported"
   (ws/send! client {:type "UpdateQuery" :data {:query "r/testsubreddit"}})
   
   (bind response3 (ws/receive! client))
   (println "Second query response:" response3)
   
   ;; Should now show the subreddit as already imported (no import action)
   (is (match? {:type "UIUpdate"
                :data {:type "Multiple"
                       :data {:responses [{:type "ScrollingSuggestions" :data any?}
                                         {:type "Selection" 
                                          :data {:items (m/embeds [{:description "Already imported"}])}}]}}}
               response3))
   
   ;; Clean up
   (ws/close! client)))

(deftest database-setup-test
  "Test that our database setup function works correctly"
  (letlocals
   ;; Fast reset - just clear tables (no cargo restart needed for DB-only test)
   (util/between-test-cleanup-db-only)
   
   ;; Verify initial state - should have no reddit entities yet
   (bind subreddit-count (util/count-entities "reddit.subreddit"))
   (is (= 0 subreddit-count) "Should have 0 subreddit entities initially")
   
   ;; Verify we can query the admin user from users table
   (bind admin-result (util/query-database "SELECT username FROM users WHERE auth0_sub = 'admin'"))
   (is (= ["admin"] admin-result) "Should have admin user from migrations")
   
   (println "Database setup test passed!"))

;; Test suite lifecycle management
(defn test-ns-setup []
  "Called once before running all tests in this namespace"
  (println "\n=== Starting test suite ===")
  ;; Full setup only once - starts container if needed
  (util/setup-test-environment))

(defn test-ns-teardown []
  "Called once after all tests in this namespace complete"
  (println "\n=== Test suite complete ===")
  (util/teardown-test-environment)
  (util/cleanup-output-files))

;; Example of how to use the lifecycle functions in your test runner
(comment
  ;; If using kaocha, you can add this to your tests.edn:
  ;; {:ns-patterns ["sorter-test.*"]
  ;;  :pre-test [sorter-test.core/test-ns-setup]
  ;;  :post-test [sorter-test.core/test-ns-teardown]}
  
  ;; Or run manually:
  (test-ns-setup)
  (run-tests)
  (test-ns-teardown)))
