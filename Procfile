# Sorter Development Environment
# Start with: overmind start --can-die zookeeper,conductor,supervisor
# Connect to process: overmind connect <process-name>
# Kill all: overmind kill

# Core Infrastructure  
postgres: sorter-db run-postgres
zookeeper: cd rama-1.1.0 && ./rama devZookeeper || echo "ZooKeeper failed to start - continuing without it"
conductor: sleep 5 && cd rama-1.1.0 && ./rama conductor || echo "Conductor failed to start - continuing without it"
supervisor: sleep 10 && cd rama-1.1.0 && ./rama supervisor || echo "Supervisor failed to start - continuing without it"

# Application Services  
migrate: sleep 15 && sorter-db migrate && sleep infinity
rust-server: sleep 20 && cd rustsorter && cargo run
vite: sleep 25 && cd frontsorter && npm run dev
