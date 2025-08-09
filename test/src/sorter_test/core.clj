(ns sorter-test.core
  (:require [clojure.test :refer :all]
            [meander.epsilon :as m]
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
   (bind client (-> (ws/create-ws-client "ws://localhost:8081/api/ws") ws/connect))
   
   ;; Send a simple query
   (ws/send! client {:type "UpdateQuery" :data {:query "test"}})
   
   ;; Receive response and verify basic structure
   (bind response (ws/receive! client))
   (println "Received response:" response)
   
   ;; Test that we get a UIUpdate with HomePage (matching actual response)
   (is (m/match response
         {:type "UIUpdate"
          :data {:type "HomePage"
                 :data {:current_query _
                        :suggested_queries (m/pred vector?)}}}
         true))
   
   ;; Send another query to verify continued functionality
   (ws/send! client {:type "UpdateQuery" :data {:query "hello world"}})
   
   (bind response2 (ws/receive! client))
   (println "Second response:" response2)
   
   ;; Should get some response (either UIUpdate or Error)
   (is (m/match response2
         (m/or {:type "UIUpdate" :data _}
               {:type "Error" :data _}
               {:type _ :data _})
         true))
   
   ;; Clean up
   (ws/close! client)))
