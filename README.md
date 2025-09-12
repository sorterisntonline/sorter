# sorter

rust and react based pair-wise staunchly democratic social media application

## project info

### contributors

- `@thmorriss`  
  [![wakatime](https://wakatime.com/badge/user/116b65a9-c932-4d5d-a682-331cd988d6f0/project/e7669bfe-a191-44f0-b3eb-02cdebe8c923.svg)](https://wakatime.com/badge/user/116b65a9-c932-4d5d-a682-331cd988d6f0/project/e7669bfe-a191-44f0-b3eb-02cdebe8c923)
- `@zudsniper`  
  [![wakatime](https://wakatime.com/badge/user/72fdcd5a-a9d0-4016-b00f-3f3d6fb2514a/project/e1e0cfd8-9d79-4d5f-acdf-80064f6e2613.svg)](https://wakatime.com/badge/user/72fdcd5a-a9d0-4016-b00f-3f3d6fb2514a/project/e1e0cfd8-9d79-4d5f-acdf-80064f6e2613)
- `@laralove143`  
  [![wakatime](https://wakatime.com/badge/user/63c0a54b-c8c3-4d1d-8880-80300b937662/project/161a1426-2ddd-400f-b45d-7206650e2858.svg)](https://wakatime.com/badge/user/63c0a54b-c8c3-4d1d-8880-80300b937662/project/161a1426-2ddd-400f-b45d-7206650e2858)

### deployments

- [![prod](https://github.com/sorterisntonline/sorter/actions/workflows/deploy.yml/badge.svg?branch=production)](https://github.com/sorterisntonline/sorter/actions/workflows/deploy.yml) (prod)
- [![staging](https://github.com/sorterisntonline/sorter/actions/workflows/deploy.yml/badge.svg?branch=staging)](https://github.com/sorterisntonline/sorter/actions/workflows/deploy.yml) (staging)

# installation instructions

```bash
# Start local Postgres (in one terminal)
cd database && ./run-postgres.sh
# Note: this writes a local DATABASE_URL to repo-root .env (if missing)

# In a new terminal at repo root, install dbmate (macOS example)
brew install dbmate

# Run migrations from repo root
./migrate.sh

# Start the server (from rustsorter/)
cd rustsorter
RUST_LOG=debug cargo run
```

# resetting the databse and normal database container workflow (written by gemini)
*   **To Start & See Logs:**
    1.  Open a terminal.
    2.  Go to the `database` directory.
    3.  Run `./run-postgres.sh`.
    4.  Your terminal will now be filled with PostgreSQL logs. Keep this terminal open as long as you need the database.

*   **To Stop:**
    1.  Go to the terminal where the database is running.
    2.  Press **`Ctrl-C`**.
    3.  The container will stop cleanly, and because of the `--rm` flag, it will also be removed.

*   **To Reset the Database:**
    1.  Make sure the database is **stopped** first (press `Ctrl-C` in its terminal).
    2.  Run `./run-postgres.sh --reset`. This will nuke the data and exit.
    3.  You can then start it again normally.

# pytest integration testing
(first set up a venv if you would like)
Once the migrations are run and the DB and server are running 
```bash
pip install -r ./tests/requirements.txt
pytest
```
or
```bash
pip install -r ./tests/requirements.txt
python -m pytest
```
