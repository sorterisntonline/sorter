# Sorter Development Environment
# Start with: overmind start
# Connect to process: overmind connect <process-name>
# Kill all: overmind kill

# Core Infrastructure
postgres: sorter-db run-postgres
zookeeper: cd rama-1.1.0 && ./rama devZookeeper
conductor: sleep 5 && cd rama-1.1.0 && ./rama conductor
supervisor: sleep 10 && cd rama-1.1.0 && ./rama supervisor

# Application Services  
migrate: sleep 15 && sorter-db migrate && sleep infinity
api: sleep 20 && RAMA_BASE_URL=http://localhost:9999 RAMA_MODULE_NAME=sorter.playground-module/PlaygroundModule cargo run --manifest-path=rustsorter/Cargo.toml
frontend: sleep 25 && cd frontsorter && npm run dev
