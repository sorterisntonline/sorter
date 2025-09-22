# Type-Safe API System Guide

## Overview

This project features automatic type safety between the Rust backend and TypeScript frontend using industry-standard tools:

- **Automatic Type Generation**: Types regenerate from Rust OpenAPI spec using `openapi-typescript`
- **Modern API Client**: Uses `openapi-fetch` (actively maintained standard)
- **Perfect Type Safety**: Zero runtime overhead, compile-time safety with autocomplete
- **Optional Validation**: Zod schemas available when runtime validation is needed
- **Zero Manual Work**: Everything updates automatically when backend changes

## For Developers

### Quick Start
```bash
# Start development - types auto-generate
npm run dev

# Types regenerate automatically when:
# - Vite detects backend is running (every 5 seconds)
# - Rust files change (file watcher)
# - You run build (production)
```

### Using the Type-Safe API
```typescript
// Import the modern API wrapper
import { entityApi, voteApi } from '../api/modern-wrapper';
import type { Entity, VoteData } from '../generated/modern-client';

// Perfect type safety with zero runtime overhead
const entities: Entity[] = await entityApi.fetchAllEntities();

const newEntity = await entityApi.createEntity({
  pk_namespace: 'custom.namespace',
  title: 'My Entity'
  // TypeScript prevents invalid payloads at compile time
});

const voteResult = await voteApi.submitVoteFn({
  left_ns: 'spotify.track',
  left_pk: 'abc123',
  right_ns: 'spotify.track',
  right_pk: 'def456',
  magnitude: 1
  // TypeScript guarantees this matches your Rust backend exactly
});
```

### Migration from Old API Calls
```typescript
// OLD: Manual fetch with no type safety
const response = await fetch('/api/entity');
const entities = await response.json(); // Could be anything!

// NEW: Modern type-safe with zero overhead
import { entityApi } from '../api/modern-wrapper';
const entities = await entityApi.fetchAllEntities(); // Guaranteed Entity[]
```

## How the Automation Works

### Backend Changes Trigger Type Regeneration
```
Rust code change → Backend restart → OpenAPI spec changes → Types auto-regenerate
```

### Development Flow
```
npm run dev → Vite starts → Auto-types plugin polls backend → Types sync automatically
```

### Build Process
```
npm run build → Generate latest types → TypeScript compile → Vite build
```

### CI/CD Integration
```
Backend changes → GitHub Actions → Types regenerate → Auto-commit to repo
```

## Generated Files (Auto-Managed)

### `src/generated/` - Never Edit These
- **`openapi.json`** - Raw OpenAPI spec from backend
- **`api-types.ts`** - TypeScript type definitions from `openapi-typescript`
- **`modern-client.ts`** - Modern client with `openapi-fetch` + optional Zod schemas

### `src/api/` - Use These in Components
- **`modern-wrapper.ts`** - Drop-in replacements for old fetchers

## 🛡️ Runtime Validation Features

### Request Validation
```typescript
// ❌ This will fail at runtime with helpful error message
await entityApi.createEntity({
  // Missing required pk_namespace!
  title: 'Test'
});

// ✅ This will succeed and be type-safe
await entityApi.createEntity({
  pk_namespace: 'required.field',
  title: 'Test'
});
```

### Response Validation
```typescript
// If backend returns invalid data, you'll get a runtime error
// instead of silent failures or type mismatches
const entities = await entityApi.fetchAllEntities();
// ^ Guaranteed to be Entity[] or throws descriptive error
```

## 🔄 Automation Commands

### Manual Generation (Usually Not Needed)
```bash
npm run generate-types        # Generate from running backend
npm run generate-types:watch  # Watch Rust files for changes
```

### Development with Full Automation
```bash
npm run dev        # Start with auto-type generation
npm run dev:full   # Start with backend file watching
```

### Production Build
```bash
npm run build      # Auto-generates latest types before building
```

## 🎉 Benefits of This System

### For Developers
- **Zero Manual Work**: Types always in sync automatically
- **Catch Errors Early**: Invalid API calls fail at compile time AND runtime
- **Perfect Autocomplete**: IDE knows exact API structure
- **Refactor Safely**: Backend changes immediately break frontend if incompatible

### For Teams
- **No Type Drift**: Frontend and backend can never be out of sync
- **Documentation**: OpenAPI spec serves as live API documentation
- **CI/CD Safety**: Builds fail if types don't match backend
- **Onboarding**: New developers get immediate type safety

### For Production
- **Runtime Safety**: Invalid API responses caught immediately
- **Performance**: Type generation happens at build time, not runtime
- **Reliability**: Zod validation prevents silent data corruption
- **Monitoring**: Clear error messages for API mismatches

## 🐛 Troubleshooting

### Types Not Generating?
```bash
# Check if backend is running
curl http://localhost:8081/api.json

# Manually trigger generation
npm run generate-types

# Check for errors in console
```

### Build Failing?
```bash
# Type check without building
npm run type-check

# Check generated files exist
ls -la src/generated/
```

### API Calls Failing Validation?
- Check the generated Zod schemas in `zodios-client.ts`
- Compare with backend OpenAPI spec at `/api.json`
- Use safe parsing: `EntitySchema.safeParse(data)`

## 🚀 Advanced Usage

### Custom Validation
```typescript
import { EntitySchema } from '../generated/zodios-client';

// Safe parsing (doesn't throw)
const result = EntitySchema.safeParse(unknownData);
if (result.success) {
  // result.data is now typed as Entity
  console.log(result.data.pk);
} else {
  console.error('Validation errors:', result.error);
}
```

### Direct Zodios Usage
```typescript
import { apiClient } from '../generated/zodios-client';

// Use the raw Zodios client for advanced features
const response = await apiClient.getEntities();
// ^ Automatically validated and typed
```

This system provides **maximum automation** with **zero configuration** required from developers. Your types will always be perfectly in sync with your Rust backend! 🎉