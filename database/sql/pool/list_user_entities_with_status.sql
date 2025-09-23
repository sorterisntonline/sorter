-- List user's entities with their pool membership status
-- Only returns entities that have a relationship with the user
SELECT 
    e.ns,
    e.pk, 
    e.title,
    e.profile_picture_url,
    e.metadata,
    CASE 
        WHEN epm.in_pool IS NULL THEN 'unclassified'
        WHEN epm.in_pool = true THEN 'in_pool' 
        WHEN epm.in_pool = false THEN 'blocked'
    END as pool_status,
    epm.created_at as status_updated_at
FROM entities e
INNER JOIN entity_relationships r ON r.child_ns = e.ns AND r.child_pk = e.pk
LEFT JOIN entity_pool_membership epm 
    ON epm.user_id = $1 
    AND epm.entity_ns = e.ns 
    AND epm.entity_pk = e.pk
WHERE r.parent_ns = 'sorter.user' 
  AND r.parent_pk = (SELECT handle FROM users WHERE id = $1)
  AND ($2::text IS NULL OR e.ns = $2) -- Optional namespace filter
ORDER BY 
    CASE 
        WHEN epm.in_pool = true THEN 1
        WHEN epm.in_pool IS NULL THEN 2  
        WHEN epm.in_pool = false THEN 3
    END,
    e.title;
