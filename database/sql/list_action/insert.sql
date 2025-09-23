INSERT INTO user_list_actions(
    user_id,
    list_ns,
    list_pk,
    entity_ns,
    entity_pk,
    action,
    expires_at
) VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING
    id,
    user_id,
    list_ns,
    list_pk,
    entity_ns,
    entity_pk,
    action,
    created_at,
    expires_at;
