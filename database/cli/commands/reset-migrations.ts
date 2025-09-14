import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { paths } from '../utils/paths.js';
import { loadEnv, ensureDatabaseUrl } from '../utils/env.js';

export async function resetMigrations() {
  console.log('🔄 Resetting migration state...');

  // Load env from .env if present (repo root)
  const databaseUrl = ensureDatabaseUrl(loadEnv());

  // Repo-standard migrations directory
  const migrationsDir = paths.migrationsDir;

  if (!existsSync(migrationsDir)) {
    console.error(`Error: Migrations directory not found: ${migrationsDir}`);
    process.exit(1);
  }

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

}
