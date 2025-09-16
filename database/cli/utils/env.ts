import { existsSync, readFileSync, writeFileSync } from 'fs';
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

/**
 * Upserts an environment variable in the project's .env file.
 * Preserves all other lines and comments.
 */
export function upsertEnvVariable(key: string, value: string): void {
  const envFile = paths.envFile;
  let lines: string[] = [];

  if (existsSync(envFile)) {
    const content = readFileSync(envFile, 'utf-8');
    lines = content.split('\n');
  } else {
    lines = [];
  }

  let updated = false;
  const newLine = `${key}=${value}`;
  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      result.push(line);
      continue;
    }

    const [existingKey] = trimmed.split('=');
    if (existingKey === key) {
      result.push(newLine);
      updated = true;
    } else {
      result.push(line);
    }
  }

  if (!updated) {
    if (result.length > 0 && result[result.length - 1].trim() !== '') {
      result.push('');
    }
    result.push(newLine);
  }

  writeFileSync(envFile, result.join('\n'));
}
