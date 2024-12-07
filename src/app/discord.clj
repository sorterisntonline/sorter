(ns app.discord
  (:require [app.database :as db]
            [app.vote :as vote]
            [app.permissions :as perms]
            [honey.sql.helpers :as h]
            [hato.client :as hc]
            [clojure.data.json :as json]
            [ring.util.response :as response]
            [app.login :as login]
            [borkdude.deflet :refer [deflet]]
            [ring.middleware.ratelimit :as rl])
  (:import
   [java.net URLEncoder]))

(defn lookup-tag-discordid [req]
  (when-not (= "discord" (-> req :session :user_name))
    (throw (ex-info "must be discord bot" {:status 403})))
  
  {:status 200 :body (db/exec! {:select :* :from :tags :where
                                [:and
                                 [:= :domain_pk_namespace (-> req :query-params (get "domain_pk_namespace"))]
                                 [:= :domain_pk (-> req :query-params (get "domain_pk"))]]})})

(defn vote-discord [req]
  (when-not (= "discord" (-> req :session :user_name))
    (throw (ex-info "must be discord bot" {:status 403})))

  (def req req)
  (def discordname (str "d/"(-> req :params :discord_userid)))
  (def user (or
             (first (db/exec! {:select :* :from :users :where [:= :user_name discordname]}))
             (first (db/exec! {:insert-into :users
                               :values [{:user_name discordname}]
                               :returning :*}))))

  {:status 200 :body (vote/vote-post (-> req
                                         (assoc :body-params (-> (:body-params req)
                                                                 (dissoc :discord_username :discord_userid)
                                                                 (assoc-in [:attribute :id] 0)))
                                         (assoc-in [:session :user_name] (:users/user_name user))))})

(def routes [["/lookup" {:get {:handler #'lookup-tag-discordid}}]
             ["/vote" {:post {:handler #'vote-discord}}]])
