#!/usr/bin/env bun

import { execSync } from 'child_process';

console.log('🔍 Checking sorter-db-cli dependencies...\n');

const dependencies = [
  {
    name: 'Bun',
    command: 'bun --version',
    required: true,
    installGuide: 'https://bun.sh/docs/installation'
  },
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

dependencies.forEach(dep => {
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

console.log('\n' + '='.repeat(50));

if (allRequired) {
  console.log('🎉 All required dependencies are installed!');
  console.log('🚀 You can now use sorter-db-cli');
} else {
  console.log('❌ Some required dependencies are missing.');
  console.log('📦 Run "npm run install-deps" to install them automatically');
}

console.log('\n📖 Quick start:');
console.log('   sorter-db --help');
console.log('   sorter-db run-postgres');
console.log('   sorter-db migrate');
