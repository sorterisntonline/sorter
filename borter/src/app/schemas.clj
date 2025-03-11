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
   [:tags/id :int]
   [:tags/title :string]
   [:tags/description {:optional true} [:maybe :string]]
   [:tags/slug :string]
   [:tags/ns {:optional true} [:maybe :string]]
   [:tags/namespace {:optional true} [:maybe :string]]
   [:tags/owner :string]
   [:tags/created_at inst?]
   [:tags/edited_at {:optional true} inst?]
   [:tags/unlisted {:optional true} :boolean]
   [:tags/domain_pk_namespace {:optional true} [:maybe :string]]
   [:tags/domain_pk {:optional true} [:maybe :string]]
   [:tags/domain_url {:optional true} [:maybe :string]]
   [:tags/nsfw {:optional true} :boolean]
   [:tags/hide_item_authors {:optional true} :boolean]
   [:vote_count {:optional true} [:maybe :int]]
   [:item_count {:optional true} [:maybe :int]]]) 

(def ItemSchema
  [:map {:closed false}
   [:id :int]
   [:title :string]
   [:slug :string]
   [:body {:optional true} [:maybe :string]]
   [:url {:optional true} [:maybe :string]]
   [:owner :string]
   [:created_at inst?]
   [:edited_at {:optional true} inst?]
   [:domain_pk_namespace {:optional true} [:maybe :string]]
   [:domain_pk {:optional true} [:maybe :string]]
   [:num_comments {:optional true} [:maybe :int]]
   [:type {:optional true} [:maybe :string]]
   [:elo {:optional true} [:maybe :double]]
   [:vote_count {:optional true} [:maybe :int]]])

(def VoteSchema
  [:map {:closed false}
   [:id :int]
   [:owner :string]
   [:left_item_id :int]
   [:right_item_id :int]
   [:magnitude :int] 
   [:attribute :int]
   [:created_at inst?]
   [:edited_at {:optional true} inst?] 
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
   [:created_at inst?]
   [:edited_at {:optional true} inst?] 
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
                
     
