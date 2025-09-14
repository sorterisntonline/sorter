#!/usr/bin/env bun

import { Command } from 'commander';
import { runPostgres } from './commands/run-postgres';
import { migrate } from './commands/migrate';
import { setup } from './commands/setup';
import { resetMigrations } from './commands/reset-migrations';

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

program.parse();
