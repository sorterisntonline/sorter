SELECT DISTINCT ON (entity_ns, entity_pk)
    id,
    user_id,
    list_ns,
    list_pk,
    entity_ns,
    entity_pk,
    action,
    created_at,
    expires_at
FROM user_list_actions
WHERE user_id = $1
  AND list_ns = $2
  AND list_pk = $3
  AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
ORDER BY entity_ns, entity_pk, created_at DESC, id DESC;
