#!/usr/bin/env bun

import pm2 from 'pm2';
import { promisify } from 'util';

const pm2Start = promisify(pm2.start.bind(pm2));
const pm2Connect = promisify(pm2.connect.bind(pm2));
const pm2Delete = promisify(pm2.delete.bind(pm2));

interface ProcessConfig {
  name: string;
  script?: string;
  cwd?: string;
  env?: Record<string, string>;
  args?: string[];
  interpreter?: string;
  delay?: number;
}

// Group processes by dependency level for parallel startup
const processGroups = [
  // Level 0: Independent processes that can start immediately
  [
    {
      name: 'postgres',
      script: 'sorter-db',
      args: ['run-postgres'],
      interpreter: 'none'
    }
  ],
  // Level 1: Wait 3s for postgres, then start rama services in parallel
  [
    {
      name: 'zookeeper',
      script: './rama',
      args: ['devZookeeper'],
      cwd: '/home/tommy/programming/sorter/rama-1.1.0',
      interpreter: 'python3'
    },
    {
      name: 'conductor',
      script: './rama',
      args: ['conductor'],
      cwd: '/home/tommy/programming/sorter/rama-1.1.0',
      interpreter: 'python3'
    },
    {
      name: 'supervisor',
      script: './rama',
      args: ['supervisor'], 
      cwd: '/home/tommy/programming/sorter/rama-1.1.0',
      interpreter: 'python3'
    }
  ],
  // Level 2: Wait 5s more, then migrate and start servers in parallel
  [
    {
      name: 'migrate',
      script: 'sorter-db',
      args: ['migrate'],
      interpreter: 'none'
    },
    {
      name: 'rust-server',
      script: 'cargo',
      args: ['run'],
      cwd: '/home/tommy/programming/sorter/rustsorter'
    },
    {
      name: 'vite',
      script: 'npm',
      args: ['run', 'dev'],
      cwd: '/home/tommy/programming/sorter/frontsorter'
    }
  ]
];

async function startProcess(config: ProcessConfig) {
  console.log(`🚀 Starting ${config.name}...`);
  
  try {
    await pm2Start({
      name: config.name,
      script: config.script || '',
      args: config.args || [],
      cwd: config.cwd || process.cwd(),
      env: { ...process.env, ...config.env },
      interpreter: config.interpreter || 'node',
      autorestart: false,  // Don't auto-restart failed processes
      watch: false,
      max_memory_restart: '1G'
    });
    console.log(`✅ ${config.name} started successfully`);
  } catch (error) {
    console.error(`❌ Failed to start ${config.name}:`, error);
    throw error; // Re-throw so Promise.all can catch it
  }
}

export async function startAll() {
  console.log('🎯 Starting all Sorter services with pm2...\n');
  
  try {
    // Connect to pm2 daemon
    await pm2Connect();
    console.log('📡 Connected to pm2 daemon');
    
    // Clean up any existing processes
    for (const group of processGroups) {
      for (const config of group) {
        try {
          await pm2Delete(config.name);
          console.log(`🧹 Cleaned up existing ${config.name} process`);
        } catch {
          // Process didn't exist, that's fine
        }
      }
    }
    
    console.log('\n🚀 Starting processes in parallel groups...\n');
    
    // Start processes in groups with delays between groups
    const groupDelays = [0, 3000, 5000]; // 0s, 3s, 8s total
    
    for (let i = 0; i < processGroups.length; i++) {
      const group = processGroups[i];
      const delay = groupDelays[i];
      
      if (delay > 0) {
        console.log(`⏳ Waiting ${delay}ms before starting group ${i + 1}...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      console.log(`🚀 Starting group ${i + 1} (${group.map(p => p.name).join(', ')})...`);
      
      // Start all processes in this group in parallel
      const promises = group.map(config => startProcess(config));
      try {
        await Promise.allSettled(promises); // Use allSettled to continue even if some fail
      } catch (error) {
        console.error(`❌ Some processes in group ${i + 1} failed to start`);
      }
    }
    
    console.log('\n✅ All processes started!');
    console.log('📋 Use "pm2 status" to check process status');
    console.log('📋 Use "pm2 logs --nostream" to view logs');
    
    // Don't show logs by default, just return
    return;
    
  } catch (error) {
    console.error('❌ Failed to start services:', error);
    process.exit(1);
  }
}
