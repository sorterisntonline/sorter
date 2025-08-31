SELECT
    left_entity_pk_namespace,
    left_entity_pk,
    right_entity_pk_namespace,
    right_entity_pk,
    magnitude,
    rationale
FROM
    votes
WHERE (left_entity_pk_namespace || ':' || left_entity_pk) = ANY ($1)
    AND (right_entity_pk_namespace || ':' || right_entity_pk) = ANY ($1)
