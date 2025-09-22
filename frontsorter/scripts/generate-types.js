#!/usr/bin/env node

import { writeFileSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8081';
const API_SPEC_URL = `${BACKEND_URL}/api.json`;
const OUTPUT_DIR = './src/generated';

console.log('🔧 Generating TypeScript types from Rust backend...');

async function generateTypes() {
  try {
    mkdirSync(OUTPUT_DIR, { recursive: true });

    console.log(`📡 Fetching OpenAPI spec from ${API_SPEC_URL}...`);

    // Fetch OpenAPI spec from running backend
    let openApiSpec;
    try {
      const response = await fetch(API_SPEC_URL);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      openApiSpec = await response.json();
      console.log('✅ Fetched OpenAPI spec from backend');
    } catch (error) {
      console.error('❌ Backend not available:', error.message);
      console.error('💡 Start the backend with: cd ../rustsorter && cargo run');
      process.exit(1);
    }

    // Save the spec
    writeFileSync(`${OUTPUT_DIR}/openapi.json`, JSON.stringify(openApiSpec, null, 2));

    // Generate TypeScript types
    console.log('🏗️  Generating TypeScript types...');
    execSync(`npx openapi-typescript ${OUTPUT_DIR}/openapi.json -o ${OUTPUT_DIR}/api-types.ts`, {
      stdio: 'inherit'
    });

    // Create simple types file for existing code
    const typesContent = `// Re-export generated types for existing code compatibility
import type { components } from './api-types';

// Core API types from Rust backend
export type Entity = components['schemas']['Entity'];
export type CreateEntityData = components['schemas']['CreateEntityData'];
export type VoteData = components['schemas']['VoteData'];
export type VoteResponse = components['schemas']['VoteResponse'];

// Compatibility types for existing frontend code
export interface VoteEntity {
  left_entity: Entity;
  right_entity: Entity;
}

export interface VoteParams {
  child_pk: string;
  child_pk_namespace: string;
  parent_pk: string;
  parent_pk_namespace: string;
}

export interface QueryKeyParams {
  queryKey: string[];
}

export interface ApiError {
  message: string;
  status?: number;
}

// Todo types (using Entity as base)
export type Todo = Entity & {
  children?: Todo[];
  parent_pk?: string;
  metadata?: {
    completed?: boolean;
    priority?: string;
    [key: string]: any;
  };
};

export type CreateTodoData = CreateEntityData & {
  entity_pk?: string;
  priority?: string;
  completed?: boolean;
  id?: string;
};

export type UpdateTodoData = {
  title?: string;
  completed?: boolean;
  metadata?: {
    [key: string]: any;
  };
  priority?: string;
};

export type CreateSubtaskData = CreateTodoData;

// Component props (if these are only used locally, consider moving to component files)
export interface EntityFormProps {
  onEntityCreated?: (entity: Entity) => void;
}

export interface AddTodoFormProps {
  onTodoAdded?: (todo: Todo) => void;
  entityPk?: string;
}

export interface TodoItemProps {
  todo: Todo;
  onUpdate?: (todo: Todo) => void;
  onDelete?: (todoId: string) => void;
}
`;

    writeFileSync(`${OUTPUT_DIR}/types.ts`, typesContent);

    console.log('✅ Type generation complete!');
    console.log(`   📁 Files: ${OUTPUT_DIR}/`);
    console.log('   📄 api-types.ts - Raw OpenAPI types');
    console.log('   📄 types.ts     - App-specific types');
    console.log('   📄 openapi.json  - OpenAPI spec');

  } catch (error) {
    console.error('❌ Type generation failed:', error.message);
    process.exit(1);
  }
}

generateTypes();