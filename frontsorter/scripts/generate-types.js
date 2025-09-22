#!/usr/bin/env node

import { writeFileSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8081';
const API_SPEC_URL = `${BACKEND_URL}/api.json`;
const OUTPUT_DIR = './src/generated';

console.log('🔄 Generating types from Rust backend...');

async function generateTypes() {
  try {
    // Ensure output directory exists
    mkdirSync(OUTPUT_DIR, { recursive: true });

    console.log(`📡 Fetching OpenAPI spec from ${API_SPEC_URL}...`);

    // Fetch OpenAPI spec from running backend
    const response = await fetch(API_SPEC_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch OpenAPI spec: ${response.status} ${response.statusText}`);
    }

    const openApiSpec = await response.json();

    // Save the spec for reference
    writeFileSync(`${OUTPUT_DIR}/openapi.json`, JSON.stringify(openApiSpec, null, 2));
    console.log('💾 Saved OpenAPI spec to openapi.json');

    // Generate TypeScript types
    console.log('🏗️  Generating TypeScript types...');
    execSync(`npx openapi-typescript ${OUTPUT_DIR}/openapi.json -o ${OUTPUT_DIR}/api-types.ts`, {
      stdio: 'inherit'
    });

    // Generate Zod schemas with type-safe client
    console.log('🛡️  Generating Zod schemas and type-safe client...');
    execSync(`npx openapi-zod-client ${OUTPUT_DIR}/openapi.json -o ${OUTPUT_DIR}/api-client.ts`, {
      stdio: 'inherit'
    });

    console.log('✅ Type generation complete!');
    console.log(`   📁 Generated files in ${OUTPUT_DIR}/`);
    console.log('   📄 api-types.ts    - TypeScript type definitions');
    console.log('   🛡️  api-client.ts  - Zod schemas + type-safe client');
    console.log('   📋 openapi.json    - Raw OpenAPI specification');

  } catch (error) {
    console.error('❌ Type generation failed:', error.message);
    console.error('\n💡 Make sure the Rust backend is running at', BACKEND_URL);
    console.error('   You can start it with: cd ../rustsorter && cargo run');
    process.exit(1);
  }
}

generateTypes();