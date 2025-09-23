-- Get pool membership status for a specific entity
SELECT in_pool, created_at
FROM entity_pool_membership
WHERE user_id = $1 
  AND entity_ns = $2 
  AND entity_pk = $3;
