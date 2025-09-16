import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { config } from 'dotenv';
import { paths } from '../utils/paths.js';

export async function migrate() {
  console.log('Running database migrations...');

  // Load env from .env and rely on the DATABASE_URL written by run-postgres
  config({ path: paths.envFile });
  
  if (!process.env.DATABASE_URL) {
    console.error('Error: DATABASE_URL must be set');
    console.error('Please set DATABASE_URL in your environment or .env file');
    process.exit(1);
  }
  
  const finalDatabaseUrl = process.env.DATABASE_URL;

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
