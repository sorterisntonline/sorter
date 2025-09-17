(ns sorter.playground-module
  (:use [com.rpl.rama]
        [com.rpl.rama.path])
  (:require [com.rpl.rama.aggs :as aggs]))

;; Minimal Rama module backing a "playground" list. Incoming commands
;; append values or clear the list, and everything stays JSON-friendly so
;; we can talk to it purely via the REST API.

(defmodule PlaygroundModule
  [setup topologies]
  ;; Commands are partitioned by list name so updates for the same list
  ;; run serially on one task.
  (declare-depot setup *command-depot (hash-by :list))

(let [s (stream-topology topologies "commands")]
    ;; Each list entry lives inside a map keyed by the list name so we
    ;; can keep multiple logical lists if we ever want to expand.
    (declare-pstate s $$lists {String java.util.List})

    (<<sources s
      (source> *command-depot :> {:keys [*list *action *value]})

      ;; Append: aggregate values into a vector at the specified list key.
      (<<if (= *action "append")
        (+compound $$lists {*list (aggs/+vec-agg *value)}))

      ;; Clear: replace the list with [] so queries see an empty vec.
      (<<if (= *action "clear")
        (local-transform> [(keypath *list)
                            (termval [])]
                          $$lists)))))
