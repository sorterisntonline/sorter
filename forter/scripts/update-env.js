#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import ignore from 'ignore';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get environment from ENVIRONMENT env var or fallback to command line arg
const environment = process.env.ENVIRONMENT || process.argv[2] || 'development';
const overridesDir = path.join('overrides', environment);
const forterDir = path.resolve(__dirname, '..');  // Path to forter directory

// Exit early if no environment specified
if (!environment) {
    console.error('Error: Environment not specified');
    console.error('Usage: ENVIRONMENT=<env> node update-env.js');
    console.error('   or: node update-env.js <environment>');
    process.exit(1);
}

// Only process staging/production environments
if (environment !== 'production' && environment !== 'staging') {
    console.log('Using default development environment...');
    process.exit(0);
}

console.log(`Applying ${environment} overrides...`);

// Check if overrides directory exists
if (!fs.existsSync(overridesDir)) {
    console.log(`No overrides found for ${environment}`);
    process.exit(0);
}

// Load .gitignore patterns
let ignoreFilter;
try {
    const gitignoreContent = fs.readFileSync('.gitignore', 'utf8');
    ignoreFilter = ignore().add(gitignoreContent);
} catch (err) {
    console.log('No .gitignore found, proceeding without ignore patterns');
    ignoreFilter = ignore();
}

// Function to copy files recursively, respecting .gitignore
function applyOverrides(sourceDir, targetDir = forterDir) {
    const files = fs.readdirSync(sourceDir, { withFileTypes: true });

    for (const file of files) {
        const sourcePath = path.join(sourceDir, file.name);
        const targetPath = path.join(targetDir, file.name);
        const relativePath = path.relative(forterDir, targetPath);

        // Skip if file matches .gitignore patterns
        if (ignoreFilter.ignores(relativePath)) {
            continue;
        }

        if (file.isDirectory()) {
            fs.mkdirSync(targetPath, { recursive: true });
            applyOverrides(sourcePath, targetPath);
        } else {
            console.log(`Applying override: ${relativePath}`);
            fs.copyFileSync(sourcePath, targetPath);
        }
    }
}

// Apply overrides directly to the forter directory
applyOverrides(overridesDir);

console.log('Environment overrides applied successfully'); 