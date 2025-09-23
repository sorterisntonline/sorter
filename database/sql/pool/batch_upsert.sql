-- Batch upsert pool memberships
-- $1: user_id
-- $2: array of entity_ns values
-- $3: array of entity_pk values  
-- $4: array of in_pool values
-- Arrays must be same length
INSERT INTO entity_pool_membership (user_id, entity_ns, entity_pk, in_pool)
SELECT $1, unnest($2::text[]), unnest($3::text[]), unnest($4::boolean[])
ON CONFLICT (user_id, entity_ns, entity_pk)
DO UPDATE SET 
  in_pool = EXCLUDED.in_pool,
  created_at = now()
RETURNING entity_ns, entity_pk, in_pool;
