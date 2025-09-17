#!/usr/bin/env bun

import pm2 from 'pm2';
import { promisify } from 'util';

const pm2Connect = promisify(pm2.connect.bind(pm2));
const pm2Delete = promisify(pm2.delete.bind(pm2));
const pm2Disconnect = promisify(pm2.disconnect.bind(pm2));

const processNames = [
  'postgres',
  'zookeeper', 
  'conductor',
  'supervisor',
  'migrate',
  'rust-server',
  'vite'
];

export async function stopAll() {
  console.log('🛑 Stopping all Sorter services...\n');
  
  try {
    await pm2Connect();
    console.log('📡 Connected to pm2 daemon');
    
    for (const processName of processNames) {
      try {
        await pm2Delete(processName);
        console.log(`✅ Stopped ${processName}`);
      } catch (error) {
        console.log(`⚠️  ${processName} was not running`);
      }
    }
    
    await pm2Disconnect();
    console.log('\n🎉 All services stopped successfully!');
    
  } catch (error) {
    console.error('❌ Failed to stop services:', error);
    process.exit(1);
  }
}
