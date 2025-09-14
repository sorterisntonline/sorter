#!/usr/bin/env bun

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { paths } from '../utils/paths.js';

// Auto-install functions
async function installRust(): Promise<boolean> {
  try {
    console.log('  🔄 Installing Rust toolchain via rustup...');
    
    // Check if rustup is already installed
    try {
      execSync('rustup --version', { stdio: 'pipe' });
    } catch {
      // Install rustup
      console.log('  📥 Downloading and installing rustup...');
      execSync('curl --proto \'=https\' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y', { 
        stdio: 'inherit' 
      });
    }
    
    // Update PATH to include cargo bin
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (homeDir) {
      const cargoBin = join(homeDir, '.cargo', 'bin');
      process.env.PATH = `${cargoBin}:${process.env.PATH}`;
    }
    
    // Install the default toolchain
    execSync('rustup install stable', { stdio: 'inherit' });
    execSync('rustup default stable', { stdio: 'inherit' });
    
    console.log('  ✅ Rust toolchain installed successfully');
    return true;
  } catch (error) {
    console.log(`  ❌ Failed to install Rust: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return false;
  }
}

interface Dependency {
  name: string;
  command: string;
  required: boolean;
  installGuide: string;
  checkCommand?: string;
  autoInstall?: () => Promise<boolean>;
}

interface ProjectDeps {
  name: string;
  path: string;
  type: 'rust' | 'node' | 'bun';
  dependencies: Dependency[];
  installCommand: string;
  checkCommand: string;
}

export async function installAll() {
  console.log('🚀 Installing all project dependencies...\n');

  // Check if we're in a sorter project
  const hasDatabaseDir = existsSync(paths.database);
  const hasRustSorter = existsSync(paths.rustSorter);
  const hasFrontSorter = existsSync(paths.frontSorter);

  if (!hasDatabaseDir || !hasRustSorter || !hasFrontSorter) {
    console.log('⚠️  This doesn\'t appear to be a complete sorter project directory.');
    console.log('   Make sure you\'re running this from the sorter project root.\n');
    return;
  }

  // Define project dependencies
  const projects: ProjectDeps[] = [
    {
      name: 'Rust Backend (rustsorter)',
      path: paths.rustSorter,
      type: 'rust',
      dependencies: [
        {
          name: 'Rust',
          command: 'rustc --version',
          required: true,
          installGuide: 'https://rustup.rs/',
          checkCommand: 'rustc --version',
          autoInstall: installRust
        },
        {
          name: 'Cargo',
          command: 'cargo --version',
          required: true,
          installGuide: 'https://rustup.rs/',
          checkCommand: 'cargo --version',
          autoInstall: installRust
        }
      ],
      installCommand: 'cargo build',
      checkCommand: 'cargo check'
    },
    {
      name: 'Frontend (frontsorter)',
      path: paths.frontSorter,
      type: 'node',
      dependencies: [
        {
          name: 'Node.js',
          command: 'node --version',
          required: true,
          installGuide: 'https://nodejs.org/'
        },
        {
          name: 'npm',
          command: 'npm --version',
          required: true,
          installGuide: 'https://nodejs.org/'
        }
      ],
      installCommand: 'npm install',
      checkCommand: 'npm list --depth=0'
    },
    {
      name: 'Database CLI',
      path: paths.cli,
      type: 'bun',
      dependencies: [
        {
          name: 'Bun',
          command: 'bun --version',
          required: true,
          installGuide: 'https://bun.sh/docs/installation'
        }
      ],
      installCommand: 'bun install',
      checkCommand: 'bun install --dry-run'
    }
  ];

  // Global dependencies
  const globalDeps: Dependency[] = [
    {
      name: 'Docker',
      command: 'docker --version',
      required: true,
      installGuide: 'https://docs.docker.com/get-docker/'
    },
    {
      name: 'dbmate',
      command: 'dbmate --version',
      required: false,
      installGuide: 'https://github.com/amacneil/dbmate#installation'
    }
  ];

  let allRequired = true;

  // Check global dependencies
  console.log('🌍 Checking global dependencies...');
  globalDeps.forEach(dep => {
    try {
      const version = execSync(dep.command, { encoding: 'utf8' }).trim();
      console.log(`✅ ${dep.name}: ${version}`);
    } catch (error) {
      if (dep.required) {
        console.log(`❌ ${dep.name}: Not installed (REQUIRED)`);
        console.log(`   Install: ${dep.installGuide}`);
        allRequired = false;
      } else {
        console.log(`⚠️  ${dep.name}: Not installed (optional)`);
        console.log(`   Install: ${dep.installGuide}`);
      }
    }
  });

  console.log('\n' + '='.repeat(60));

  // Check and install project dependencies
  for (const project of projects) {
    console.log(`\n📦 Checking ${project.name}...`);
    
    // Check if project directory exists
    if (!existsSync(project.path)) {
      console.log(`❌ Project directory not found: ${project.path}`);
      allRequired = false;
      continue;
    }

    // Check project-specific dependencies
    let projectReady = true;
    for (const dep of project.dependencies) {
      try {
        const version = execSync(dep.command, { encoding: 'utf8' }).trim();
        console.log(`  ✅ ${dep.name}: ${version}`);
      } catch (error) {
        if (dep.autoInstall) {
          console.log(`  ❌ ${dep.name}: Not installed (REQUIRED)`);
          console.log(`  🔄 Attempting auto-install...`);
          
          try {
            const installSuccess = await dep.autoInstall();
            if (installSuccess) {
              // Verify installation using rustup to find the correct path
              try {
                let version;
                if (dep.command.includes('rustc')) {
                  const rustcPath = execSync('rustup which rustc', { encoding: 'utf8' }).trim();
                  version = execSync(`${rustcPath} --version`, { encoding: 'utf8' }).trim();
                } else if (dep.command.includes('cargo')) {
                  const cargoPath = execSync('rustup which cargo', { encoding: 'utf8' }).trim();
                  version = execSync(`${cargoPath} --version`, { encoding: 'utf8' }).trim();
                } else {
                  version = execSync(dep.command, { encoding: 'utf8' }).trim();
                }
                console.log(`  ✅ ${dep.name}: ${version} (auto-installed)`);
              } catch (verifyError) {
                console.log(`  ❌ ${dep.name}: Auto-install completed but verification failed`);
                projectReady = false;
                allRequired = false;
              }
            } else {
              console.log(`  ❌ ${dep.name}: Auto-install failed`);
              console.log(`     Manual install: ${dep.installGuide}`);
              projectReady = false;
              allRequired = false;
            }
          } catch (autoInstallError) {
            console.log(`  ❌ ${dep.name}: Auto-install failed`);
            console.log(`     Manual install: ${dep.installGuide}`);
            projectReady = false;
            allRequired = false;
          }
        } else {
          console.log(`  ❌ ${dep.name}: Not installed (REQUIRED)`);
          console.log(`     Install: ${dep.installGuide}`);
          projectReady = false;
          allRequired = false;
        }
      }
    }

    if (!projectReady) {
      console.log(`  ⚠️  Skipping ${project.name} due to missing dependencies`);
      continue;
    }

    // Install project dependencies
    try {
      console.log(`  🔄 Installing dependencies for ${project.name}...`);
      
      if (project.type === 'rust') {
        // For Rust, we just need to check if Cargo.toml exists and run cargo build
        const cargoToml = join(project.path, 'Cargo.toml');
        if (existsSync(cargoToml)) {
          // Get the cargo path from rustup
          const cargoPath = execSync('rustup which cargo', { encoding: 'utf8' }).trim();
          const cargoDir = cargoPath.substring(0, cargoPath.lastIndexOf('/'));
          
          execSync(project.installCommand, { 
            cwd: project.path, 
            stdio: 'pipe',
            env: { ...process.env, PATH: `${cargoDir}:${process.env.PATH}` }
          });
          console.log(`  ✅ ${project.name} dependencies installed successfully`);
        } else {
          console.log(`  ❌ Cargo.toml not found in ${project.path}`);
          allRequired = false;
        }
      } else if (project.type === 'node') {
        // For Node.js projects, check if package.json exists and run npm install
        const packageJson = join(project.path, 'package.json');
        if (existsSync(packageJson)) {
          execSync(project.installCommand, { 
            cwd: project.path, 
            stdio: 'pipe' 
          });
          console.log(`  ✅ ${project.name} dependencies installed successfully`);
        } else {
          console.log(`  ❌ package.json not found in ${project.path}`);
          allRequired = false;
        }
      } else if (project.type === 'bun') {
        // For Bun projects, check if package.json exists and run bun install
        const packageJson = join(project.path, 'package.json');
        if (existsSync(packageJson)) {
          execSync(project.installCommand, { 
            cwd: project.path, 
            stdio: 'pipe' 
          });
          console.log(`  ✅ ${project.name} dependencies installed successfully`);
        } else {
          console.log(`  ❌ package.json not found in ${project.path}`);
          allRequired = false;
        }
      }
    } catch (error) {
      console.log(`  ❌ Failed to install dependencies for ${project.name}`);
      console.log(`     Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      allRequired = false;
    }
  }

  console.log('\n' + '='.repeat(60));

  if (allRequired) {
    console.log('🎉 All project dependencies are installed and ready!');
    console.log('\n📖 Next steps:');
    console.log('   1. Start PostgreSQL: sorter-db run-postgres');
    console.log('   2. Run migrations: sorter-db migrate');
    console.log('   3. Start Rust backend: cd rustsorter && cargo run');
    console.log('   4. Start frontend: cd frontsorter && npm run dev');
  } else {
    console.log('❌ Some dependencies are missing or failed to install.');
    console.log('📦 Please install the missing dependencies and try again.');
  }
}
