#!/usr/bin/env python3
"""
Sorter Development Orchestration Script
Uses uv for dependency management and service orchestration
"""
import subprocess
import sys
import os
import signal
from pathlib import Path

class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

def print_status(message, status="info"):
    """Print colored status messages"""
    color = {
        "info": Colors.OKBLUE,
        "success": Colors.OKGREEN,
        "warning": Colors.WARNING,
        "error": Colors.FAIL
    }.get(status, Colors.ENDC)
    print(f"{color}{message}{Colors.ENDC}")

def check_command(cmd):
    """Check if a command exists"""
    try:
        subprocess.run([cmd, "--version"], capture_output=True, check=False)
        return True
    except FileNotFoundError:
        return False

def check_dependencies():
    """Check for required dependencies"""
    print_status("\n🔍 Checking dependencies...", "info")

    deps = {
        "docker": check_command("docker"),
        "cargo": check_command("cargo"),
        "npm": check_command("npm"),
        "psql": check_command("psql")
    }

    for dep, available in deps.items():
        status = "success" if available else "warning"
        symbol = "✓" if available else "✗"
        print_status(f"  {symbol} {dep}: {'available' if available else 'not found'}", status)

    return deps

def run_supervisord():
    """Run supervisord using uv"""
    print_status("\n🚀 Starting services with supervisord...", "info")
    try:
        # Create logs directory if it doesn't exist
        Path("logs").mkdir(exist_ok=True)

        # Run supervisord
        subprocess.run(["uv", "run", "supervisord", "-c", "supervisord.conf"])
    except KeyboardInterrupt:
        print_status("\n\n👋 Shutting down services...", "warning")
        sys.exit(0)

def run_tests():
    """Run pytest tests"""
    print_status("\n🧪 Running tests...", "info")
    try:
        result = subprocess.run(
            ["uv", "run", "pytest", "test/", "-v"],
            cwd=Path.cwd()
        )
        return result.returncode == 0
    except Exception as e:
        print_status(f"❌ Error running tests: {e}", "error")
        return False

def show_help():
    """Show usage information"""
    help_text = """
🎯 Sorter Development Orchestration

Usage:
  uv run main.py [command]

Commands:
  start       Start all services using supervisord (default)
  test        Run pytest integration tests
  check       Check dependencies only
  help        Show this help message

Examples:
  uv run main.py              # Start all services
  uv run main.py test         # Run tests
  uv run main.py check        # Check dependencies
"""
    print(help_text)

def main():
    """Main orchestration function"""
    args = sys.argv[1:]
    command = args[0] if args else "start"

    if command == "help":
        show_help()
        return

    print_status("=" * 60, "info")
    print_status("🎯 Sorter Development Orchestration", "info")
    print_status("=" * 60, "info")

    deps = check_dependencies()

    if command == "check":
        print_status("\n✅ Dependency check complete", "success")
        return

    if command == "test":
        if not deps["psql"]:
            print_status("\n⚠️  Warning: PostgreSQL client not found. Tests may require a running database.", "warning")

        success = run_tests()
        sys.exit(0 if success else 1)

    if command == "start":
        if not deps["docker"]:
            print_status("\n⚠️  Warning: Docker not found. supervisord config expects Docker for PostgreSQL.", "warning")
            print_status("You may need to modify supervisord.conf to use a local PostgreSQL instance.", "warning")

        if not deps["cargo"]:
            print_status("\n❌ Error: Cargo (Rust) is required to run the backend server.", "error")
            sys.exit(1)

        run_supervisord()
        return

    print_status(f"\n❌ Unknown command: {command}", "error")
    print_status("Run 'uv run main.py help' for usage information", "info")
    sys.exit(1)

if __name__ == "__main__":
    main()
