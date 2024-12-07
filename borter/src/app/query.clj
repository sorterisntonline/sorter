(ns app.query
  (:require [hyperfiddle.rcf :refer [tests]]
            [honey.sql.helpers :as h]
            [sluj.core :refer [sluj]]
            [app.database :as db]
            [hyperfiddle.rcf :refer [tests tap %]]))

(comment
  (db/exec! (-> (h/delete-from :items_in_Tags)
                (h/where [:and
                          [:in :item_id {:select :id :from :items :where [:= :owner "notbuud3339"]}]])))
  (db/exec! {:select [:created_at :owner] :from :tags})
  (db/exec! {:select [:created_at :user_name] :from :users})
  (db/exec! {:select [:created_at] :from :votes})
  
  
  )







