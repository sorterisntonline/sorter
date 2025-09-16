#!/usr/bin/env bun

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

console.log('🚀 Installing sorter-db-cli...');

// Get the directory where this script is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const scriptDir = dirname(__dirname); // Go up one level from scripts/ to cli/
const cliDir = scriptDir;

console.log(`📁 CLI directory: ${cliDir}`);

// Check if npm is available
try {
  execSync('npm --version', { stdio: 'pipe' });
} catch (error) {
  console.log('❌ npm is required but not installed. Please install Node.js first:');
  console.log('   https://nodejs.org/');
  process.exit(1);
}

// Check if package.json exists in the CLI directory
if (!existsSync(join(cliDir, 'package.json'))) {
  console.log(`❌ package.json not found in ${cliDir}`);
  console.log('   Make sure you\'re running this from the correct location');
  process.exit(1);
}

// Install globally from the CLI directory
console.log('📦 Installing sorter-db-cli globally...');
try {
  execSync('npm install -g .', { stdio: 'inherit', cwd: cliDir });
} catch (error) {
  console.log('❌ Installation failed. Please try again.');
  process.exit(1);
}

// Check installation
try {
  execSync('sorter-db --version', { stdio: 'pipe' });
  console.log('✅ sorter-db-cli installed successfully!');
} catch (error) {
  console.log('❌ Installation verification failed. Please try again.');
  process.exit(1);
}
