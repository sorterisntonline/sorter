import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { paths } from '../utils/paths.js';

export async function resetMigrations() {
  console.log('🔄 Resetting migration state...');

  // Load env from .env if present (repo root)
  const envFile = paths.envFile;
  let databaseUrl = process.env.DATABASE_URL;

  if (existsSync(envFile)) {
    console.log('Loading environment from .env file...');
    const { readFileSync } = await import('fs');
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
    console.log(`Resetting migration state for: ${migrationsDir}`);
    console.log('This will drop the schema_migrations table and re-run all migrations...');
    
    // Drop the schema_migrations table to reset state
    execSync(
      `PGSSLMODE=disable DATABASE_URL="${databaseUrl}" dbmate --migrations-dir "${migrationsDir}" drop`,
      { 
        stdio: 'inherit',
        env: { ...process.env, PGSSLMODE: 'disable', DATABASE_URL: databaseUrl }
      }
    );
    
    console.log('Migration state reset successfully!');
    console.log('You can now run "sorter-db migrate" to apply all migrations fresh.');
  } catch (error: any) {
    const errorOutput = error.stderr ? error.stderr.toString() : '';
    const errorMessage = error.message || '';
    
    console.error('❌ Error resetting migrations:');
    console.error(errorOutput || errorMessage);
    process.exit(1);
  }
}
