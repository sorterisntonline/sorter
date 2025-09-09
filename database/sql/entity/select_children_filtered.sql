SELECT e.*
FROM entities e
JOIN entity_relationships er ON e.pk_namespace = er.child_pk_namespace
    AND e.pk = er.child_pk
WHERE er.parent_pk_namespace = $1
    AND er.parent_pk = $2
    AND ($3::text IS NULL OR e.pk_namespace = $3)  -- pin_ns filter
    AND ($4::text IS NULL OR e.pk = $4)           -- pin_pk filter