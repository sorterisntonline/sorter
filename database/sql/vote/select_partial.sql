SELECT
    left_entity_ns,
    left_entity_pk,
    right_entity_ns,
    right_entity_pk,
    magnitude
FROM
    votes
WHERE (left_entity_ns || ':' || left_entity_pk) = ANY ($1)
    AND (right_entity_ns || ':' || right_entity_pk) = ANY ($1)
