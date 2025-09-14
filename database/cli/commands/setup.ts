import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

export async function setup() {
  console.log('🚀 Setting up sorter-db-cli environment...\n');

  // Check if we're in a sorter project
  const projectRoot = join(process.cwd(), '..', '..');
  const hasDatabaseDir = existsSync(join(projectRoot, 'database'));
  const hasDbMigrations = existsSync(join(projectRoot, 'db', 'migrations'));

  if (!hasDatabaseDir || !hasDbMigrations) {
    console.log('⚠️  This doesn\'t appear to be a sorter project directory.');
    console.log('   Make sure you\'re running this from the database/cli directory');
    console.log('   or from a sorter project root.\n');
  }

  // Check dependencies
  console.log('🔍 Checking dependencies...');
  try {
    execSync('node scripts/check-deps.js', { stdio: 'inherit' });
  } catch (error) {
    console.log('\n❌ Dependency check failed. Please install missing dependencies.');
    return;
  }

  // Create .env file if it doesn't exist
  const envFile = join(projectRoot, '.env');
  if (!existsSync(envFile)) {
    console.log('\n📝 Creating .env file...');
    const envContent = `# Database configuration
DATABASE_URL=postgres://postgres:password@localhost:5432/postgres?sslmode=disable

# Add other environment variables here
`;
    require('fs').writeFileSync(envFile, envContent);
    console.log('✅ Created .env file with default DATABASE_URL');
  } else {
    console.log('✅ .env file already exists');
  }

  // Check if Docker container is running
  console.log('\n🐳 Checking Docker container...');
  try {
    execSync('docker ps | grep -q postgres-dev', { stdio: 'pipe' });
    console.log('✅ PostgreSQL container is running');
  } catch {
    console.log('⚠️  PostgreSQL container is not running');
    console.log('   Run: sorter-db run-postgres');
  }

  console.log('\n🎉 Setup complete!');
  console.log('\n📖 Next steps:');
  console.log('   1. Start PostgreSQL: sorter-db run-postgres');
  console.log('   2. Run migrations: sorter-db migrate');
  console.log('   3. Import data: sorter-db import-dump <file>');
}
