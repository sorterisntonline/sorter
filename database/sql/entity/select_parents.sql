SELECT
    e.*
FROM
    entities e
    JOIN entity_relationships er ON e.pk_namespace = er.parent_pk_namespace
        AND e.pk = er.parent_pk
WHERE
    er.child_pk_namespace = $1
    AND er.child_pk = $2
