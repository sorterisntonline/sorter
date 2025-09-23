# Entity Pool Management Implementation Plan

## Overview
Implement a complete binary classification system for pairwise voting that allows users to curate their sorting pools by controlling which entities are eligible for comparison.

## The Core Design

### Database Schema
```sql
CREATE TABLE entity_pool_membership (
    id          bigserial PRIMARY KEY,
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entity_ns   text NOT NULL,
    entity_pk   text NOT NULL,
    in_pool     boolean NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    
    UNIQUE(user_id, entity_ns, entity_pk)
);
```

### The Three States
1. **No record (NULL)** → Not in pool (default state)
2. **in_pool = true** → Explicitly added for sorting  
3. **in_pool = false** → Explicitly blocked/skipped

## Implementation Phases

### Phase 1: Database & Backend Foundation ✅
- [x] Create database migration for entity_pool_membership table
- [x] Run database migrations
- [x] Scaffold REST endpoints for pool management:
  - `GET /api/pool/{ns}/{pk}` - Check entity pool status
  - `POST /api/pool/{ns}/{pk}/add` - Add entity to pool
  - `POST /api/pool/{ns}/{pk}/remove` - Remove entity from pool  
  - `POST /api/pool/{ns}/{pk}/block` - Block entity from pool
  - `GET /api/pool/list` - List pool status for entities
  - `POST /api/pool/batch` - Batch operations
- [x] Integrate pool filtering into existing pair selection logic (without replacing core algorithm)
- [x] Write SQL queries for pool-aware entity selection

### Phase 2: Testing & Validation ⏳
- [ ] Write Python integration tests for all pool endpoints
- [ ] Test pool filtering in pair selection
- [ ] Validate performance with large datasets
- [ ] Test edge cases (empty pools, all blocked, etc.)

### Phase 3: Frontend Integration 📋
- [ ] Create pool management components:
  - Entity pool status indicator
  - Add/remove/block buttons
  - Three-panel management interface
- [ ] Integrate pool controls into existing entity views
- [ ] Add discovery mode for unclassified entities
- [ ] Implement bulk operations UI

### Phase 4: UX Enhancement 🎨
- [ ] Three-panel drag-and-drop interface:
  ```
  ┌─────────────┐ ┌──────────┐ ┌─────────────┐
  │   IN POOL   │ │ CONTROLS │ │  NOT IN     │
  │             │ │          │ │  POOL       │
  │ ✓ Book A    │ │  [<-->]  │ │ Book D      │
  │ ✓ Book B    │ │  [<--]   │ │ Book E      │
  │ ✓ Book C    │ │  [-->]   │ │ ✗ Book F    │
  │             │ │          │ │ Book G      │
  │ (42 items)  │ │[Select   │ │ (856 items) │
  │             │ │ All]     │ │             │
  └─────────────┘ └──────────┘ └─────────────┘
  ```
- [ ] Pool statistics and insights
- [ ] Smart suggestions for pool curation

## Technical Architecture

### API Endpoints
```
GET    /api/pool/{ns}/{pk}           - Get pool status for entity
POST   /api/pool/{ns}/{pk}/add       - Add entity to pool (in_pool = true)
POST   /api/pool/{ns}/{pk}/remove    - Remove from pool (delete record)
POST   /api/pool/{ns}/{pk}/block     - Block entity (in_pool = false)
GET    /api/pool/list                - List entities with pool status
POST   /api/pool/batch               - Batch pool operations
```

### Database Queries
- Pool-aware entity selection for pair generation
- Efficient filtering without replacing existing pair selection logic
- Bulk operations for pool management
- Analytics queries for pool statistics

### Integration Points
- Modify `get_filtered_children()` in pair.rs to respect pool membership
- Add pool status to entity serialization
- Extend existing pair selection to filter by pool membership
- Maintain backward compatibility with existing voting system

## Key Design Principles

### 1. Opt-in Philosophy
- Content starts as NULL (unclassified)
- Users explicitly choose what enters their sorting pool
- Acknowledges that attention/experience is the scarce resource

### 2. Context-Free Blocking
- If you block a song, it's blocked everywhere
- Matches user mental model - "I hate this song" not "I hate this song in this context"

### 3. Preserve Existing Logic
- Don't replace the sophisticated pair selection algorithm
- Add pool filtering as a pre-filter step
- Maintain all existing ranking and vote-based logic

### 4. Performance First
- Index on (user_id, entity_ns, entity_pk, in_pool)
- Efficient LEFT JOIN for unclassified discovery
- Batch operations for bulk management

## Migration Strategy

### Existing Data
- Leave existing votes unchanged
- All previously voted entities could be auto-added to pools
- Or start fresh with NULL state for all entities

### User Experience
- Discovery mode helps users classify entities before sorting
- Progressive disclosure - advanced features behind settings
- Clear visual indicators for pool status

## Success Metrics

### Functional
- All pool operations work correctly
- Pair selection respects pool membership
- No performance regression in pair generation
- Full test coverage of new functionality

### User Experience  
- Users can effectively curate their sorting pools
- Pool management feels intuitive and responsive
- Sorting quality improves due to better curation
- Users engage more with sorting due to increased relevance

## Files Changed
- `db/migrations/[timestamp]_add_entity_pool_membership.sql`
- `rustsorter/src/pool.rs` (new module)
- `rustsorter/src/pair.rs` (integrate pool filtering)
- `rustsorter/src/main.rs` (add pool routes)
- `database/sql/pool/` (new queries)
- `test/test_pool.py` (new test file)
- `frontsorter/src/components/PoolManager.tsx` (new component)
- `frontsorter/src/hooks/usePool.ts` (new hook)

## Risk Mitigation

### Performance
- Comprehensive indexing strategy
- Query optimization and testing
- Gradual rollout with monitoring

### Data Integrity
- Foreign key constraints
- Transaction safety for batch operations
- Backup strategy before migration

### User Adoption
- Backward compatibility maintained
- Optional feature initially
- Clear documentation and onboarding
