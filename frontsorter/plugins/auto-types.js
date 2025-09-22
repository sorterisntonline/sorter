import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8081';
const CHECK_INTERVAL = 5000; // Check every 5 seconds

export function autoTypesPlugin() {
  let isGenerating = false;
  let lastSpecHash = '';

  const generateTypes = async () => {
    if (isGenerating) return;

    try {
      isGenerating = true;
      console.log('🔄 Auto-generating types from backend...');

      // Fetch current spec
      const response = await fetch(`${BACKEND_URL}/api.json`);
      if (!response.ok) {
        console.log('⏸️  Backend not available, skipping type generation');
        return;
      }

      const spec = await response.text();
      const specHash = hashCode(spec);

      // Only regenerate if spec changed
      if (specHash === lastSpecHash) {
        return;
      }

      lastSpecHash = specHash;
      console.log('🆕 Backend schema changed, regenerating types...');

      // Run our generation script
      execSync('npm run generate-types', { stdio: 'inherit' });
      console.log('✅ Types auto-generated successfully!');

    } catch (error) {
      console.warn('⚠️  Auto-type generation failed:', error.message);
    } finally {
      isGenerating = false;
    }
  };

  const hashCode = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  };

  return {
    name: 'auto-types',
    configureServer(server) {
      // Generate types on server start
      generateTypes();

      // Set up periodic checking for backend changes
      const interval = setInterval(generateTypes, CHECK_INTERVAL);

      // Cleanup on server close
      server.httpServer?.on('close', () => {
        clearInterval(interval);
      });

      // Also generate when files are added/removed from backend
      server.watcher.add(join(process.cwd(), '../rustsorter/src/**/*.rs'));
      server.watcher.on('change', (file) => {
        if (file.includes('rustsorter/src') && file.endsWith('.rs')) {
          console.log('🦀 Rust backend changed, regenerating types...');
          setTimeout(generateTypes, 2000); // Delay to allow backend restart
        }
      });
    },

    handleHotUpdate(ctx) {
      // Regenerate types if generated files are deleted
      if (ctx.file.includes('src/generated/')) {
        setTimeout(generateTypes, 1000);
      }
    }
  };
}

export default autoTypesPlugin;