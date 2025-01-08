(ns app.database
  (:require [honey.sql :as sql]
            [honey.sql.helpers :as h]
            [next.jdbc :as jdbc]
            [hikari-cp.core :refer [make-datasource close-datasource]]
            [migratus.core :as migratus]
            [clojure.string :as str]))

(defn get-env [key default]
  "Retrieve the value of an environment variable or return a default."
  (let [value (System/getenv key)]
    (if (str/blank? value) default value)))

(defn determine-environment []
  "Determine the current environment. Defaults to `development` during normal execution,
   but defaults to `production` if running an uberjar and ENVIRONMENT is unset."
  (let [runtime-env (System/getProperty "clojure.runtime")]
    (if (= runtime-env "uberjar")
      (get-env "ENVIRONMENT" "production")
      (get-env "ENVIRONMENT" "development"))))

(defn get-database-url []
  "Determine the correct database URL based on the ENVIRONMENT variable."
  (let [env (determine-environment)]
    (if (= env "production")
      (get-env "PROD_DATABASE_URL" nil)
      (get-env "DATABASE_URL" nil))))

(defn parse-jdbc [url]
  "Parse the JDBC URL into its components."
  (drop 1 (re-matches
           #"postgres://(.*):(.*)@(.*):(\d*)/(.*)"
           url)))

(defn create-db-pool []
  "Create a database connection pool using the appropriate database URL."
  (let [database-url (get-database-url)]
    (when-not database-url
      (throw (Exception. "DATABASE_URL or PROD_DATABASE_URL must be set")))
    (let [[username password host port database] (parse-jdbc database-url)
          cfg {:auto-commit        true
               :read-only          false
               :connection-timeout 30000
               :validation-timeout 5000
               :idle-timeout       600000
               :max-lifetime       1800000
               :minimum-idle       10
               :maximum-pool-size  10
               :pool-name          "db-pool"
               :register-mbeans    false
               :adapter            "postgresql"
               :username           username
               :password           password
               :server-name        host
               :port-number        (Integer. port)
               :database-name      database}]
      (make-datasource cfg))))

(def db (delay (create-db-pool)))

(def migratus-config {:store :database
                      :migration-dir "migrations/"
                      :migration-table-name "migrations"
                      :db {:datasource db}})

(defn exec! [m]
  "Execute a SQL command."
  (with-open [conn (jdbc/get-connection {:datasource @db})]
    (jdbc/execute! conn (cond (map? m) (sql/format m)
                              (string? m) [m]
                              (vector? m) m))))