#!/usr/bin/env bun

import pm2 from 'pm2';
import { promisify } from 'util';

const pm2Connect = promisify(pm2.connect.bind(pm2));
const pm2Describe = promisify(pm2.describe.bind(pm2));

export async function showLogs(processName?: string) {
  try {
    await pm2Connect();
    
    if (processName) {
      console.log(`📋 Live logs for ${processName} (Ctrl+C to exit):`);
      console.log('─'.repeat(50));
    } else {
      console.log('📋 Mixed live logs from all processes (Ctrl+C to exit):');
      console.log('─'.repeat(60));
    }
    
    pm2.launchBus((err, bus) => {
      if (err) {
        console.error('Failed to launch pm2 bus:', err);
        return;
      }
      
      bus.on('log:out', (packet) => {
        if (!processName || packet.process.name === processName) {
          console.log(`[${packet.process.name}] ${packet.data}`);
        }
      });
      
      bus.on('log:err', (packet) => {
        if (!processName || packet.process.name === processName) {
          console.error(`[${packet.process.name}] ❌ ${packet.data}`);
        }
      });
      
      // Show process events
      bus.on('process:event', (packet) => {
        if (!processName || packet.process.name === processName) {
          if (packet.event === 'exit') {
            console.log(`[${packet.process.name}] 🚪 Process exited with code ${packet.manually ? '(manual)' : packet.exit_code}`);
          } else if (packet.event === 'restart') {
            console.log(`[${packet.process.name}] 🔄 Process restarted`);
          }
        }
      });
    });
    
    // Keep the process running to show live logs
    process.stdin.resume();
    
  } catch (error) {
    console.error('❌ Failed to show logs:', error);
    process.exit(1);
  }
}
