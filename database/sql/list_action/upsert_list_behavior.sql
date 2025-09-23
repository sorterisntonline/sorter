INSERT INTO list_behaviors(
    parent_ns,
    parent_pk,
    include_by_default,
    updated_at
) VALUES ($1, $2, $3, now())
ON CONFLICT (parent_ns, parent_pk)
DO UPDATE
    SET include_by_default = EXCLUDED.include_by_default,
        updated_at = now()
RETURNING
    parent_ns,
    parent_pk,
    include_by_default,
    created_at,
    updated_at;
