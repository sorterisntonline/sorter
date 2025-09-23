-- Select children entities that are eligible for ranking
-- Only returns entities that are in_pool=true or unclassified (NULL)
-- Excludes blocked entities (in_pool=false)
SELECT
    e.*
FROM
    entities e
    JOIN entity_relationships er ON e.ns = er.child_ns
        AND e.pk = er.child_pk
    LEFT JOIN entity_pool_membership epm 
        ON epm.entity_ns = e.ns 
        AND epm.entity_pk = e.pk
        AND epm.user_id = (SELECT id FROM users WHERE handle = $2)
WHERE
    er.parent_ns = $1
    AND er.parent_pk = $2
    AND (epm.in_pool IS NULL OR epm.in_pool = true)  -- Include unclassified and in_pool, exclude blocked
