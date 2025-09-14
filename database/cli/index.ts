#!/usr/bin/env bun

import { Command } from 'commander';
import { importDump } from './commands/import-dump.js';
import { runPostgres } from './commands/run-postgres.js';
import { setupDocker } from './commands/setup-docker.js';
import { migrate } from './commands/migrate.js';
import { setup } from './commands/setup.js';

const program = new Command();

program
  .name('sorter-db')
  .description('CLI for managing Sorter database operations')
  .version('1.0.0');

program
  .command('import-dump')
  .description('Import data from a PostgreSQL dump file into the running postgres-dev container')
  .argument('<dump-file>', 'Path to the PostgreSQL dump file (.sql or .dump)')
  .action(importDump);

program
  .command('run-postgres')
  .description('Start the PostgreSQL container in foreground')
  .option('--reset', 'Reset the database by deleting all data')
  .action(runPostgres);

program
  .command('setup-docker')
  .description('Setup Docker for the current user (Ubuntu/Debian)')
  .action(setupDocker);

program
  .command('migrate')
  .description('Run database migrations using dbmate')
  .action(migrate);

program
  .command('setup')
  .description('Setup sorter-db-cli environment and check dependencies')
  .action(setup);

program.parse();
