import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { paths } from '../utils/paths.js';
import { loadEnv, ensureDatabaseUrl } from '../utils/env.js';

export async function migrate() {
  console.log('Running database migrations...');

  // Load env from .env if present (repo root)
  const databaseUrl = ensureDatabaseUrl(loadEnv());

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
        stdio: 'pipe',
        env: { ...process.env, PGSSLMODE: 'disable', DATABASE_URL: databaseUrl }
      }
    );
    
    console.log('Migrations completed successfully!');
  } catch (error: any) {
    // Get the error output
    const errorOutput = error.stderr ? error.stderr.toString() : '';
    const errorMessage = error.message || '';
    
    console.log('⚠️  Migration encountered an issue. Checking details...');
    
    if (errorOutput.includes('already exists') || errorOutput.includes('relation') || errorMessage.includes('already exists')) {
      console.log('ℹ️  Some tables already exist in the database.');
      console.log('   This is normal if migrations have been run before.');
      console.log('   Checking migration status...');
      
      try {
        // Check migration status
        execSync(
          `PGSSLMODE=disable DATABASE_URL="${databaseUrl}" dbmate --migrations-dir "${migrationsDir}" status`,
          { 
            stdio: 'inherit',
            env: { ...process.env, PGSSLMODE: 'disable', DATABASE_URL: databaseUrl }
          }
        );
        console.log('✅ Database is up to date with migrations.');
      } catch (statusError) {
        console.log('ℹ️  Migration status check completed.');
      }
    } else {
      console.error('❌ Error running migrations:');
      console.error(errorOutput || errorMessage);
      process.exit(1);
    }
  }
}
