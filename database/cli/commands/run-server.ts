import { execSync } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';

export async function runServer() {
  console.log('🚀 Starting Rust server in dev mode...');

  // Path to the rustsorter directory (server)
  const serverPath = join(process.cwd(), '..', '..', 'rustsorter');

  if (!existsSync(serverPath)) {
    console.error('❌ Server directory not found at:', serverPath);
    console.error('Make sure you are running this command from the database/cli directory');
    process.exit(1);
  }

  if (!existsSync(join(serverPath, 'Cargo.toml'))) {
    console.error('❌ Cargo.toml not found in server directory');
    process.exit(1);
  }

  try {
    console.log('📂 Changing to server directory:', serverPath);
    process.chdir(serverPath);

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