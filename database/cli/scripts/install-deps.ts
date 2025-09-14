#!/usr/bin/env bun

import { execSync } from 'child_process';
import { platform } from 'os';

console.log('🚀 Installing sorter-db-cli dependencies...');

const currentPlatform = platform();

async function installDependency(name: string, installCommand: string, checkCommand: string): Promise<boolean> {
  try {
    execSync(checkCommand, { stdio: 'pipe' });
    console.log(`✅ ${name} is already installed`);
    return true;
  } catch (error) {
    console.log(`📦 Installing ${name}...`);
    try {
      execSync(installCommand, { stdio: 'inherit' });
      console.log(`✅ ${name} installed successfully`);
      return true;
    } catch (installError: any) {
      console.log(`❌ Failed to install ${name}: ${installError.message}`);
      return false;
    }
  }
}

async function main() {
  const results: boolean[] = [];

  // Install Bun
  if (currentPlatform === 'darwin') {
    results.push(await installDependency(
      'Bun',
      'curl -fsSL https://bun.sh/install | bash',
      'bun --version'
    ));
  } else if (currentPlatform === 'linux') {
    results.push(await installDependency(
      'Bun',
      'curl -fsSL https://bun.sh/install | bash',
      'bun --version'
    ));
  } else if (currentPlatform === 'win32') {
    results.push(await installDependency(
      'Bun',
      'powershell -c "irm bun.sh/install.ps1 | iex"',
      'bun --version'
    ));
  }

  // Install Docker
  if (currentPlatform === 'darwin') {
    console.log('🐳 For Docker on macOS, please install Docker Desktop:');
    console.log('   https://docs.docker.com/desktop/mac/install/');
  } else if (currentPlatform === 'linux') {
    results.push(await installDependency(
      'Docker',
      'curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh',
      'docker --version'
    ));
  } else if (currentPlatform === 'win32') {
    console.log('🐳 For Docker on Windows, please install Docker Desktop:');
    console.log('   https://docs.docker.com/desktop/windows/install/');
  }

  // Install dbmate
  if (currentPlatform === 'darwin') {
    results.push(await installDependency(
      'dbmate',
      'brew install dbmate',
      'dbmate --version'
    ));
  } else if (currentPlatform === 'linux') {
    results.push(await installDependency(
      'dbmate',
      'curl -fsSL https://github.com/amacneil/dbmate/releases/latest/download/dbmate-linux-amd64 -o /usr/local/bin/dbmate && chmod +x /usr/local/bin/dbmate',
      'dbmate --version'
    ));
  } else if (currentPlatform === 'win32') {
    console.log('📦 For dbmate on Windows, please download from:');
    console.log('   https://github.com/amacneil/dbmate/releases');
  }

  const successCount = results.filter(Boolean).length;
  const totalCount = results.length;

  console.log(`\n📊 Installation Summary: ${successCount}/${totalCount} dependencies installed`);
  
  if (successCount === totalCount) {
    console.log('🎉 All dependencies installed successfully!');
  } else {
    console.log('⚠️  Some dependencies need manual installation. See above for details.');
  }
}

main().catch(console.error);
