# Kill any existing instance
lsof -ti:3000 | xargs kill -9 2>/dev/null || true


export ENVIRONMENT=development 
export AUTO_LOGIN=false # turn off when you need to test without auto login, this script isn't used in production so it's ok
export DATABASE_URL=postgres://postgres:password@localhost:5432/postgres

# Source environment variables from .env file
set -a
source .env
set +a

# Check if port argument is provided and pass it properly to Clojure
if [ $# -eq 1 ]; then
    clj -J-Djdk.attach.allowAttachSelf -A:dev -X prod/-main :port "$1"
else
    clj -J-Djdk.attach.allowAttachSelf -A:dev -X prod/-main
fi
