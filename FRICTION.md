# Friction Log

## Git & Repository Structure
- The branch instructions referenced `git pull -b ...`, but `git pull` does not accept `-b`; needed to fall back to manual `git fetch` + `git checkout`.
- Remote `origin/HEAD` points to `rust-port`, so there is no obvious "main" baseline documented; had to inspect remote branches manually to pick a comparison target.
- The Rama reference repositories (`rama-aws-deploy`, `rama-demo-gallery`, `rama-examples`) are committed as gitlinks without `.gitmodules` entries, so standard `git submodule` commands fail and it's unclear how to initialize or consume them.

## Rama Setup & Documentation  
- Rama integration requires `RAMA_BASE_URL` and `RAMA_MODULE_NAME`, but there is no guidance on where to obtain a running Rama conductor, how to launch the module from [`rama-sorter`](rustsorter/src/rama_client.rs), or what module string to pass, making local setup guesswork.
- The new Clojure project under [`rama-sorter/`](file:///home/tommy/programming/sorter/rama-sorter/project.clj#L1-L9) provides no instructions for dependency installation or test execution, leaving toolchain setup ambiguous (e.g., whether to use Leiningen or another build tool).
- Rama cluster requires Java but no version guidance; had to manually install OpenJDK 21.

## Development Process Orchestration
- **No unified startup process**: Development requires manually coordinating 5+ services (PostgreSQL, Rama zookeeper/conductor/supervisor, Rust API, React frontend) across multiple terminals/screen sessions.
- **Database state conflicts**: `sorter-db migrate` fails with "relation already exists" errors, `sorter-db reset-migrations` fails with "cannot drop currently open database", no clean reset mechanism.
- **Service dependency chain**: Unclear startup order and which services must be running before others can start successfully.
- **Process lifecycle management**: No graceful shutdown coordination, potential for orphaned processes in screen sessions.
- **Docker permission issues**: `sorter-db run-postgres` fails with Docker socket permissions, forcing manual service coordination instead of containerized approach.
