import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

// Get the directory where the CLI is located (not the current working directory)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI_DIR = dirname(__dirname); // Go up one level from utils/ to cli/

// Function to find project root by looking for database/ and db/migrations/ directories
function findProjectRoot(): string {
  // Start from current working directory and walk up
  let currentDir = process.cwd();
  
  while (currentDir !== dirname(currentDir)) {
    const databaseDir = join(currentDir, 'database');
    const migrationsDir = join(currentDir, 'db', 'migrations');
    
    if (existsSync(databaseDir) && existsSync(migrationsDir)) {
      return currentDir;
    }
    
    currentDir = dirname(currentDir);
  }
  
  // Fallback: assume CLI is in a sorter project structure
  const DATABASE_DIR = join(CLI_DIR, '..'); // Go up one level from cli/ to database/
  const PROJECT_ROOT = join(DATABASE_DIR, '..'); // Go up one level from database/ to project root
  return PROJECT_ROOT;
}

const PROJECT_ROOT = findProjectRoot();
const DATABASE_DIR = join(PROJECT_ROOT, 'database');

export const paths = {
  // CLI directory
  cli: CLI_DIR,
  
  // Database directory (where config files are)
  database: DATABASE_DIR,
  
  // Project root
  projectRoot: PROJECT_ROOT,
  
  // Config files
  postgresqlConf: join(DATABASE_DIR, 'postgresql.conf'),
  pgHbaConf: join(DATABASE_DIR, 'pg_hba.conf'),
  
  // Data directory
  pgDataDir: join(PROJECT_ROOT, 'pgdata'),
  
  // Environment file
  envFile: join(PROJECT_ROOT, '.env'),
  
  // Migrations directory
  migrationsDir: join(PROJECT_ROOT, 'db', 'migrations'),
  
  // Project components
  rustSorter: join(PROJECT_ROOT, 'rustsorter'),
  frontSorter: join(PROJECT_ROOT, 'frontsorter'),
} as const;
