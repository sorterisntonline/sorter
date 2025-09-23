-- Add or update entity pool membership
INSERT INTO entity_pool_membership (user_id, entity_ns, entity_pk, in_pool)
VALUES ($1, $2, $3, $4)
ON CONFLICT (user_id, entity_ns, entity_pk)
DO UPDATE SET 
  in_pool = EXCLUDED.in_pool,
  created_at = now()
RETURNING id, in_pool, created_at;
