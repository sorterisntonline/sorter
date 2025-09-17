(ns sorter.playground-module-test
  (:use [com.rpl rama]
        [com.rpl.rama path])
  (:require [clojure.test :refer [deftest is testing]]
            [com.rpl.rama.test :as rtest]
            [sorter.playground-module :as playground]))

(defn- wait-for-value [f expected]
  (loop [attempts 0]
    (let [result (f)]
      (if (= expected result)
        result
        (do
          (Thread/sleep 50)
          (if (< attempts 100)
            (recur (inc attempts))
            (throw (ex-info "Timed out waiting for Rama state" {:expected expected :last result}))))))))

(deftest append-and-clear
  (with-open [ipc (rtest/create-ipc)]
    (rtest/launch-module! ipc playground/PlaygroundModule {:tasks 2 :threads 2})
    (let [module-name (get-module-name playground/PlaygroundModule)
          command-depot (foreign-depot ipc module-name "*command-depot")
          lists (foreign-pstate ipc module-name "$$lists")]

      (testing "append values into default list"
        (foreign-append! command-depot {:list "default" :action "append" :value "alpha"})
        (foreign-append! command-depot {:list "default" :action "append" :value "beta"})
        (is (= ["alpha" "beta"]
               (wait-for-value #(foreign-select-one (keypath "default") lists)
                               ["alpha" "beta"]))))

      (testing "clear resets the list"
        (foreign-append! command-depot {:list "default" :action "clear"})
        (is (= []
               (wait-for-value #(foreign-select-one (keypath "default") lists) []))))

      (testing "independent lists partition correctly"
        (foreign-append! command-depot {:list "secondary" :action "append" :value "gamma"})
        (is (= ["gamma"]
               (wait-for-value #(foreign-select-one (keypath "secondary") lists)
                               ["gamma"])))))))
