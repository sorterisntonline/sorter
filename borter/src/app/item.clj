(ns app.item
  (:require [sluj.core :refer [sluj]]
            [app.database :as db]
            [honey.sql.helpers :as h]
            [lambdaisland.regal :as r]
            [ring.util.codec :as codec]))

(def yt (r/regex [:cat
                  [:? [:capture "http" [:? "s"] "://"]]
                  [:? [:capture "www."]]
                  [:alt
                   "youtu.be/"
                   "youtube.com/watch?v="]
                  [:capture [:repeat :any 11]]
                  [:capture [:* :any]]]))

(defn extract-timestamp [s]
  (when s
    (let [m (codec/form-decode s)]
      (or (get m "t") (get m "?t")))))

(defn extract-youtube-code [url]
  (def url url)
  (let [matches (re-matches yt url)
        code (nth matches 3)
        maybe-timestamp (extract-timestamp (nth matches 4))]
    (if matches
      (if maybe-timestamp
        (str code "?t=" maybe-timestamp)
        code)
      nil)))

(comment
  (extract-youtube-code "")
  (extract-youtube-code "https://google.com")
  (extract-youtube-code "https://youtu.be/i8VFi-XMkgc?si=RLOzzIQXBXRl40Ty")
  (extract-youtube-code "https://youtu.be/i8VFi-XMkgc?si=RLOzzIQXBXRl40Ty")
  (extract-youtube-code "https://youtu.be/8oYi-TBAhFg?si=QnRCagKQXMtXPs68&t=281")
  (extract-youtube-code "https://www.youtube.com/watch?v=uzQZ-ilS1ps?t=40")
  (extract-youtube-code "https://www.youtube.com/watch?v=uzQZ-ilS1ps?si=arstarst&t=30"))

(defn extract-yt-timecode [item]
  (if-let [ytcode (extract-youtube-code (:url item))]
    (assoc item
           :domain_pk ytcode
           :domain_pk_namespace "youtube.video")
    item))

(def tt (r/regex [:cat
                  [:? [:capture "http" [:? "s"] "://"]]
                  [:? [:capture "www."]]
                  "tiktok.com/"
                  [:capture [:* :any]]
                  "/video/"
                  [:capture [:repeat :any 19]]
                  [:* :any]]))

(defn extract-tiktok-code-url [url]
  (def url url)
  (let [matches (re-matches tt url)
        code (nth matches 4)]
    code))

(comment
  (extract-tiktok-code-url "https://www.tiktok.com/@simnsanto/video/7116596588570594602")
  (extract-tiktok-code-url "https://www.tiktok.com/@curlyfuq/video/7141187403468885290?is_from_webapp=1&sender_device=pc&web_id=7225392053000963627")
  (extract-tiktok-code-url "https://google.com")
  (extract-tiktok-code-url "https://youtube.com/watch?v=uzQZ-ilS1ps?si=arstarst&t=30"))

(defn extract-tiktok-code [item]
  (def item item)
  (if-let [ttcode (extract-tiktok-code-url (:url item))]
    (assoc item
           :domain_pk ttcode
           :domain_pk_namespace "tiktok.video")
    item))

"https://open.spotify.com/track/1151Q8Aev8vtz6UfuaBhAy?si=03a8ac8a75ed4aa8"
(def spo (r/regex [:cat
                   [:? [:capture "http" [:? "s"] "://"]]
                   "open.spotify.com/track/"
                   
                   [:capture [:repeat :any 22]]
                   [:* :any]]))

(comment
  (re-matches spo url))

(defn extract-spotify-code-url [url]
  (def url url)
  (nth (re-matches spo url) 2))

(defn extract-spotify-code [item]
  (def item item)
  (if-let [spcode (extract-spotify-code-url (:url item))]
    (assoc item
           :domain_pk_namespace "spotify.track"
           :domain_pk spcode)
    item))

"https://x.com/fraxiommusic/status/1814736083407487204"
(def x (r/regex [:cat
                 [:? [:capture "http" [:? "s"] "://"]]
                 "x.com/"
                 [:* :any]
                 "/"
                 [:capture [:repeat :any 19]]
                 [:* :any]]))
(comment
  (re-matches x url))

(defn extract-twitter-code [item]
  (if-let [xcode (last (re-matches x (:url item)))]
    (assoc item
           :domain_pk_namespace "x.xeet"
           :domain_pk xcode)
    item))


(defn create-item [r]
  (let [_ " create item  "
        item (-> r :body-params (dissoc :tag_id))
        item (assoc item
                    :owner (-> r :session :user_name)
                    :slug (sluj (:title item)))
        item (extract-yt-timecode item)
        item (extract-tiktok-code item)
        item (extract-spotify-code item)
        item (extract-twitter-code item)
        ret (db/exec! (-> (h/insert-into :items)
                          (h/values [item])
                          (h/returning :*)
                          (h/on-conflict :domain_pk :domain_pk_namespace)
                          (h/do-update-set {:domain_pk (:domain_pk item)} )))
        
        itemid (-> ret first :items/id )
        tagids [(-> r :body-params :tag_id)]]

    "add item to items_in_tags"
    (def tagids tagids)
    (def itemid itemid)
    (def item item)
    (db/exec! (-> (h/insert-into :items_in_tags)
                  (h/values (for [tagid tagids]
                              {:tag_id tagid
                               :item_id itemid}))))
    ret))

(defn update-item [r]
  (db/exec! (-> (h/update :items)
                (h/set (-> r :body-params
                           (dissoc :id :tag_id)
                           (assoc :edited_at [:now])
                           (extract-yt-timecode)
                           (extract-tiktok-code)
                           (extract-spotify-code)
                           (extract-twitter-code)))
                (h/where [:= :items/id (-> r :body-params :id) ]))))
