(ns app.version
  (:require [clojure.string :as string]))

;; Read version from file
(def version
  (try
    (string/trim (slurp "version"))
    (catch Exception _ "unknown"))) 