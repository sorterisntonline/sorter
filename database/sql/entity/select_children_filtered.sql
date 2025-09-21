SELECT e.*
FROM entities e
JOIN entity_relationships er ON e.ns = er.child_ns
    AND e.pk = er.child_pk
WHERE er.parent_ns = $1
    AND er.parent_pk = $2
    AND ($3::text IS NULL OR e.ns = $3)  -- pin_ns filter
    AND ($4::text IS NULL OR e.pk = $4)           -- pin_pk filter