SELECT
    e.*
FROM
    entities e
    JOIN entity_relationships er ON e.ns = er.child_ns
        AND e.pk = er.child_pk
WHERE
    er.parent_ns = $1
    AND er.parent_pk = $2
