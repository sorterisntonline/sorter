import { existsSync, readFileSync } from 'fs';
import { paths } from './paths.js';

/**
 * Loads environment variables from the .env file if it exists
 * and returns the DATABASE_URL for convenience
 */
export function loadEnv(): string | undefined {
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

  return databaseUrl;
}

/**
 * Ensures DATABASE_URL is set and exits with error if not
 */
export function ensureDatabaseUrl(databaseUrl: string | undefined): string {
  if (!databaseUrl) {
    console.error('Error: DATABASE_URL must be set');
    console.error('Please set DATABASE_URL in your environment or .env file');
    process.exit(1);
  }
  return databaseUrl;
}
