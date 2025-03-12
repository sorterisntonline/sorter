(ns app.schemas)

;; Define schemas using malli syntax
(def ErrorSchema
  [:map 
   [:message :string]
   [:error {:optional true} :map]])

(def InfoSchema
  [:map
   [:success :boolean]
   [:message :string]])

(def TagSchema
  [:map {:closed false}
   [:id :int]
   [:title :string]
   [:description {:optional true} [:maybe :string]]
   [:slug :string]
   [:ns {:optional true} [:maybe :string]]
   [:namespace {:optional true} [:maybe :string]]
   [:owner :string]
   [:created_at [:maybe :string]]
   [:edited_at {:optional true} [:maybe :string]]
   [:unlisted {:optional true} :boolean]
   [:domain_pk_namespace {:optional true} [:maybe :string]]
   [:domain_pk {:optional true} [:maybe :string]]
   [:domain_url {:optional true} [:maybe :string]]
   [:nsfw {:optional true} :boolean]
   [:hide_item_authors {:optional true} :boolean]
   [:vote_count {:optional true} [:maybe :int]]
   [:item_count {:optional true} [:maybe :int]]]) 

 
;;{:slug alexwut, 
;;:domain_pk nil, 
;;:type Item, 
;;:title alexwut, 
;;:domain_pk_namespace nil, 
;;:id 1414, 
;;:url , 
;;:edited_at 2024-03-02T03:27:14.213404, 
;;:num_comments nil, 
;;:body , 
;;:owner tommy, 
;;:created_at 2024-03-02T03:27:14.213404
  
  
(def ItemSchema
  [:map {:closed false}
   [:id :int]
   [:title :string]
   [:slug :string]
   [:owner :string]
   [:created_at :string]
   [:body {:optional true} [:maybe :string]]
   [:url {:optional true} [:maybe :string]]
   [:edited_at {:optional true} [:maybe :string]]
   [:domain_pk_namespace {:optional true} [:maybe :string]]
   [:domain_pk {:optional true} [:maybe :string]]
   [:num_comments {:optional true} [:maybe :int]]
   [:type {:optional true} [:maybe :string]] ;; shouldn't have 'type', its dumbass shit from rust
   [:elo {:optional true} [:maybe :double]]
   [:vote_count {:optional true} [:maybe :int]]]) 

;; {:attribute 0, 
;; :type Vote, 
;; :magnitude 47, 
;; :id 14307, 
;; :edited_at 2025-02-24T00:46:07.629909, 
;; :right_item_id 1327, 
;; :owner tommy, 
;; :created_at 2025-02-24T00:46:07.629909, 
;; :left_item_id 1336}

(def VoteSchema
  [:map {:closed false}
   [:id :int]
   [:owner :string]
   [:left_item_id :int]
   [:right_item_id :int]
   [:magnitude :int] 
   [:attribute :int]
   [:created_at :string]
   [:edited_at {:optional true} [:maybe :string]] 
   [:type {:optional true} [:maybe :string]]]) ;; shouldn't have 'type', its dumbass shit from rust

(def UserSchema
  [:map {:closed false}
   [:user_name :string]
   [:owner {:optional true} [:maybe :string]] ;; maybe because it can be null, again, dumbshit from rust
   [:email {:optional true} :string]
   [:temporary {:optional true} :boolean]])

(def AttributeSchema
  [:map
   [:id :int]
   [:owner :string]
   [:title :string]
   [:created_at :string]
   [:description {:optional true} :string] 
   [:edited_at {:optional true} [:maybe :string]] 
   [:votes {:optional true} :int]])

(def PermsSchema
  [:map
   [:can_vote :boolean]
   [:can_add :boolean]
   [:can_view :boolean]])

(def CommentSchema
  [:map {:closed false}
   [:id :int]
   [:body :string]
   [:created_at [:maybe :string]]
   [:edited_at {:optional true} [:maybe :string]]
   [:owner :string]])

(def TagPageResponseSchema 
  [:map
   [:tag TagSchema]
   [:sorted [:vector {:min 0} ItemSchema]]
   [:unsorted [:vector {:min 0} ItemSchema]]
   [:skipped [:vector {:min 0} ItemSchema]]
   [:perms PermsSchema]
   [:users_who_voted [:vector {:min 0} UserSchema]]
   [:pair [:vector {:min 0 :max 2} ItemSchema]] 
   [:votes [:vector {:min 0} VoteSchema]]
   [:attributes [:vector AttributeSchema]]
   [:selected_attribute {:optional true} AttributeSchema]])
                
     
