(ns app.search
  (:require [instaparse.core :as insta]
            [hyperfiddle.rcf :refer [tests tap %]]))

(def query-grammar )

(defn parse [inp]

  (insta/transform
   {:word (fn [& x] (apply str x))
    :item (fn [& x] (apply str x))
    :rtword (fn [& x] (apply str x))}
   (insta/add-line-and-column-info-to-metadata
    inp
    ((insta/parser
      "
command = <spaces>? query (<'\\n'>+ itembody)?

items = itemquery <spaces>? <'\\n'>+ itembody
itembody = item (<'\\n'+> item?)*
item = <spaces?> rtword (<spaces> rtword)* <spaces?>
<itemexp> = topic | location
itemquery = itemexp (<spaces> itemexp)*
<spaces> = #'[^\\S\\n]+'

rtword = #'[a-zA-Z0-9:\\/]'+

query = exp (<spaces> exp)* <spaces>?
whitespace = #'\\s+'
<letter> = #'[a-z]'
word = letter+
<exp> = topic | user | attribute | location
topic = <'#'>word
user = <'@'>word
attribute = <':'>word
location = <'/'>word(user?)
")
     inp :total true))))

(tests
 "basic"
 (parse "#bc") := [:command [:query [:topic "bc"]]]

 (parse "#bc /de") := 
 [:command [:query [:topic "bc"] [:location "de"]]]
 
 (parse "#bc /de @me") :=
 [:command [:query [:topic "bc"] [:location "de"] [:user "me"]]]
 
 
 (parse "#bc /de @me
test")
 :=
 [:command
  [:query [:topic "bc"] [:location "de"] [:user "me"]]
  [:itembody "test"]])

(defn collect-parsed
  [[_ [_ & body] [_ & items]]]
  (cond-> (reduce (fn [m [a b]] (update m a conj b)) {} body)
    items (assoc :newitems items)))

(tests
 (collect-parsed (parse "#bc")) := {:topic ["bc"]}
 
 (collect-parsed (parse "#bc /de @me")) :=
 {:topic ["bc"] :location ["de"] :user ["me"]}


 (collect-parsed (parse
                  "#bc /de @me
test"))
 := {:topic ["bc"] :location ["de"] :user ["me"] :newitems ["test"]})


(comment
  (map meta (parse  "#bc /de @fg"))
  (parse  " #bc /de @fg /to@nate")
  (parse  "#bc /de @fg /to@nate
  wowie
  omg")
  (parse "itemsaarst")
  (type (parse  "ss"))
  (parse "/unread #clojure :truth @all /from@nate /to@nate"))
