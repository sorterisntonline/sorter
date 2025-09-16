import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { paths } from '../utils/paths.js';
import { loadEnv, ensureDatabaseUrl } from '../utils/env.js';

export async function migrate() {
  console.log('Running database migrations...');

  // Load env from .env and rely on the DATABASE_URL written by run-postgres
  const finalDatabaseUrl = ensureDatabaseUrl(loadEnv());

  // Repo-standard migrations directory
  const migrationsDir = paths.migrationsDir;

  if (!existsSync(migrationsDir)) {
    console.error(`Error: Migrations directory not found: ${migrationsDir}`);
    process.exit(1);
  }

  console.log(`Running migrations from: ${migrationsDir}`);
  console.log(`Connecting to database: ${finalDatabaseUrl}`);
  console.log('Waiting for database to be ready...');
    
  // Run pending migrations and wait for DB to be ready (disable SSL for dbmate only)
  execSync(
    `PGSSLMODE=disable DATABASE_URL="${finalDatabaseUrl}" dbmate --migrations-dir "${migrationsDir}" --wait up`,
    { 
      stdio: 'pipe',
      env: { ...process.env, PGSSLMODE: 'disable', DATABASE_URL: finalDatabaseUrl }
    }
  );
    
    console.log('Migrations completed successfully!');
}
