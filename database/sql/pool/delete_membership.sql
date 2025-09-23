-- Remove entity from pool (delete the record - returns to NULL state)
DELETE FROM entity_pool_membership
WHERE user_id = $1 
  AND entity_ns = $2 
  AND entity_pk = $3
RETURNING id;
