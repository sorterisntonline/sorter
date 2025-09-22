// 🚀 Type-safe API client with automatic runtime validation
// This file shows how to use the auto-generated types and schemas

import { createApiClient, schemas } from '../generated/api-client';
import type { paths } from '../generated/api-types';

// Create the type-safe client with runtime validation
const apiClient = createApiClient('http://localhost:8081', {
  // Automatic request/response validation with Zod
  validateRequest: true,
  validateResponse: true,

  // Custom error handling
  transform: {
    request: (config) => {
      console.log('🔍 Validating request:', config.method, config.url);
      return config;
    },
    response: (response) => {
      console.log('✅ Response validated:', response.status);
      return response;
    }
  }
});

// ============================================================================
// 🎯 TYPE-SAFE API CALLS - These replace your existing fetchers!
// ============================================================================

// Entity operations with automatic validation
export const entityApi = {
  // 📝 List all entities - automatically validates response as Entity[]
  async listEntities() {
    return apiClient.get('/api/entity');
  },

  // 🆕 Create entity - validates both request and response
  async createEntity(data: Parameters<typeof schemas.CreateEntityData.parse>[0]) {
    return apiClient.post('/api/entity', data);
  },

  // 🔍 Get entity with children - path params are type-safe!
  async getEntity(namespace: string, pk: string, includeChildren = false) {
    const params = includeChildren ? '?children=true' : '';
    return apiClient.get(`/api/entity/${encodeURIComponent(namespace)}/${encodeURIComponent(pk)}${params}`);
  }
};

// Vote operations with automatic validation
export const voteApi = {
  // 🗳️ Submit vote - validates the exact structure from Rust backend
  async submitVote(voteData: Parameters<typeof schemas.VoteData.parse>[0]) {
    return apiClient.post('/api/vote', voteData);
  },

  // 🎯 Get voting pair - validates response structure
  async getPair(params?: {
    left_ns?: string;
    left_pk?: string;
    right_ns?: string;
    right_pk?: string;
  }) {
    const query = params ? new URLSearchParams(params as Record<string, string>).toString() : '';
    const url = query ? `/api/pair?${query}` : '/api/pair';
    return apiClient.get(url);
  }
};

// ============================================================================
// 🛡️ VALIDATION UTILITIES - Use these for manual validation
// ============================================================================

export const validators = {
  // Validate any data against generated schemas
  entity: schemas.Entity.parse,
  createEntity: schemas.CreateEntityData.parse,
  voteData: schemas.VoteData.parse,
  voteResponse: schemas.VoteResponse.parse,

  // Safe parsing (doesn't throw on invalid data)
  safeEntity: schemas.Entity.safeParse,
  safeCreateEntity: schemas.CreateEntityData.safeParse,
  safeVoteData: schemas.VoteData.safeParse,
  safeVoteResponse: schemas.VoteResponse.safeParse,
};

// ============================================================================
// 🔧 MIGRATION HELPERS - Replace your existing fetchers gradually
// ============================================================================

// Drop-in replacement for your existing entityEndpoints
export const entityEndpoints = {
  // ✅ Old: fetch('/api/entity').then(res => res.json())
  // 🚀 New: Automatic validation + type safety
  fetchAllEntities: () => entityApi.listEntities(),

  // ✅ Old: fetch('/api/entity', { method: 'POST', body: JSON.stringify(data) })
  // 🚀 New: Request validation + response validation
  createEntity: (data: Parameters<typeof schemas.CreateEntityData.parse>[0]) =>
    entityApi.createEntity(data),

  // ✅ Old: Manual URL construction + manual validation
  // 🚀 New: Type-safe params + automatic validation
  fetchEntityWithChildren: ({ pk_namespace, pk }: { pk_namespace: string; pk: string }) =>
    entityApi.getEntity(pk_namespace, pk, true),
};

// Drop-in replacement for your existing voteEndpoints
export const voteEndpoints = {
  // ✅ Old: Manual payload construction + no validation
  // 🚀 New: Zod validation ensures payload matches Rust backend exactly
  submitVoteFn: (voteData: Parameters<typeof schemas.VoteData.parse>[0]) =>
    voteApi.submitVote(voteData),

  // ✅ Old: Manual URL construction
  // 🚀 New: Type-safe parameters
  fetchPairFn: ({ queryKey }: { queryKey: string[] }) => {
    const [, type, ...params] = queryKey;

    if (type === 'specific' && params.length === 4) {
      return voteApi.getPair({
        left_ns: params[0],
        left_pk: params[1],
        right_ns: params[2],
        right_pk: params[3]
      });
    }

    return voteApi.getPair();
  }
};

// ============================================================================
// 🎉 USAGE EXAMPLES
// ============================================================================

/*
// In your components, replace:

// ❌ OLD WAY:
const response = await fetch('/api/entity');
const entities = await response.json(); // Could be anything!

// ✅ NEW WAY:
const entities = await entityApi.listEntities();
// ^ TypeScript knows this is Entity[] + runtime validated!

// ❌ OLD WAY:
const voteData = { left_ns: 'a', left_pk: 'b' }; // Missing required fields!
await fetch('/api/vote', { method: 'POST', body: JSON.stringify(voteData) });

// ✅ NEW WAY:
const voteData = {
  left_ns: 'spotify.track',
  left_pk: 'abc123',
  right_ns: 'spotify.track',
  right_pk: 'def456',
  magnitude: 1 // Zod ensures all required fields are present!
};
await voteApi.submitVote(voteData); // Validates at runtime!
*/

export default apiClient;