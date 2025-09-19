#!/usr/bin/env python3
# /// script
# dependencies = ["supervisord-mcp>=1.0.0", "typer>=0.9.0", "rich>=13.0.0"]
# ///
"""
Sorter Orchestrator - Single entry point for all project operations
Consolidates functionality from sorter-db CLI, ctl.sh, dbmate.sh, and start.sh
"""

import os
import subprocess
import sys
import signal
import time
import shutil
from pathlib import Path
from typing import List, Optional, Annotated

import typer
from rich.console import Console
from rich.panel import Panel
from rich.text import Text

# Initialize console for rich output
console = Console()
app = typer.Typer(
    name="sorter",
    help="Sorter Orchestrator - Single entry point for all project operations",
    add_completion=False,
    rich_markup_mode="rich"
)

@app.callback(invoke_without_command=True)
def validate_config(ctx: typer.Context):
    """Validate configuration before running any command."""
    if ctx.invoked_subcommand is None:
        return
    
    # Skip validation for setup command (it creates the config)
    if ctx.invoked_subcommand == "setup":
        return
        
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        console.print("❌ DATABASE_URL not found in environment", style="red")
        console.print("Run: uv run main.py setup", style="dim")
        raise typer.Exit(1)
    
    if not (database_url.startswith("postgres://") or database_url.startswith("postgresql://")):
        console.print(f"❌ Invalid DATABASE_URL format: {database_url}", style="red")
        raise typer.Exit(1)

# Global orchestrator instance
orchestrator = None

class SorterOrchestrator:
    def __init__(self):
        self.project_root = Path(__file__).parent.absolute()
        os.chdir(self.project_root)
        
    def run_command(self, cmd: List[str], cwd: Optional[Path] = None, env: Optional[dict] = None, capture_output: bool = False) -> int:
        """Run a command and return its exit code."""
        try:
            if not capture_output:
                console.print(f"→ Running: {' '.join(cmd)}", style="dim")
            
            if capture_output:
                result = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True)
            else:
                result = subprocess.run(cmd, cwd=cwd, env=env)
            
            return result.returncode
        except KeyboardInterrupt:
            console.print("\n✋ Interrupted by user", style="yellow")
            return 130
        except FileNotFoundError:
            console.print(f"❌ Command not found: {cmd[0]}", style="red")
            return 127

    def ensure_env_file(self):
        """Create .env file if it doesn't exist."""
        env_file = self.project_root / ".env"
        if not env_file.exists():
            console.print("📝 Creating .env file...", style="blue")
            env_file.write_text("DATABASE_URL=postgres://postgres:password@localhost:5438/postgres?sslmode=disable\n")

    def ensure_logs_dir(self):
        """Create logs directory if it doesn't exist."""
        logs_dir = self.project_root / "logs"
        logs_dir.mkdir(exist_ok=True)

    def check_docker(self) -> bool:
        """Check if Docker is available."""
        return shutil.which("docker") is not None

    def check_rust(self) -> bool:
        """Check if Rust/Cargo is available."""
        return shutil.which("cargo") is not None

    def check_node(self) -> bool:
        """Check if Node.js/npm is available."""
        return shutil.which("npm") is not None

    def check_dependencies(self, ci_mode: bool = False) -> bool:
        """Check all required dependencies."""
        console.print("🔍 Checking dependencies...", style="blue")
        deps = [
            ("Docker", self.check_docker()),
            ("Rust/Cargo", self.check_rust()),
            ("Node.js/npm", self.check_node()),
        ]
        
        missing = []
        for name, available in deps:
            status = "✅" if available else "❌"
            if not ci_mode:
                console.print(f"  {status} {name}")
            if not available:
                missing.append(name)
        
        if missing:
            console.print(f"\n❌ Missing dependencies: {', '.join(missing)}", style="red")
            if ci_mode:
                raise typer.Exit(1)
            return False
        
        if not ci_mode:
            console.print("✅ All dependencies available", style="green")
        return True

    def setup_environment(self, ci_mode: bool = False):
        """Setup the development environment."""
        if not ci_mode:
            console.print("🚀 Setting up Sorter development environment...", style="blue")
        
        if not self.check_dependencies(ci_mode=ci_mode):
            raise typer.Exit(1)
            
        if not ci_mode:
            self.ensure_env_file()
        self.ensure_logs_dir()
        
        # Install frontend dependencies if needed
        package_json = self.project_root / "frontsorter" / "package.json"
        node_modules = self.project_root / "frontsorter" / "node_modules"
        
        if package_json.exists() and not node_modules.exists():
            if not ci_mode:
                console.print("📦 Installing frontend dependencies...", style="blue")
            result = self.run_command(["npm", "install"], cwd=self.project_root / "frontsorter")
            if result != 0:
                raise typer.Exit(result)
        
        if not ci_mode:
            console.print("✅ Environment setup complete", style="green")

    def supervisord_command(self, cmd: List[str]):
        """Execute supervisord-mcp commands."""
        return self.run_command(["uv", "run", "supervisord-mcp"] + cmd)

    def execute_sql(self, sql: str, database_url: Optional[str] = None):
        """Execute SQL against the database."""
        env = os.environ.copy()
        
        # Source .env file for database URL
        if not database_url:
            env_file = self.project_root / ".env"
            if env_file.exists():
                for line in env_file.read_text().splitlines():
                    if line.startswith("DATABASE_URL="):
                        database_url = line.split("=", 1)[1]
                        break
        
        if not database_url:
            console.print("❌ No DATABASE_URL found", style="red")
            raise typer.Exit(1)
        
        # Use docker exec to run psql in the container
        postgres_container = "postgres-dev"
        
        # Extract connection info from DATABASE_URL
        # postgres://postgres:password@localhost:5438/postgres?sslmode=disable
        import urllib.parse
        parsed = urllib.parse.urlparse(database_url)
        
        cmd = [
            "docker", "exec", "-i", postgres_container,
            "psql", 
            "-U", parsed.username,
            "-d", parsed.path.lstrip('/'),
            "-c", sql
        ]
        
        return self.run_command(cmd)

# CLI Commands

@app.command()
def setup(
    ci: Annotated[bool, typer.Option("--ci", help="Run in CI mode (exit on missing deps)")] = False
):
    """Setup development environment and check dependencies"""
    orchestrator.setup_environment(ci_mode=ci)

@app.command()
def start():
    """Start all services with supervisord"""
    console.print("🚀 Starting Sorter development environment with Supervisord...", style="blue")
    
    # Stop any existing postgres container
    subprocess.run(["docker", "stop", "postgres-dev"], capture_output=True)
    
    orchestrator.ensure_env_file()
    orchestrator.ensure_logs_dir()
    
    result = orchestrator.run_command(["supervisord", "-c", "supervisord.conf"])
    raise typer.Exit(result)

@app.command()
def migrate():
    """Run database migrations using dbmate"""
    console.print("🗄️ Running database migrations...", style="blue")
    
    # Load environment variables
    env = os.environ.copy()
    env["PGSSLMODE"] = "disable"
    
    # Source .env file
    env_file = orchestrator.project_root / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if "=" in line and not line.startswith("#"):
                key, value = line.split("=", 1)
                env[key] = value
    
    result = orchestrator.run_command([
        "dbmate", 
        "--migrations-dir", "./db/migrations",
        "up"
    ], env=env)
    raise typer.Exit(result)

@app.command()
def sql(
    query: Annotated[str, typer.Argument(help="SQL query to execute")],
    database_url: Annotated[Optional[str], typer.Option("--database-url", help="Database URL (defaults to .env)")] = None
):
    """Execute SQL query against the database"""
    result = orchestrator.execute_sql(query, database_url)
    raise typer.Exit(result)

# Process Management Commands
@app.command(name="list")
def list_processes():
    """List all supervised processes"""
    result = orchestrator.supervisord_command(["list-processes"])
    raise typer.Exit(result)

@app.command()
def status(
    name: Annotated[Optional[str], typer.Argument(help="Process name (optional)")] = None
):
    """Get process status"""
    if name:
        result = orchestrator.supervisord_command(["status", name])
    else:
        result = orchestrator.supervisord_command(["list-processes"])
    raise typer.Exit(result)

@app.command(name="start-process")
def start_process(
    name: Annotated[str, typer.Argument(help="Process name")]
):
    """Start a specific process"""
    result = orchestrator.supervisord_command(["start", name])
    raise typer.Exit(result)

@app.command()
def stop(
    name: Annotated[str, typer.Argument(help="Process name")]
):
    """Stop a specific process"""
    result = orchestrator.supervisord_command(["stop", name])
    raise typer.Exit(result)

@app.command()
def restart(
    name: Annotated[str, typer.Argument(help="Process name")]
):
    """Restart a specific process"""
    result = orchestrator.supervisord_command(["restart", name])
    raise typer.Exit(result)

@app.command()
def logs(
    name: Annotated[str, typer.Argument(help="Process name")],
    lines: Annotated[int, typer.Option("--lines", help="Number of lines to show")] = 100
):
    """Get process logs"""
    result = orchestrator.supervisord_command(["logs", name, "--lines", str(lines)])
    raise typer.Exit(result)

@app.command()
def reload():
    """Reload supervisord configuration"""
    result = orchestrator.supervisord_command(["reload"])
    raise typer.Exit(result)

@app.command()
def info():
    """Get system information"""
    result = orchestrator.supervisord_command(["info"])
    raise typer.Exit(result)

# Test Commands
@app.command()
def test():
    """Run all tests (Rust + Python)"""
    console.print("🧪 Running all tests...", style="blue")
    
    # Run Rust tests
    console.print("🦀 Running Rust tests...", style="blue")
    rust_result = orchestrator.run_command(["cargo", "test"], cwd=orchestrator.project_root / "rustsorter")
    
    # Run Python integration tests if available
    test_dir = orchestrator.project_root / "test"
    python_result = 0
    if test_dir.exists():
        console.print("🐍 Running Python integration tests...", style="blue")
        
        # Use uv to run pytest with test dependencies
        python_result = orchestrator.run_command(["uv", "run", "--extra", "test", "--", "python", "-m", "pytest", "test/"], cwd=orchestrator.project_root)
    
    result = max(rust_result, python_result)
    if result == 0:
        console.print("✅ All tests passed", style="green")
    else:
        console.print("❌ Some tests failed", style="red")
    
    raise typer.Exit(result)

@app.command(name="test-rust")
def test_rust(
    ci: Annotated[bool, typer.Option("--ci", help="Run in CI mode with nextest")] = False
):
    """Run Rust test suite only"""
    console.print("🦀 Running Rust tests...", style="blue")
    
    if ci:
        # Use nextest in CI mode
        result = orchestrator.run_command([
            "cargo", "nextest", "run", "--locked", "--workspace", "--profile", "ci"
        ], cwd=orchestrator.project_root / "rustsorter")
    else:
        # Use regular cargo test in development
        result = orchestrator.run_command(["cargo", "test"], cwd=orchestrator.project_root / "rustsorter")
    
    if result == 0:
        console.print("✅ Rust tests passed", style="green")
    else:
        console.print("❌ Rust tests failed", style="red")
    
    raise typer.Exit(result)

@app.command(name="test-python")
def test_python(
    junit_xml: Annotated[bool, typer.Option("--junit-xml", help="Generate JUnit XML output")] = False
):
    """Run Python test suite only"""
    test_dir = orchestrator.project_root / "test"
    
    if not test_dir.exists():
        console.print("❌ No Python test directory found", style="red")
        raise typer.Exit(1)
    
    console.print("🐍 Running Python integration tests...", style="blue")
    
    # Build pytest command for uv
    cmd = ["uv", "run", "--extra", "test", "--", "python", "-m", "pytest", "test/", "-q", "--maxfail=1", "--disable-warnings"]
    if junit_xml:
        cmd.append("--junitxml=python-tests.xml")
    
    # Run pytest via uv
    result = orchestrator.run_command(cmd, cwd=orchestrator.project_root)
    
    if result == 0:
        console.print("✅ Python tests passed", style="green")
    else:
        console.print("❌ Python tests failed", style="red")
    
    raise typer.Exit(result)

# Build Commands
@app.command()
def build():
    """Build the entire project"""
    console.print("🔨 Building project...", style="blue")
    
    # Build Rust backend
    console.print("🦀 Building Rust backend...", style="blue")
    rust_result = orchestrator.run_command(["cargo", "build"], cwd=orchestrator.project_root / "rustsorter")
    
    # Build frontend
    console.print("⚛️ Building React frontend...", style="blue")
    frontend_result = orchestrator.run_command(["npm", "run", "build"], cwd=orchestrator.project_root / "frontsorter")
    
    result = max(rust_result, frontend_result)
    if result == 0:
        console.print("✅ Build successful", style="green")
    else:
        console.print("❌ Build failed", style="red")
    
    raise typer.Exit(result)

@app.command(name="build-rust")
def build_rust(
    release: Annotated[bool, typer.Option("--release", help="Build in release mode")] = False
):
    """Build Rust backend only"""
    console.print("🦀 Building Rust backend...", style="blue")
    
    cmd = ["cargo", "build"]
    if release:
        cmd.append("--release")
        console.print("Building in release mode...", style="dim")
    
    result = orchestrator.run_command(cmd, cwd=orchestrator.project_root / "rustsorter")
    
    if result == 0:
        console.print("✅ Rust build successful", style="green")
    else:
        console.print("❌ Rust build failed", style="red")
    
    raise typer.Exit(result)

# Development Commands
@app.command(name="dev-server")
def dev_server():
    """Start development server (Rust backend only)"""
    console.print("🦀 Starting Rust development server...", style="blue")
    env = os.environ.copy()
    env["RUST_LOG"] = "debug"
    env["DATABASE_URL"] = "postgres://postgres:password@localhost:5438/postgres?sslmode=disable"
    
    result = orchestrator.run_command(["cargo", "run"], cwd=orchestrator.project_root / "rustsorter", env=env)
    raise typer.Exit(result)

@app.command(name="dev-client")
def dev_client():
    """Start development client (React frontend only)"""
    console.print("⚛️ Starting React development client...", style="blue")
    result = orchestrator.run_command(["npm", "run", "dev"], cwd=orchestrator.project_root / "frontsorter")
    raise typer.Exit(result)

def main():
    global orchestrator
    orchestrator = SorterOrchestrator()
    app()

if __name__ == "__main__":
    main()
