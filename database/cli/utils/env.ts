import { existsSync } from 'fs';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';
import { paths } from './paths.js';

const DatabaseUrlSchema = z
  .string()
  .trim()
  .min(1, 'DATABASE_URL must be set')
  .regex(/^postgres:\/\//, 'DATABASE_URL must be a postgres connection string');

const DatabaseEnvSchema = z.object({
  DATABASE_URL: DatabaseUrlSchema,
});

const AppEnvSchema = DatabaseEnvSchema.extend({
  STEAM_API_KEY: z
    .string()
    .trim()
    .min(1, 'STEAM_API_KEY must be set'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8081),
  BASE_URL: z.string().trim().url().optional(),
  FRONTEND_URL: z.string().trim().url().optional(),
  STATIC_DIR: z.string().trim().optional(),
});

const CliRuntimeEnvSchema = z.object({
  DATABASE_PORT: z.coerce.number().int().min(1024).max(65535).default(5438),
});

type DatabaseEnv = z.infer<typeof DatabaseEnvSchema>;
export type AppEnv = DatabaseEnv & {
  STEAM_API_KEY: string;
  PORT: number;
  BASE_URL: string;
  FRONTEND_URL: string;
  STATIC_DIR?: string;
};
export type CliRuntimeEnv = z.infer<typeof CliRuntimeEnvSchema>;

function formatIssues(issues: z.ZodIssue[]): string {
  return issues
    .map((issue) => `- ${issue.path.join('.') || 'value'}: ${issue.message}`)
    .join('\n');
}

function ensureDotenvLoaded() {
  const envFile = paths.envFile;
  if (existsSync(envFile)) {
    loadDotenv({ path: envFile });
  }
}

function parseOrExit<T>(schema: z.ZodSchema<T>, context: string): T {
  ensureDotenvLoaded();
  const result = schema.safeParse(process.env);
  if (!result.success) {
    console.error(`\n❌ Invalid environment variables for ${context}:`);
    console.error(formatIssues(result.error.issues));
    console.error('\nPlease update your .env file or exported environment and try again.');
    process.exit(1);
  }
  return result.data;
}

export function loadDatabaseEnv(): DatabaseEnv {
  return parseOrExit(DatabaseEnvSchema, 'database operations');
}

export function loadAppEnv(): AppEnv {
  const parsed = parseOrExit(AppEnvSchema, 'running the backend server');
  const baseUrl = parsed.BASE_URL ?? `http://localhost:${parsed.PORT}`;
  const frontendUrl = parsed.FRONTEND_URL ?? 'http://localhost:5173';

  return {
    ...parsed,
    BASE_URL: baseUrl,
    FRONTEND_URL: frontendUrl,
  };
}

export function loadCliRuntimeEnv(): CliRuntimeEnv {
  return parseOrExit(CliRuntimeEnvSchema, 'CLI runtime configuration');
}
