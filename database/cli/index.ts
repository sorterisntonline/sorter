#!/usr/bin/env bun

import { Command } from 'commander';
import { runPostgres } from './commands/run-postgres';
import { migrate } from './commands/migrate';
import { setup } from './commands/setup';
import { resetMigrations } from './commands/reset-migrations';
import { checkDeps } from './commands/check-deps';
import { installDeps } from './commands/install-deps';
import { runServer } from './commands/run-server';
import { runClient } from './commands/run-client';
import { startAll } from './commands/start-all';
import { stopAll } from './commands/stop-all';
import { showLogs } from './commands/logs';
import { showStatus } from './commands/status';

const program = new Command();

program
  .name('sorter-db')
  .description('CLI for managing Sorter database operations')
  .version('1.0.0');

program
  .command('run-postgres')
  .description('Start the PostgreSQL container in foreground')
  .option('--reset', 'Reset the database by deleting all data')
  .action(runPostgres);

program
  .command('migrate')
  .description('Run database migrations using dbmate')
  .action(migrate);

program
  .command('reset-migrations')
  .description('Reset migration state and drop schema_migrations table')
  .action(resetMigrations);

program
  .command('setup')
  .description('Setup sorter-db-cli environment and check dependencies')
  .action(setup);

program
  .command('check-deps')
  .description('Check if all required dependencies are installed')
  .action(checkDeps);

program
  .command('install-deps')
  .description('Install missing dependencies automatically')
  .action(installDeps);

program
  .command('run-server')
  .description('Start the Rust server in dev mode')
  .action(runServer);

program
  .command('run-client')
  .description('Start the React client in dev mode')
  .action(runClient);

program
  .command('start-all')
  .description('Start all services using pm2')
  .action(startAll);

program
  .command('stop-all')
  .description('Stop all pm2 services')
  .action(stopAll);

program
  .command('logs')
  .description('Show logs for processes')
  .argument('[process-name]', 'Name of process to show logs for (optional)')
  .action(showLogs);

program
  .command('status')
  .description('Show status of all processes')
  .action(showStatus);

program.parse();
