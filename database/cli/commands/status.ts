#!/usr/bin/env bun

import pm2 from 'pm2';
import { promisify } from 'util';

const pm2Connect = promisify(pm2.connect.bind(pm2));
const pm2List = promisify(pm2.list.bind(pm2));

export async function showStatus() {
  try {
    await pm2Connect();
    
    const processes = await pm2List();
    
    console.log('📊 Process Status:\n');
    console.log('NAME          PID    STATUS    UPTIME    RESTARTS');
    console.log('─'.repeat(50));
    
    if (processes.length === 0) {
      console.log('No processes running');
      return;
    }
    
    processes.forEach((proc: any) => {
      const name = proc.name.padEnd(12);
      const pid = proc.pid ? proc.pid.toString().padEnd(6) : 'N/A'.padEnd(6);
      const status = proc.pm2_env.status.padEnd(9);
      const uptime = proc.pm2_env.pm_uptime ? 
        formatUptime(Date.now() - proc.pm2_env.pm_uptime).padEnd(9) : 
        'N/A'.padEnd(9);
      const restarts = proc.pm2_env.restart_time.toString().padEnd(9);
      
      console.log(`${name} ${pid} ${status} ${uptime} ${restarts}`);
    });
    
  } catch (error) {
    console.error('❌ Failed to get status:', error);
    process.exit(1);
  }
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}
