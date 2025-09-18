/**
 * PM2 Ecosystem Configuration for Sorter Development Environment
 * 
 * Prerequisites:
 * 1. Install PM2: `npm install -g pm2`
 * 2. Install core dependencies (Docker, Rust, Node.js). Use the CLI for this:
 *    - `cd database/cli && npm install -g .`
 *    - `sorter-db install-deps`
 * 3. Run initial database setup ONE TIME:
 *    - Start the database: `pm2 start ecosystem.config.js --only database`
 *    - Wait a few seconds for it to initialize.
 *    - Run migrations: `sorter-db migrate`
 *    - Stop the database: `pm2 stop database`
 * 
 * Usage:
 * - Start all services: `pm2 start`
 * - Stop all services: `pm2 stop all`
 * - View logs for all services: `pm2 logs`
 * - View logs for a specific service: `pm2 logs backend`
 * - Restart a service: `pm2 restart frontend`
 * - Delete all services from PM2 list: `pm2 delete all`
 */
module.exports = {
  apps: [
    {
      // --- 1. PostgreSQL Database via Docker ---
      // This replicates the logic from `database/cli/commands/run-postgres.ts`.
      // It uses Docker to run a PostgreSQL 14.1 container, persisting data in the `pgdata/` directory.
      name: 'database',
      script: 'docker',
      args: [
        'run', '--rm', '--name', 'postgres-dev',
        '--volume', `${process.cwd()}/pgdata:/var/lib/postgresql/data`,
        '--volume', `${process.cwd()}/database/pg_hba.conf:/etc/postgresql/pg_hba.conf`,
        '--volume', `${process.cwd()}/database/postgresql.conf:/etc/postgresql/postgresql.conf`,
        '-e', 'POSTGRES_PASSWORD=password',
        '-e', 'POSTGRES_USER=postgres',
        '-e', 'PGDATA=/var/lib/postgresql/data',
        '-p', '5438:5432', // Using port 5438 as defined in the CLI tool
        'postgres:14.1',
        'postgres',
        '-c', 'config_file=/etc/postgresql/postgresql.conf',
        '-c', 'hba_file=/etc/postgresql/pg_hba.conf'
      ],
      watch: false,
      restart_delay: 5000, // Wait 5s before restarting if it fails
    },
    {
      // --- 2. Rust Backend API Server ---
      // This replicates `database/cli/commands/run-server.ts`.
      // It runs the Axum server using `cargo run` with debug logging enabled.
      name: 'backend',
      script: 'cargo',
      args: 'run',
      cwd: './rustsorter',
      // We watch only the `src` directory. `cargo run` handles recompilation.
      watch: ['./rustsorter/src'],
      ignore_watch: ['./rustsorter/target'],
      env: {
        "RUST_LOG": "debug",
        "RUST_BACKTRACE": "1",
        // The DATABASE_URL is read from the root .env file, which is created
        // and managed by the `sorter-db run-postgres` command. Ensure that
        // command has been run at least once to generate the .env file.
      },
    },
    {
      // --- 3. React Frontend Development Server ---
      // This replicates `database/cli/commands/run-client.ts`.
      // It runs the Vite development server, which provides Hot Module Replacement (HMR).
      name: 'frontend',
      script: 'npm',
      args: 'run dev',
      cwd: './frontsorter',
      // Vite handles its own file watching and HMR, so PM2 watch is disabled.
      watch: false,
    },
    {
      // --- 4. Electric ClojureScript Service (Experimental) ---
      // This service is included from your original `ecosystem.config.js`.
      // It runs the Shadow CLJS watcher for the Electric app.
      name: 'electric',
      script: 'npx',
      args: 'shadow-cljs watch app',
      cwd: './electric',
      // Shadow CLJS handles its own file watching.
      watch: false,
    }
  ]
};
