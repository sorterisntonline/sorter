import { execSync } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';
import { paths } from '../utils/paths.js';
import { loadAppEnv } from '../utils/env.js';

export async function runServer() {
  console.log('🚀 Starting Rust server in dev mode...');

  // Path to the rustsorter directory (server)
  const serverPath = paths.rustSorter;

  if (!existsSync(serverPath)) {
    console.error('❌ Server directory not found at:', serverPath);
    console.error('Make sure the rustsorter directory exists in your project root');
    process.exit(1);
  }

  if (!existsSync(join(serverPath, 'Cargo.toml'))) {
    console.error('❌ Cargo.toml not found in server directory');
    process.exit(1);
  }

  try {
    console.log('📂 Changing to server directory:', serverPath);
    process.chdir(serverPath);

    const env = loadAppEnv();

    // Ensure the Rust process receives validated environment values
    process.env.DATABASE_URL = env.DATABASE_URL;
    process.env.STEAM_API_KEY = env.STEAM_API_KEY;
    process.env.PORT = String(env.PORT);
    process.env.BASE_URL = env.BASE_URL;
    process.env.FRONTEND_URL = env.FRONTEND_URL;
    if (env.STATIC_DIR) {
      process.env.STATIC_DIR = env.STATIC_DIR;
    }

    // Kill any existing rustsorter process
    try {
      execSync('pkill -f "rustsorter"', { stdio: 'pipe' });
      console.log('🔄 Killed existing rustsorter process');
    } catch (error) {
      // Process might not be running, which is fine
    }

    console.log('🔨 Running cargo run with debug logging...');

    // Run cargo run with debug logging
    execSync('RUST_LOG=debug cargo run', {
      stdio: 'inherit',
      env: { ...process.env, RUST_LOG: 'debug' }
    });

  } catch (error: any) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}
