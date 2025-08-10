(ns sorter-test.util
  (:require [clj-http.client :as http]
            [environ.core :refer [env]]
            [cheshire.core :as json]))

(def base-url "http://localhost:8081/api")
(def static-admin-key (env :static-admin-key "STATIC_TEST_KEY_FOR_ADMIN_USER_123"))

(defn make-request
  [method endpoint & {:keys [is-authenticated? body headers params]}]
  (let [base-opts {:content-type :json
                   :throw-exceptions false
                   :body (when body (json/encode body))
                   :query-params params}
        auth-headers (when is-authenticated?
                       {"Authorization" (str "Bearer " static-admin-key)})
        all-headers (merge auth-headers headers)
        opts (if (seq all-headers)
               (assoc base-opts :headers all-headers)
               base-opts)
        response (http/request (assoc opts :method method :url (str base-url endpoint)))]
    ;; Parse JSON response body manually
    (if (and (:body response) (not= "" (:body response)))
      (try
        (assoc response :body (json/parse-string (:body response) true))
        (catch Exception _
          response)) ; Return original response if JSON parsing fails
      response)))
