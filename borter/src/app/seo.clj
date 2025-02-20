(ns app.seo
  (:require [clojure.string :as str]
            [ring.util.response :as resp]
            [clojure.tools.logging :as log]))

(def environment
  (or (System/getenv "ENVIRONMENT") "development"))

(def env-config
  {"production" {:domain "sorter.social"
                 :protocol "https://"
                 :title-suffix ""
                 :image-url "https://sorter.social/logoanim.gif"}
   "staging" {:domain "staging.sorter.social"
              :protocol "https://"
              :title-suffix " (staging)"
              :image-url "https://staging.sorter.social/logoanim_tierlist.gif"}
   "development" {:domain "localhost:3000"
                 :protocol "http://"
                 :title-suffix ""
                 :image-url "http://localhost:3000/logoanim.gif"}})

(def current-env (get env-config environment))

(def base-meta
  {:title (str "sorter.social - democratic consensus through pairwise voting" (:title-suffix current-env))
   :description "create ranked lists of anything through democratic consensus. vote on pairs of items to sort them into a meaningful order."
   :image (:image-url current-env)})

;; Define the routes that should get meta tags
(def meta-tag-routes
  {;; Static routes
   "/feed" {:title "Feed - Sorter Social"
            :description "View your personalized feed of sorts and rankings"}
   "/tags3" {:title "Tags - Sorter Social"
             :description "Browse and discover sorting collections"}
   "/tags2" {:title "Tags - Sorter Social"
             :description "Browse and discover sorting collections"}
   "/" {:title "Sorter Social"
        :description "Create and share your rankings"}
   "/viz" {:title "Visualization - Sorter Social"
           :description "Visualize sorting data"}
   "/faq" {:title "FAQ - Sorter Social"
           :description "Frequently Asked Questions"}
   "/integrations" {:title "Integrations - Sorter Social"
                    :description "Connect your accounts"}
   "/leaderboard" {:title "Leaderboard - Sorter Social"
                   :description "Top sorters and rankings"}
   "/profile" {:title "Profile - Sorter Social"
               :description "Your profile and settings"}
   
   ;; Dynamic routes
   "/namespace/:namespace" {:title ":namespace Rankings - Sorter Social"
                          :description "Browse :namespace items"}
   "/:tagid/:slug" {:title ":slug - Sorter Social"
                    :description "View and sort items in this collection"}
   "/:tagid/:slug/voting" {:title "Vote - :slug - Sorter Social"
                          :description "Vote on items in this collection"}
   "/:tagid/:slug/graph" {:title "Graph - :slug - Sorter Social"
                         :description "Visualize sorting results"}})

(defn get-canonical-url
  "Constructs canonical URL from request"
  [req]
  (str (:protocol current-env)
       (:domain current-env)
       (:uri req)
       (when-let [query (:query-string req)]
         (str "?" query))))

(defn match-route
  "Matches a request path to a route pattern"
  [path]
  (let [path-parts (str/split (or path "/") #"/")
        patterns (keys meta-tag-routes)]
    (some (fn [pattern]
            (let [pattern-parts (str/split pattern #"/")]
              (when (and 
                     ;; Match exact parts count or pattern is catchall
                     (or (= (count pattern-parts) (count path-parts))
                         (= pattern "/:rest*"))
                     ;; Each part either matches exactly or is a parameter
                     (every? (fn [[pattern-part path-part]]
                             (or (str/starts-with? pattern-part ":")
                                 (= pattern-part path-part)))
                           (map vector pattern-parts path-parts)))
                ;; Return pattern and params map
                [pattern (into {}
                              (keep (fn [[pattern-part path-part]]
                                     (when (str/starts-with? pattern-part ":")
                                       [(keyword (subs pattern-part 1)) path-part]))
                                   (map vector pattern-parts path-parts)))])))
          patterns)))

(defn get-meta-tags
  "Get meta tags for a given request"
  [request]
  (when-let [[pattern params] (match-route (:uri request))]
    (let [base-tags (get meta-tag-routes pattern)
          ;; Replace parameters in title/description
          replaced-tags (reduce-kv
                        (fn [tags param value]
                          (-> tags
                              (update :title #(str/replace % (str ":" (name param)) value))
                              (update :description #(str/replace % (str ":" (name param)) value))))
                        base-tags
                        params)]
      (merge
       {:og:type "website"
        :og:site_name "Sorter Social"}
       replaced-tags
       {:og:title (:title replaced-tags)
        :og:description (:description replaced-tags)}))))

(defn inject-meta-tags
  "Injects meta tags into HTML response"
  [body meta-tags]
  (let [meta-html (str "<title>" (:title meta-tags) "</title>\n"
                      "<meta name=\"description\" content=\"" (:description meta-tags) "\">\n"
                      "<meta property=\"og:title\" content=\"" (:title meta-tags) "\">\n"
                      "<meta property=\"og:description\" content=\"" (:description meta-tags) "\">\n"
                      "<meta property=\"og:image\" content=\"" (:image meta-tags) "\">\n"
                      "<meta property=\"og:url\" content=\"" (:url meta-tags) "\">\n"
                      "<link rel=\"canonical\" href=\"" (:url meta-tags) "\">\n"
                      "<meta name=\"twitter:card\" content=\"summary_large_image\">\n")]
    (str/replace body #"<head>" (str "<head>\n" meta-html))))

(defn should-add-meta-tags?
  "Determines if meta tags should be added to this route"
  [path]
  (let [[pattern] (match-route path)]
    (and pattern 
         (contains? meta-tag-routes pattern))))

(defn ensure-response-map
  "Ensures the response is a proper ring response map"
  [response]
  (cond
    (map? response) 
    (do 
      (log/debug "Response is already a map:" (keys response))
      response)
    
    (nil? response) 
    (do
      (log/debug "Response is nil, returning 404")
      {:status 404 :body "not found"})
    
    :else 
    (do
      (log/debug "Converting response to map, type:" (type response))
      {:status 200 
       :body response
       :headers {"Content-Type" (if (string? response) 
                                 "text/html; charset=utf-8"
                                 "application/json")}})))

(defn api-route?
  "Check if the request is for an API route"
  [uri]
  (or (str/starts-with? uri "/api/")
      (str/starts-with? uri "/spotify/")
      (str/starts-with? uri "/youtube/")))

(defn wrap-seo
  "Middleware to handle SEO-related modifications"
  [handler]
  (fn [request]
    (let [uri (:uri request)]
      (if (api-route? uri)
        (handler request)  ; Immediately return API requests without processing
        ;; For non-API routes, apply SEO processing
        (let [response (-> (handler request)
                          ensure-response-map)]
          (log/debug "Response type:" (type (:body response)))
          (log/debug "Content-Type:" (get-in response [:headers "Content-Type"]))
          (if (and
               (= (:status response) 200)
               (string? (:body response))
               (or (nil? (get-in response [:headers "Content-Type"]))
                   (str/includes? (get-in response [:headers "Content-Type"]) "text/html")))
            (do
              (log/debug "Applying SEO modifications to HTML response")
              (let [canonical-url (get-canonical-url request)
                    meta-tags     (when (should-add-meta-tags? uri)
                                    (get-meta-tags request))]
                (cond-> response
                  true
                  (assoc-in [:headers "Link"]
                            (str "<" canonical-url ">; rel=\"canonical\""))
                  meta-tags
                  (-> (assoc :body (inject-meta-tags (:body response) meta-tags))
                      (assoc-in [:headers "Content-Type"]
                                "text/html; charset=utf-8")))))
            (do
              (log/debug "Skipping SEO processing for non-HTML response")
              response))))))) 