(ns sorter-test.ws-client
  (:require [gniazdo.core :as ws]
            [clojure.core.async :as async :refer [chan go >! <! <!! timeout alt!!]]))

(defprotocol WebSocketClient
  (send! [this message] "Send a message to the WebSocket")
  (receive! [this] [this timeout-ms] "Receive a message from the WebSocket")
  (close! [this] "Close the WebSocket connection"))

(defrecord GniaznoWSClient [socket receive-chan]
  WebSocketClient
  (send! [this message]
    (ws/send-msg socket (pr-str message)))
  
  (receive! [this]
    (receive! this 5000)) ; Default 5 second timeout
  
  (receive! [this timeout-ms]
    (let [timeout-chan (timeout timeout-ms)]
      (alt!!
        receive-chan ([msg] (when msg (read-string msg)))
        timeout-chan :timeout)))
  
  (close! [this]
    (ws/close socket)
    (async/close! receive-chan)))

(defn create-ws-client [url]
  (let [receive-chan (chan 100)] ; Buffer up to 100 messages
    {:url url :receive-chan receive-chan}))

(defn connect [{:keys [url receive-chan]}]
  (let [socket (ws/connect url
                          :on-receive (fn [msg]
                                        (go (>! receive-chan msg)))
                          :on-error (fn [error]
                                      (println "WebSocket error:" error))
                          :on-close (fn [status reason]
                                      (println "WebSocket closed:" status reason)
                                      (async/close! receive-chan)))]
    (->GniaznoWSClient socket receive-chan)))