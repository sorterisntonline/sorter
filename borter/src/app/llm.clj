(ns app.llm
  (:require [hato.client :as hc]
            [clojure.data.json :as json]
            [clj-yaml.core :as yaml]
            [clojure.java.io :as io]
            [clojure.string :as str]))

(def openrouter-key (System/getenv "OPENROUTER_KEY"))

(def config
  (-> (io/resource "ai/suggestions_config.yml")
      slurp
      yaml/parse-string))

(defn load-schema []
  (get config :schema))

(defn format-prompt [input]
  (-> (:prompt config)
      :user_template
      (str/replace "{input}" input)))

(defn query-llm [input]
  (try
    (when-not openrouter-key
      (throw (ex-info "OPENROUTER_KEY environment variable is not set" {:status 500})))
    
    (println "Starting LLM query for input:" input)
    (let [schema (load-schema)
          _ (println "Using schema:" schema)
          
          request-body (json/write-str
                        {:model (get config :model)
                         :messages [{:role "system"
                                   :content (get-in config [:prompt :system_message])}
                                  {:role "user"
                                   :content (format-prompt input)}]
                         :tools [{:type "function"
                                :function {:name "generate_music_tags"
                                         :description "Generate music-related tags and metadata"
                                         :parameters schema}}]
                         :tool_choice {:type "function"
                                     :function {:name "generate_music_tags"}}
                         :headers {"HTTP-Referer" (get-in config [:headers :http_referer])
                                 "X-Title" (get-in config [:headers :title])}
                         :route (get config :route)})
          _ (println "Request body:" request-body)
          
          response (hc/request
                    {:url "https://openrouter.ai/api/v1/chat/completions"
                     :method :post
                     :headers {"Authorization" (str "Bearer " openrouter-key)
                              "HTTP-Referer" (get-in config [:headers :http_referer])
                              "X-Title" (get-in config [:headers :title])
                              "Content-Type" "application/json"}
                     :body request-body})
          
          _ (println "Raw OpenRouter response:" (-> response :body))
          
          parsed-response (-> response :body (json/read-str {:key-fn keyword}))
          _ (println "Parsed OpenRouter response:" parsed-response)
          
          result (some-> parsed-response 
                        :choices 
                        first 
                        :message 
                        :tool_calls
                        first
                        :function
                        :arguments
                        (json/read-str {:key-fn keyword}))
          _ (println "Final extracted result:" result)]
      
      result)
    (catch Exception e
      (println "LLM Error:" (ex-message e))
      (println "Error data:" (ex-data e))
      (println "Error cause:" (ex-cause e))
      (.printStackTrace e)
      (throw (ex-info "Failed to get suggestions from LLM" 
                     {:status 500 
                      :body {:error (ex-message e)
                            :details (ex-data e)}})))))

(defn get-domain-pk-namespace [tag-type]
  (case tag-type
    "artist" "spotify.artist"
    "album" "spotify.album"
    "track" "spotify.track"
    "genre" "spotify.genre"
    nil))

(defn suggest-tags [input]
  (println "Starting suggest-tags for input:" input)
  (try
    (let [llm-result (query-llm input)
          _ (println "LLM result in suggest-tags:" llm-result)
          
          suggestions (map-indexed
                       (fn [idx tag]
                         (let [suggestion {:tag tag
                                         :domain_pk_namespace (get-domain-pk-namespace 
                                                             (get (:tag_types llm-result) idx))
                                         :spotify_search (:spotify_search llm-result)}]
                           (println "Created suggestion:" suggestion)
                           suggestion))
                       (:suggested_tags llm-result))]
      (println "Final suggestions:" suggestions)
      suggestions)
    (catch Exception e
      (println "Suggestion Error in suggest-tags:" (ex-message e))
      (println "Stack trace:")
      (.printStackTrace e)
      (throw (ex-info "Failed to process suggestions" 
                     {:status 500 
                      :body {:error (ex-message e)}})))))

(comment
  (suggest-tags "best kendrick lamar songs")
  ;; => ({:tag "#kendrick-lamar", :domain_pk_namespace "spotify.artist", :spotify_search "Kendrick Lamar"}
  ;;     {:tag "#hip-hop", :domain_pk_namespace "spotify.genre", :spotify_search "Kendrick Lamar"}
  ;;     {:tag "#tde", :domain_pk_namespace "spotify.label", :spotify_search "Kendrick Lamar"})
)