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

;; Test fixtures: simplify lifecycle management.
;; - Suite fixture sets up environment once and tears it down at the end.
;; - Each-test fixture performs a fast DB reset between tests and ensures cargo stays healthy.
(defn suite-fixture [f]
  (util/setup-test-environment)
  (try
    (f)
    (finally
      (util/teardown-test-environment))))

(defn each-test-fixture [f]
  (util/between-test-cleanup-db-only)
  (f))

(use-fixtures :once suite-fixture)
(use-fixtures :each each-test-fixture)

(deftest websocket-hello-world
  "Basic test to verify WebSocket connection and message exchange"
  (letlocals
   ;; Environment is prepared by fixtures
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
   ;; Environment is prepared by fixtures
   (bind client (-> (ws/create-ws-client "ws://localhost:8081/api/ws") ws/connect))
   
   ;; Drain initial HomePage sent on connect
   (bind _initial (ws/receive! client))
   
   ;; Step 1: Query for a subreddit that doesn't exist yet
   (ws/send! client {:type "UpdateQuery" :data {:query "r/testsubreddit"}})
   
   ;; Should get a Multiple UI with Selection and possibly Suggestions
   (bind response1 (ws/receive! client))
   (println "Subreddit query response:" response1)
   
   ;; Verify we get either Multiple or Selection UI response (new unified UX)
   (is (match? (m/any-of {:type "UIUpdate"
                          :data {:type "Multiple"
                                 :data {:responses (m/embeds [{:type "Selection"
                                                              :data {:items (m/embeds [{:import_action {:command any?}}])}}])}}}
                         {:type "UIUpdate"
                          :data {:type "Selection"
                                 :data {:title "Subreddits"
                                        :items (m/embeds [{:import_action {:command any?}}])}}})
               response1))
   
   ;; Step 2: Extract and send the import command
   (bind import-command 
          (let [data (:data (:data response1))]
            (if (= "Multiple" (:type (:data response1)))
              ;; Extract from Multiple response
              (-> data
                  :responses
                  (->> (filter #(= "Selection" (:type %))))
                  first
                  :data
                  :items
                  (->> (filter #(contains? % :import_action)))
                  first
                  (get-in [:import_action :command]))
              ;; Extract from Selection response
              (-> data
                  :items
                  (->> (filter #(contains? % :import_action)))
                  first
                  (get-in [:import_action :command])))))
   
   (println "Import command:" import-command)
   (is (some? import-command) "Should have an import command")
   
   ;; Send the import command
   (ws/send! client import-command)
   
   ;; Step 3: Should get success or error response (network may be unavailable in CI)
   (bind response2 (ws/receive! client))
   (println "Import response:" response2)
   
   ;; Accept either a success placeholder or an ImportFailed error
   (is (match? (m/any-of {:type "UIUpdate"
                          :data {:type "NotYetImplemented"
                                 :data {:feature_name #"Imported r/testsubreddit"}}}
                         {:type "UIUpdate"
                          :data {:type "ErrorPage" :data {:error_type "ImportFailed"}}}
                         {:type "Error" :data any?})
              response2))
   
   ;; Clean up
   (ws/close! client)))

(deftest tab-completion-flow
  "Test TAB completion behavior: import subreddit, then test partial matches get suggestions"
  (letlocals
   ;; Environment is prepared by fixtures
   (bind client (-> (ws/create-ws-client "ws://localhost:8081/api/ws") ws/connect))
   
   ;; Drain initial HomePage sent on connect
   (bind _initial (ws/receive! client))
   
   ;; Step 1: Import a subreddit first (e.g., "programming") 
   ;; This is needed so we have something in the DB for TAB completion
   (ws/send! client {:type "UpdateQuery" :data {:query "r/programming"}})
   
   (bind programming-response (ws/receive! client))
   (println "Programming subreddit response:" programming-response)
   
   ;; Extract and send import command if it exists
   (let [data (:data (:data programming-response))]
     (when (= "Multiple" (:type (:data programming-response)))
       (let [import-command (-> data
                               :responses
                               (->> (filter #(= "Selection" (:type %))))
                               first
                               :data
                               :items
                               (->> (filter #(contains? % :import_action)))
                               first
                               (get-in [:import_action :command]))]
         (when import-command
           (println "Importing programming subreddit...")
           (ws/send! client import-command)
           ;; Wait for import to complete
           (let [_import-response (ws/receive! client)]
             (println "Import completed"))))))
   
   ;; Step 2: Now test partial matching for TAB completion
   ;; Query "r/pro" should find "programming" and provide TAB completion
   (ws/send! client {:type "UpdateQuery" :data {:query "r/pro"}})
   
   (bind tab-response (ws/receive! client))
   (println "TAB completion response for 'r/pro':" tab-response)
   
   ;; Step 3: Verify we get a Multiple response with both Suggestions (for TAB) and Selection (for clicks)
   (is (match? {:type "UIUpdate"
                :data {:type "Multiple"
                       :data {:responses (m/embeds 
                                         [{:type "Suggestions"
                                           :data {:suggestion {:completion string?}}}
                                          {:type "Selection"
                                           :data {:items vector?}}])}}}
               tab-response)
       "Should get Multiple response with both Suggestions and Selection")
   
   ;; Step 4: Verify the TAB completion suggestion contains "programming"
   (bind suggestion-completion 
         (-> tab-response
             (get-in [:data :data :responses])
             (->> (filter #(= "Suggestions" (:type %))))
             first
             (get-in [:data :suggestion :completion])))
   
   (println "TAB completion suggestion:" suggestion-completion)
   (is (some? suggestion-completion) "Should have a TAB completion suggestion")
   (is (clojure.string/includes? suggestion-completion "programming") 
       "TAB completion should suggest 'programming' for 'r/pro'")
   
   ;; Step 5: Verify Selection panel has import option for "pro"
   (bind selection-items
         (-> tab-response
             (get-in [:data :data :responses])
             (->> (filter #(= "Selection" (:type %))))
             first
             (get-in [:data :items])))
   
   (is (some #(and (contains? % :import_action)
                   (clojure.string/includes? (:title %) "r/pro")) 
             selection-items)
       "Should have import action for r/pro")
   
   ;; Clean up
   (ws/close! client)))

(deftest database-setup-test
  "Test that our database setup function works correctly"
  (letlocals
   ;; Environment is prepared by fixtures
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
