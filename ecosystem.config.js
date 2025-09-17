module.exports = {
  apps: [
    // Database - starts first
    {
      name: 'postgres',
      script: 'sorter-db',
      args: ['run-postgres'],
      interpreter: 'none',
      autorestart: false,
      watch: false,
      max_memory_restart: '1G'
    },
    
    // Rama services - can start in parallel after postgres  
    {
      name: 'zookeeper',
      script: './rama',
      args: ['devZookeeper'],
      cwd: '/home/tommy/programming/sorter/rama-1.1.0',
      autorestart: true,
      restart_delay: 2000,
      watch: false,
      max_memory_restart: '1G'
    },
    {
      name: 'conductor', 
      script: './rama',
      args: ['conductor'],
      cwd: '/home/tommy/programming/sorter/rama-1.1.0',
      interpreter: 'python3',
      autorestart: true,
      restart_delay: 2000,
      watch: false,
      max_memory_restart: '1G'
    },
    {
      name: 'supervisor',
      script: './rama', 
      args: ['supervisor'],
      cwd: '/home/tommy/programming/sorter/rama-1.1.0',
      interpreter: 'python3',
      autorestart: true,
      restart_delay: 2000,
      watch: false,
      max_memory_restart: '1G'
    },
    
    // Application services
    {
      name: 'migrate',
      script: 'sorter-db',
      args: ['migrate'],
      interpreter: 'none',
      autorestart: false,
      watch: false,
      max_memory_restart: '1G'
    },
    {
      name: 'rust-server',
      script: 'sorter-db',
      args: ['run-server'], 
      interpreter: 'none',
      autorestart: false,
      watch: false,
      max_memory_restart: '1G'
    },
    {
      name: 'vite',
      script: 'npm',
      args: ['run', 'dev'],
      cwd: '/home/tommy/programming/sorter/frontsorter',
      autorestart: false,
      watch: false,
      max_memory_restart: '1G'
    }
  ]
};
