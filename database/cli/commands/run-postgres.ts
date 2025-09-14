import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import * as readline from 'readline';
import { paths } from '../utils/paths.js';

const HOST_PORT = 5432;
const CONTAINER_NAME = 'postgres-dev';
const DOCKER_REPO = 'postgres';
const TAG = '14.1';

export async function runPostgres(options: { reset?: boolean }) {
  const PG_DATA_DIR = paths.pgDataDir;

  // Validate configuration before starting
  console.log('🔍 Validating PostgreSQL configuration...');
  try {
    const { validateConfig } = await import('./validate-config.js');
    await validateConfig();
  } catch (error) {
    console.log('⚠️  Configuration validation failed, but continuing...');
  }

  // Handle reset flag
  if (options.reset) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const response = await new Promise<string>((resolve) => {
      rl.question('Are you sure you want to permanently delete all local database data? [y/N] ', resolve);
    });
    rl.close();

    if (response.match(/^[Yy]$/)) {
      console.log('Stopping and removing existing container if it exists...');
      try {
        execSync(`docker stop ${CONTAINER_NAME}`, { stdio: 'pipe' });
      } catch {}
      try {
        execSync(`docker rm ${CONTAINER_NAME}`, { stdio: 'pipe' });
      } catch {}

      console.log(`Deleting database data directory: ${PG_DATA_DIR}`);
      try {
        execSync(`rm -rf "${PG_DATA_DIR}"`, { stdio: 'pipe' });
        console.log('Removed data directory without sudo.');
      } catch {
        console.log('Elevated permissions required to remove data directory.');
        execSync(`sudo rm -rf "${PG_DATA_DIR}"`, { stdio: 'inherit' });
      }
      console.log('Database has been reset. You can now start it normally.');
    } else {
      console.log('Reset cancelled.');
    }
    return;
  }

  // Stop and remove any previous container with the same name to avoid conflicts
  try {
    execSync(`docker ps -a | grep -q ${CONTAINER_NAME}`, { stdio: 'pipe' });
    console.log('Stopping and removing existing container...');
    try {
      execSync(`docker stop ${CONTAINER_NAME}`, { stdio: 'pipe' });
    } catch {}
    try {
      execSync(`docker rm ${CONTAINER_NAME}`, { stdio: 'pipe' });
    } catch {}
  } catch {
    // Container doesn't exist, which is fine
  }

  console.log('Starting PostgreSQL container in foreground...');
  console.log('PostgreSQL logs will be shown below. Press Ctrl-C to stop.');

  // Create the data directory if it doesn't exist
  mkdirSync(PG_DATA_DIR, { recursive: true });

  // Construct local DB URL (for writing repo-root .env)
  const DB_URL = `postgres://postgres:password@localhost:${HOST_PORT}/postgres?sslmode=disable`;

  // Also write DATABASE_URL to repo-root .env for migrate.sh convenience
  const ENV_FILE = paths.envFile;
  mkdirSync(paths.projectRoot, { recursive: true });
  
  let envContent = '';
  if (existsSync(ENV_FILE)) {
    envContent = readFileSync(ENV_FILE, 'utf-8');
  }

  if (!envContent.includes('DATABASE_URL=')) {
    envContent += `DATABASE_URL=${DB_URL}\n`;
    writeFileSync(ENV_FILE, envContent);
  }

  if (envContent.includes('DATABASE_URL=')) {
    console.log(`Local DATABASE_URL present in ${ENV_FILE}`);
  } else {
    console.log(`Set local DATABASE_URL in ${ENV_FILE}`);
  }

  // Start the Docker container
  const dockerArgs = [
    'run', '--rm', '--name', CONTAINER_NAME,
    '--volume', `${PG_DATA_DIR}:/var/lib/postgresql/data`,
    '--volume', `${paths.pgHbaConf}:/etc/postgresql/pg_hba.conf`,
    '--volume', `${paths.postgresqlConf}:/etc/postgresql/postgresql.conf`,
    '-e', 'POSTGRES_PASSWORD=password',
    '-e', 'POSTGRES_USER=postgres',
    '-e', 'PGDATA=/var/lib/postgresql/data',
    '-p', `${HOST_PORT}:5432`,
    `${DOCKER_REPO}:${TAG}`,
    'postgres',
    '-c', 'config_file=/etc/postgresql/postgresql.conf',
    '-c', 'hba_file=/etc/postgresql/pg_hba.conf'
  ];

  const dockerProcess = spawn('docker', dockerArgs, {
    stdio: 'inherit',
    cwd: paths.projectRoot
  });

  // Handle process termination
  process.on('SIGINT', () => {
    console.log('\nStopping PostgreSQL container...');
    dockerProcess.kill('SIGTERM');
  });

  dockerProcess.on('close', (code) => {
    console.log('\nPostgreSQL container stopped.');
    process.exit(code || 0);
  });

  dockerProcess.on('error', (error) => {
    console.error('Error starting Docker container:', error);
    process.exit(1);
  });
}
