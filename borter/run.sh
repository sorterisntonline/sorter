export ENVIRONMENT=production 
export DATABASE_URL=postgres://postgres:password@localhost:5432/postgres
clj -J-Djdk.attach.allowAttachSelf -A:dev -X user/-main
