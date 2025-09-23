SELECT
    parent_ns,
    parent_pk,
    include_by_default,
    created_at,
    updated_at
FROM list_behaviors
WHERE parent_ns = $1
  AND parent_pk = $2;
