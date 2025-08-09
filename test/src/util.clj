(ns sorter-test.util
  (:require [clj-http.client :as http]
            [environ.core :refer [env]]
            [cheshire.core :as json]))

(def base-url "http://localhost:8081/api")
(def static-admin-key (env :static-admin-key "STATIC_TEST_KEY_FOR_ADMIN_USER_123"))

(defn make-request
  [method endpoint & {:keys [is-authenticated? body]}]
  (let [opts {:as :json
              :content-type :json
              :throw-exceptions false
              :body (when body (json/encode body))}
        opts (if is-authenticated?
               (assoc-in opts [:headers "Authorization"] (str "Bearer " static-admin-key))
               opts)]
    (http/request (assoc opts :method method :url (str base-url endpoint)))))
