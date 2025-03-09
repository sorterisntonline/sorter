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
  [:map
   [:id :int]
   [:title :string]
   [:description {:optional true} [:maybe :string]]
   [:slug :string]
   [:ns {:optional true} [:maybe :string]]
   [:namespace {:optional true} [:maybe :string]]
   [:owner :string]
   [:created_at :string]
   [:edited_at {:optional true} :string]
   [:unlisted {:optional true} :boolean]
   [:domain_pk_namespace {:optional true} [:maybe :string]]
   [:domain_pk {:optional true} [:maybe :string]]
   [:domain_url {:optional true} [:maybe :string]]
   [:nsfw {:optional true} :boolean]
   [:hide_item_authors {:optional true} :boolean]]) 

(def ItemSchema
  [:map {:closed false}
   [:id :int]
   [:title :string]
   [:slug :string]
   [:body {:optional true} :string]
   [:url {:optional true} :string]
   [:owner :string]
   [:created_at :string]
   [:edited_at {:optional true} :string]
   [:domain_pk_namespace {:optional true} [:maybe :string]]
   [:domain_pk {:optional true} [:maybe :string]]
   [:num_comments {:optional true} [:maybe :int]]
   [:type {:optional true} :string]
   [:elo {:optional true} :double]
   [:vote_count {:optional true} :int]])

(def VoteSchema
  [:map {:closed false}
   [:id :int]
   [:owner :string]
   [:left_item_id :int]
   [:right_item_id :int]
   [:magnitude :int] 
   [:attribute :int]
   [:created_at :string]
   [:edited_at {:optional true} :string] 
   [:type {:optional true} :string]])

(def UserSchema
  [:map {:closed false}
   [:user_name :string]
   [:owner {:optional true} [:maybe :string]]
   [:email {:optional true} :string]
   [:temporary {:optional true} :boolean]])

(def AttributeSchema
  [:map
   [:id :int]
   [:owner :string]
   [:title :string]
   [:description {:optional true} :string] 
   [:created_at :string]
   [:edited_at {:optional true} :string] 
   [:votes {:optional true} :int]])

(def PermsSchema
  [:map
   [:can_vote :boolean]
   [:can_add :boolean]
   [:can_view :boolean]])

(def TagPageResponseSchema 
  [:map
   [:tag TagSchema]
   [:sorted [:vector ItemSchema]]
   [:unsorted [:vector ItemSchema]]
   [:skipped [:vector ItemSchema]]
   [:perms PermsSchema]
   [:users_who_voted [:vector UserSchema]]
   [:pair [:vector ItemSchema]]
   [:votes [:vector VoteSchema]]
   [:attributes [:vector AttributeSchema]]
   [:selected_attribute AttributeSchema]])
                
     
