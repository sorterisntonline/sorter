#!/usr/bin/env python3
# /// script
# dependencies = ["supervisord-mcp>=1.0.0"]
# ///
"""
Sorter Orchestrator - Single entry point for all project operations
Consolidates functionality from sorter-db CLI, ctl.sh, dbmate.sh, and start.sh
"""

import argparse
import os
import subprocess
import sys
import signal
import time
import shutil
from pathlib import Path
from typing import List, Optional


class SorterOrchestrator:
    def __init__(self):
        self.project_root = Path(__file__).parent.absolute()
        os.chdir(self.project_root)
        
    def run_command(self, cmd: List[str], cwd: Optional[Path] = None, env: Optional[dict] = None) -> int:
        """Run a command and return its exit code."""
        try:
            print(f"→ Running: {' '.join(cmd)}")
            result = subprocess.run(cmd, cwd=cwd, env=env)
            return result.returncode
        except KeyboardInterrupt:
            print("\n✋ Interrupted by user")
            return 130
        except FileNotFoundError:
            print(f"❌ Command not found: {cmd[0]}")
            return 127

    def ensure_env_file(self):
        """Create .env file if it doesn't exist."""
        env_file = self.project_root / ".env"
        if not env_file.exists():
            print("📝 Creating .env file...")
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

    def check_dependencies(self):
        """Check all required dependencies."""
        print("🔍 Checking dependencies...")
        deps = [
            ("Docker", self.check_docker()),
            ("Rust/Cargo", self.check_rust()),
            ("Node.js/npm", self.check_node()),
        ]
        
        missing = []
        for name, available in deps:
            status = "✅" if available else "❌"
            print(f"  {status} {name}")
            if not available:
                missing.append(name)
        
        if missing:
            print(f"\n❌ Missing dependencies: {', '.join(missing)}")
            return False
        
        print("✅ All dependencies available")
        return True

    def setup_environment(self):
        """Setup the development environment."""
        print("🚀 Setting up Sorter development environment...")
        
        if not self.check_dependencies():
            return 1
            
        self.ensure_env_file()
        self.ensure_logs_dir()
        
        # Install frontend dependencies if needed
        package_json = self.project_root / "frontsorter" / "package.json"
        node_modules = self.project_root / "frontsorter" / "node_modules"
        
        if package_json.exists() and not node_modules.exists():
            print("📦 Installing frontend dependencies...")
            result = self.run_command(["npm", "install"], cwd=self.project_root / "frontsorter")
            if result != 0:
                return result
        
        print("✅ Environment setup complete")
        return 0

    def start_supervisord(self):
        """Start all services using supervisord."""
        print("🚀 Starting Sorter development environment with Supervisord...")
        
        # Stop any existing postgres container
        subprocess.run(["docker", "stop", "postgres-dev"], capture_output=True)
        
        self.ensure_env_file()
        self.ensure_logs_dir()
        
        return self.run_command(["supervisord", "-c", "supervisord.conf"])

    def migrate_database(self):
        """Run database migrations using dbmate."""
        print("🗄️ Running database migrations...")
        
        # Load environment variables
        env = os.environ.copy()
        env["PGSSLMODE"] = "disable"
        
        # Source .env file
        env_file = self.project_root / ".env"
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                if "=" in line and not line.startswith("#"):
                    key, value = line.split("=", 1)
                    env[key] = value
        
        return self.run_command([
            "dbmate", 
            "--migrations-dir", "./database/sql",
            "up"
        ], env=env)

    def supervisord_command(self, cmd: List[str]):
        """Execute supervisord-mcp commands."""
        return self.run_command(["uv", "run", "supervisord-mcp"] + cmd)

    def list_processes(self):
        """List all supervised processes."""
        return self.supervisord_command(["list-processes"])

    def process_status(self, name: Optional[str] = None):
        """Get process status."""
        if name:
            return self.supervisord_command(["status", name])
        else:
            return self.list_processes()

    def start_process(self, name: str):
        """Start a specific process."""
        return self.supervisord_command(["start", name])

    def stop_process(self, name: str):
        """Stop a specific process."""
        return self.supervisord_command(["stop", name])

    def restart_process(self, name: str):
        """Restart a specific process."""
        return self.supervisord_command(["restart", name])

    def get_logs(self, name: str, lines: int = 100):
        """Get process logs."""
        return self.supervisord_command(["logs", name, "--lines", str(lines)])

    def reload_config(self):
        """Reload supervisord configuration."""
        return self.supervisord_command(["reload"])

    def system_info(self):
        """Get system information."""
        return self.supervisord_command(["info"])

    def run_tests(self):
        """Run project tests."""
        print("🧪 Running tests...")
        
        # Run Rust tests
        print("🦀 Running Rust tests...")
        rust_result = self.run_command(["cargo", "test"], cwd=self.project_root / "rustsorter")
        
        # Run Python integration tests if available
        test_dir = self.project_root / "test"
        if test_dir.exists() and (test_dir / "requirements.txt").exists():
            print("🐍 Running Python integration tests...")
            
            # Install test dependencies
            subprocess.run(["pip", "install", "-r", "requirements.txt"], cwd=test_dir)
            
            # Run pytest
            python_result = self.run_command(["python", "-m", "pytest"], cwd=test_dir)
            
            return max(rust_result, python_result)
        
        return rust_result

    def build_project(self):
        """Build the entire project."""
        print("🔨 Building project...")
        
        # Build Rust backend
        print("🦀 Building Rust backend...")
        rust_result = self.run_command(["cargo", "build"], cwd=self.project_root / "rustsorter")
        
        # Build frontend
        print("⚛️ Building React frontend...")
        frontend_result = self.run_command(["npm", "run", "build"], cwd=self.project_root / "frontsorter")
        
        return max(rust_result, frontend_result)

    def dev_server(self):
        """Start development server (Rust backend only)."""
        print("🦀 Starting Rust development server...")
        env = os.environ.copy()
        env["RUST_LOG"] = "debug"
        env["DATABASE_URL"] = "postgres://postgres:password@localhost:5438/postgres?sslmode=disable"
        
        return self.run_command(["cargo", "run"], cwd=self.project_root / "rustsorter", env=env)

    def dev_client(self):
        """Start development client (React frontend only)."""
        print("⚛️ Starting React development client...")
        return self.run_command(["npm", "run", "dev"], cwd=self.project_root / "frontsorter")


def create_parser():
    parser = argparse.ArgumentParser(
        description="Sorter Orchestrator - Single entry point for all project operations",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python main.py start              # Start all services with supervisord
  python main.py setup              # Setup development environment
  python main.py migrate            # Run database migrations
  python main.py list               # List all processes
  python main.py logs rust-server   # View server logs
  python main.py restart postgres   # Restart PostgreSQL
  python main.py test               # Run all tests
  python main.py build              # Build the project
        """
    )
    
    subparsers = parser.add_subparsers(dest="command", help="Available commands")
    
    # Development environment commands
    subparsers.add_parser("setup", help="Setup development environment and check dependencies")
    subparsers.add_parser("start", help="Start all services with supervisord")
    subparsers.add_parser("migrate", help="Run database migrations")
    
    # Process management commands
    subparsers.add_parser("list", help="List all supervised processes")
    status_parser = subparsers.add_parser("status", help="Get process status")
    status_parser.add_argument("name", nargs="?", help="Process name (optional)")
    
    start_parser = subparsers.add_parser("start-process", help="Start a specific process")
    start_parser.add_argument("name", help="Process name")
    
    stop_parser = subparsers.add_parser("stop", help="Stop a specific process")
    stop_parser.add_argument("name", help="Process name")
    
    restart_parser = subparsers.add_parser("restart", help="Restart a specific process")
    restart_parser.add_argument("name", help="Process name")
    
    logs_parser = subparsers.add_parser("logs", help="Get process logs")
    logs_parser.add_argument("name", help="Process name")
    logs_parser.add_argument("--lines", type=int, default=100, help="Number of lines to show")
    
    subparsers.add_parser("reload", help="Reload supervisord configuration")
    subparsers.add_parser("info", help="Get system information")
    
    # Development commands
    subparsers.add_parser("test", help="Run all tests")
    subparsers.add_parser("build", help="Build the entire project")
    subparsers.add_parser("dev-server", help="Start Rust development server only")
    subparsers.add_parser("dev-client", help="Start React development client only")
    
    return parser


def main():
    parser = create_parser()
    args = parser.parse_args()
    
    orchestrator = SorterOrchestrator()
    
    if args.command is None:
        parser.print_help()
        return 0
    
    # Map commands to methods
    command_map = {
        "setup": orchestrator.setup_environment,
        "start": orchestrator.start_supervisord,
        "migrate": orchestrator.migrate_database,
        "list": orchestrator.list_processes,
        "status": lambda: orchestrator.process_status(getattr(args, 'name', None)),
        "start-process": lambda: orchestrator.start_process(args.name),
        "stop": lambda: orchestrator.stop_process(args.name),
        "restart": lambda: orchestrator.restart_process(args.name),
        "logs": lambda: orchestrator.get_logs(args.name, args.lines),
        "reload": orchestrator.reload_config,
        "info": orchestrator.system_info,
        "test": orchestrator.run_tests,
        "build": orchestrator.build_project,
        "dev-server": orchestrator.dev_server,
        "dev-client": orchestrator.dev_client,
    }
    
    if args.command in command_map:
        try:
            return command_map[args.command]()
        except KeyboardInterrupt:
            print("\n✋ Interrupted by user")
            return 130
    else:
        print(f"❌ Unknown command: {args.command}")
        parser.print_help()
        return 1


if __name__ == "__main__":
    sys.exit(main())
