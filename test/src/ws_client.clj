(ns sorter-test.ws-client
  (:require [ws-client-async.core :as ws]
            [clojure.core.async :as a]
            [cheshire.core :as json]))

(defprotocol IWebSocketClient
  (connect [this])
  (send! [this command])
  (receive! [this] [this timeout])
  (close! [this]))

(deftype WebSocketClient [uri client]
  IWebSocketClient
  (connect [this]
    (let [c (ws/create-client)]
      (ws/connect c uri)
      (assoc this :client c)))

  (send! [_ command]
    (ws/send! client (json/encode command)))

  (receive! [_] (receive! _ 5000)) ; Default 5s timeout
  (receive! [_ timeout]
    (let [ch (ws/messages client)
          [_ val] (a/alts!! [ch (a/timeout timeout)])]
      (if val
        (json/parse-string val true)
        (throw (ex-info "Timeout: Did not receive message" {:timeout timeout})))))

  (close! [_] (ws/close! client)))

(defn create-ws-client [uri]
  (->WebSocketClient uri nil))
