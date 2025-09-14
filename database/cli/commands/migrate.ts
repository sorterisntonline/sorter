import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { paths } from '../utils/paths.js';

export async function migrate() {
  console.log('Running database migrations...');

  // Load env from .env if present (repo root)
  const envFile = paths.envFile;
  let databaseUrl = process.env.DATABASE_URL;

  if (existsSync(envFile)) {
    console.log('Loading environment from .env file...');
    const envContent = readFileSync(envFile, 'utf-8');
    const envLines = envContent.split('\n');
    
    for (const line of envLines) {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const [key, ...valueParts] = trimmedLine.split('=');
        const value = valueParts.join('=');
        if (key && value) {
          process.env[key] = value;
        }
      }
    }
    databaseUrl = process.env.DATABASE_URL;
  }

  // Ensure DATABASE_URL is set for dbmate
  if (!databaseUrl) {
    console.error('Error: DATABASE_URL must be set');
    console.error('Please set DATABASE_URL in your environment or .env file');
    process.exit(1);
  }

  // Repo-standard migrations directory
  const migrationsDir = paths.migrationsDir;

  if (!existsSync(migrationsDir)) {
    console.error(`Error: Migrations directory not found: ${migrationsDir}`);
    process.exit(1);
  }

  try {
    console.log(`Running migrations from: ${migrationsDir}`);
    console.log('Waiting for database to be ready...');
    
    // Run pending migrations and wait for DB to be ready (disable SSL for dbmate only)
    execSync(
      `PGSSLMODE=disable DATABASE_URL="${databaseUrl}" dbmate --migrations-dir "${migrationsDir}" --wait up`,
      { 
        stdio: 'inherit',
        env: { ...process.env, PGSSLMODE: 'disable', DATABASE_URL: databaseUrl }
      }
    );
    
    console.log('Migrations completed successfully!');
  } catch (error) {
    console.error('Error running migrations:', error);
    process.exit(1);
  }
}
