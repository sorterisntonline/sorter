SELECT
    e.*
FROM
    entities e
    JOIN entity_relationships er ON e.ns = er.parent_ns
        AND e.pk = er.parent_pk
WHERE
    er.child_ns = $1
    AND er.child_pk = $2
