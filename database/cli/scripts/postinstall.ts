#!/usr/bin/env bun

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

console.log('🔍 Checking sorter-db-cli installation...');

// Check if Bun is installed
try {
  const bunVersion = execSync('bun --version', { encoding: 'utf8' }).trim();
  console.log(`✅ Bun detected: ${bunVersion}`);
} catch (error) {
  console.log('⚠️  Bun not found. Please install Bun for optimal performance:');
  console.log('   curl -fsSL https://bun.sh/install | bash');
  console.log('   Or visit: https://bun.sh/docs/installation');
}

// Check if Docker is installed
try {
  const dockerVersion = execSync('docker --version', { encoding: 'utf8' }).trim();
  console.log(`✅ Docker detected: ${dockerVersion}`);
} catch (error) {
  console.log('⚠️  Docker not found. Some commands will not work without Docker.');
  console.log('   Install Docker: https://docs.docker.com/get-docker/');
}

// Check if dbmate is installed
try {
  const dbmateVersion = execSync('dbmate --version', { encoding: 'utf8' }).trim();
  console.log(`✅ dbmate detected: ${dbmateVersion}`);
} catch (error) {
  console.log('⚠️  dbmate not found. Migrate command will not work without dbmate.');
  console.log('   Install dbmate: https://github.com/amacneil/dbmate#installation');
}

console.log('\n🎉 sorter-db-cli installed successfully!');
console.log('📖 Run "sorter-db --help" to get started');