import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { paths } from '../utils/paths.js';
import { loadEnv, ensureDatabaseUrl } from '../utils/env.js';

export async function migrate() {
  console.log('Running database migrations...');

  // Load env from .env if present (repo root)
  const databaseUrl = ensureDatabaseUrl(loadEnv());
  
  // Override port if DATABASE_PORT environment variable is set
  let finalDatabaseUrl = databaseUrl;
  if (process.env.DATABASE_PORT) {
    const port = process.env.DATABASE_PORT;
    // Replace port in DATABASE_URL if it exists, or add it if it doesn't
    if (databaseUrl.includes('@localhost:')) {
      finalDatabaseUrl = databaseUrl.replace(/@localhost:\d+/, `@localhost:${port}`);
    } else if (databaseUrl.includes('@localhost/')) {
      finalDatabaseUrl = databaseUrl.replace('@localhost/', `@localhost:${port}/`);
    }
  }

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
