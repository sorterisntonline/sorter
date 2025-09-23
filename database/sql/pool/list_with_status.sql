-- List entities with their pool membership status
-- Used for management UI and bulk operations
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
LEFT JOIN entity_pool_membership epm 
    ON epm.user_id = $1 
    AND epm.entity_ns = e.ns 
    AND epm.entity_pk = e.pk
WHERE ($2::text IS NULL OR e.ns = $2) -- Optional namespace filter
  AND ($3::text[] IS NULL OR e.pk = ANY($3::text[])) -- Optional pk filter
ORDER BY 
    CASE 
        WHEN epm.in_pool = true THEN 1
        WHEN epm.in_pool IS NULL THEN 2  
        WHEN epm.in_pool = false THEN 3
    END,
    e.title;
