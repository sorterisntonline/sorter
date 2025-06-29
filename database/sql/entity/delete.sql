DELETE FROM entities
WHERE pk_namespace = $1
    AND pk = $2
