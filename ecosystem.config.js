/**
 * PM2 Ecosystem Configuration for Sorter (Simplified)
 * 
 * This file replaces the `sorter-db` CLI for local development.
 * It manages the PostgreSQL database, Rust backend, and React frontend.
 * 
 * --- ONE-TIME SETUP ---
 * 1. Install prerequisites: Docker, Rust (nightly), Node.js, PM2 (`npm i -g pm2`), and dbmate.
 *    (On macOS: `brew install dbmate`. On Linux, follow dbmate docs.)
 * 2. Create a `.env` file in the project root with the following line. This is for `dbmate` to use.
 *    DATABASE_URL=postgres://postgres:password@localhost:5438/postgres?sslmode=disable
 * 3. Start the database ONLY: `pm2 start ecosystem.config.js --only database`
 * 4. Wait ~10 seconds for it to initialize.
 * 5. Run migrations: `dbmate --migrations-dir ./db/migrations up`
 * 
 * --- DAILY USAGE ---
 * - Start all services: `pm2 start`
 * - Stop all services: `pm2 stop all`
 * - View logs: `pm2 logs`
 * - Restart the backend: `pm2 restart backend`
 */

// --- Configuration Variables ---
const POSTGRES_PORT = 5438;
const POSTGRES_USER = 'postgres';
const POSTGRES_PASSWORD = 'password';
const POSTGRES_DB = 'postgres';
const DATABASE_URL = `postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${POSTGRES_PORT}/${POSTGRES_DB}?sslmode=disable`;

module.exports = {
  apps: [
    {
      // --- 1. PostgreSQL Database via Docker ---
      // Runs a PostgreSQL 14.1 container, persisting data in the `pgdata/` directory.
      name: 'database',
      script: 'docker',
      args: [
        'run', '--rm', '--name', 'postgres-dev',
        '--volume', `${process.cwd()}/pgdata:/var/lib/postgresql/data`,
        '--volume', `${process.cwd()}/database/pg_hba.conf:/etc/postgresql/pg_hba.conf`,
        '--volume', `${process.cwd()}/database/postgresql.conf:/etc/postgresql/postgresql.conf`,
        '-e', `POSTGRES_PASSWORD=${POSTGRES_PASSWORD}`,
        '-e', `POSTGRES_USER=${POSTGRES_USER}`,
        '-e', `POSTGRES_DB=${POSTGRES_DB}`,
        '-p', `${POSTGRES_PORT}:5432`,
        'postgres:14.1',
        'postgres',
        '-c', 'config_file=/etc/postgresql/postgresql.conf',
        '-c', 'hba_file=/etc/postgresql/pg_hba.conf'
      ],
      watch: false,
    },
    {
      name: 'migrations',
      script: 'dbmate',
      args: ['--migrations-dir', './db/migrations', 'up'],
      cwd: './database',
      env: {
        "DATABASE_URL": DATABASE_URL,
      },
    },
    {
      // --- 2. Rust Backend API Server ---
      // Runs the Axum server. The DATABASE_URL is injected directly by PM2,
      // solving the startup race condition and removing the need for `dotenv` on launch.
      name: 'backend',
      script: 'cargo',
      args: 'run',
      cwd: './rustsorter',
      watch: ['./rustsorter/src'],
      ignore_watch: ['./rustsorter/target'],
      // **SOLUTION**: Inject the environment variable directly into the process.
      env: {
        "RUST_LOG": "debug",
        "RUST_BACKTRACE": "1",
        "DATABASE_URL": DATABASE_URL,
      },
    },
    {
      // --- 3. React Frontend Development Server ---
      // Runs the Vite development server for the UI.
      name: 'frontend',
      script: 'npm',
      args: 'run dev',
      cwd: './frontsorter',
      // Vite handles its own file watching and Hot Module Replacement (HMR).
      watch: false,
    }
  ]
};