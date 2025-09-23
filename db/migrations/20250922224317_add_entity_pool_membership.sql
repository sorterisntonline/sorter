-- migrate:up

-- Entity pool membership for binary classification system
-- Allows users to curate which entities are eligible for pairwise voting
CREATE TABLE entity_pool_membership (
    id          bigserial PRIMARY KEY,
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entity_ns   text NOT NULL,
    entity_pk   text NOT NULL,
    in_pool     boolean NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    
    -- Ensure one record per user/entity combination
    UNIQUE(user_id, entity_ns, entity_pk),
    
    -- Ensure entity exists
    FOREIGN KEY (entity_ns, entity_pk) REFERENCES entities(ns, pk) ON DELETE CASCADE
);

-- Performance indexes for pool operations
CREATE INDEX idx_entity_pool_user_entity ON entity_pool_membership(user_id, entity_ns, entity_pk);
CREATE INDEX idx_entity_pool_user_status ON entity_pool_membership(user_id, in_pool);
CREATE INDEX idx_entity_pool_entity_lookup ON entity_pool_membership(entity_ns, entity_pk);

-- migrate:down

DROP TABLE entity_pool_membership;
