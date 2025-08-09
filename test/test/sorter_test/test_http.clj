(ns sorter-test.test-http
  (:require [clojure.test :refer :all]
            [meander.epsilon :as m]
            [sorter-test.util :as util]
            [sorter-test.ws-client :as ws]))

(deftest test-http
  (let [response (util/make-request :get "/health")]
    (is (= 200 (:status response)))
    (is (m/match (:body response)
          {:status "healthy"
           :version _}
          true))))