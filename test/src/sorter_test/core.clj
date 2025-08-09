(ns sorter-test.core
  (:require [clojure.test :refer :all]
            [meander.epsilon :as m]
            [sorter-test.ws-client :as ws]
            [sorter-test.util :as util]))

(deftest ^:live-reddit reddit-import-flow
  (let [post-url "reddit.com/r/rust/comments/1chskch/help_understanding_the_concept_of_lifetimes/"
        post-ns  "reddit.com.post"
        post-pk  "1chskch"
        client   (-> (ws/create-ws-client "ws://localhost:8081/api/ws") ws/connect)]

    ;; --- Cleanup: Ensure test is runnable multiple times ---
    (util/make-request :delete (str "/entity/" post-ns "/" post-pk) :is-authenticated? true)

    (testing "Step 1: User types URL, gets prompted to import"
      (ws/send! client {:type "UpdateQuery" :data {:query post-url}})

      (let [response (ws/receive! client)]
        (is (m/match response
              ;; This single pattern replaces a dozen Python `asserts`.
              ;; It verifies structure, keys, and some values simultaneously.
              {:type "UIUpdate"
               :data {:type "Guide"
                      :data {:title (m/pred #(clojure.string/includes? % "Import"))
                             :options [(m/and
                                         {:label (m/pred #(clojure.string/includes? % "Import"))
                                          :completion (m/re #"^!import_reddit_thread.*" ?import-command)}
                                         _)]}}}
              ?import-command))))

    ;; Let's imagine you grabbed the import-command from the match above
    ;; For now, let's hardcode it based on our expected logic
    (let [import-command (str "!import_reddit_thread " post-url)]
      (testing "Step 2: User 'clicks' import, receives EntityView"
        (ws/send! client {:type "UpdateQuery" :data {:query import-command}})

        (let [response (ws/receive! client 30000)] ; 30s timeout for live API
          (is (m/match response
                {:type "UIUpdate"
                 :data {:type "EntityView"
                        :data {:entity {:id (str post-ns ":" post-pk)
                                        :title (m/pred string?)} ; We don't care about the exact title
                               :children [(m/some _) ... & _]}}} ; At least one child
                true)))))

    (testing "Step 3: Verify with REST API"
      (let [response (util/make-request :get (str "/entity/" post-ns "/" post-pk "?children=true"))]
        (is (= 200 (:status response)))
        (is (m/match (:body response)
              {:entity _
               :children [(m/some _) ...]}
              true))))

    ;; Final Cleanup
    (util/make-request :delete (str "/entity/" post-ns "/" post-pk) :is-authenticated? true)
    (ws/close! client)))
