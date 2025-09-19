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

# Quick Start

## Prerequisites

Install UV (Python package manager):
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

## One-Command Setup

```bash
# Setup environment and start all services
uv run main.py setup              # Check dependencies and create environment
uv run main.py start              # Start all services (PostgreSQL, backend, frontend)
```

That's it! All services will start automatically with supervisord.

## Development Commands

### Process Management
```bash
uv run main.py list               # List all processes
uv run main.py status             # Get status of all processes  
uv run main.py logs rust-server   # View server logs
uv run main.py restart postgres   # Restart database
```

### Database Operations
```bash
uv run main.py migrate            # Run database migrations
```

### Testing & Building
```bash
uv run main.py test               # Run all tests (Rust + Python)
uv run main.py build              # Build entire project
```

### Individual Services
```bash
uv run main.py dev-server         # Start only Rust backend
uv run main.py dev-client         # Start only React frontend
```

## Alternative: Console Script

After first run, you can use the shorter console script:
```bash
uv run sorter start               # Same as main.py
uv run sorter --help              # Show all commands
```

## URLs

- **Frontend**: http://localhost:5173/ (Vite dev server)
- **Backend API**: Default Axum port (check logs for exact port)
- **Database**: PostgreSQL on port 5438

## Advanced Usage

### Manual Installation (Legacy)

For manual component installation:

```bash
# Frontend dependencies
cd frontsorter && npm install

# Database migrations (if not using main.py)
# Create .env with: DATABASE_URL=postgres://postgres:password@localhost:5438/postgres?sslmode=disable
export PGSSLMODE=disable
dbmate --migrations-dir ./database/sql up
```

### Integration Testing

```bash
# Tests run automatically with: uv run main.py test
# Or manually:
pip install -r ./test/requirements.txt
python -m pytest
```

### Process Monitoring

All process logs are stored in `./logs/` directory:
- `postgres.log` - Database logs
- `rust-server.log` - Backend logs  
- `vite-client.log` - Frontend logs

## Troubleshooting

1. **Services not starting**: Check `uv run main.py logs <service-name>`
2. **Missing dependencies**: Run `uv run main.py setup`
3. **Port conflicts**: Use `uv run main.py status` to see running processes
4. **Database issues**: Restart with `uv run main.py restart postgres`

For detailed development workflows, see [AGENTS.md](AGENTS.md).
