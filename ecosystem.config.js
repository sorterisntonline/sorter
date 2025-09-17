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
      script: 'python3',
      args: ['./rama', 'devZookeeper'],
      cwd: '/home/tommy/programming/sorter/rama-1.1.0',
      autorestart: false,
      watch: false,
      max_memory_restart: '1G'
    },
    {
      name: 'conductor', 
      script: 'python3',
      args: ['./rama', 'conductor'],
      cwd: '/home/tommy/programming/sorter/rama-1.1.0',
      autorestart: false,
      watch: false,
      max_memory_restart: '1G'
    },
    {
      name: 'supervisor',
      script: 'python3', 
      args: ['./rama', 'supervisor'],
      cwd: '/home/tommy/programming/sorter/rama-1.1.0',
      autorestart: false,
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
