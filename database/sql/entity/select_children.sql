SELECT
    e.*
FROM
    entities e
    JOIN entity_relationships er ON e.pk_namespace = er.child_pk_namespace
        AND e.pk = er.child_pk
WHERE
    er.parent_pk_namespace = $1
    AND er.parent_pk = $2
