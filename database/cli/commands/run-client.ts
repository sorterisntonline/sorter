import { execSync } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';

export async function runClient() {
  console.log('🚀 Starting React client in dev mode...');

  // Path to the frontsorter directory (client)
  const clientPath = join(process.cwd(), '..', '..', 'frontsorter');

  if (!existsSync(clientPath)) {
    console.error('❌ Client directory not found at:', clientPath);
    console.error('Make sure you are running this command from the database/cli directory');
    process.exit(1);
  }

  if (!existsSync(join(clientPath, 'package.json'))) {
    console.error('❌ package.json not found in client directory');
    process.exit(1);
  }

  try {
    console.log('📂 Changing to client directory:', clientPath);
    process.chdir(clientPath);

    console.log('🔨 Running npm run dev...');

    // Run npm run dev
    execSync('npm run dev', {
      stdio: 'inherit'
    });

  } catch (error: any) {
    console.error('❌ Failed to start client:', error.message);
    process.exit(1);
  }
}