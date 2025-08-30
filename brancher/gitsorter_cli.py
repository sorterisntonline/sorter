#!/usr/bin/env python3
import argparse
import json
import os
import sys
import subprocess
import tempfile
import uuid
from datetime import datetime
from pathlib import Path
from urllib import request, error
import fnmatch
from typing import Optional, List, Dict


DEFAULT_API_BASE = os.environ.get("SORTER_API_URL", "http://127.0.0.1:8081/api")


def http_get_json(url: str, headers: Optional[Dict[str, str]] = None) -> Dict:
    req = request.Request(url, method="GET")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with request.urlopen(req) as resp:
            data = resp.read()
            return json.loads(data.decode("utf-8"))
    except error.HTTPError as e:
        msg = e.read().decode("utf-8", errors="ignore")
        raise SystemExit(f"HTTP {e.code} error for {url}: {msg}")
    except error.URLError as e:
        raise SystemExit(f"Failed to reach {url}: {e}")


def run_cmd(cmd: List[str], cwd: Optional[str] = None) -> str:
    try:
        out = subprocess.check_output(cmd, cwd=cwd)
        return out.decode("utf-8", errors="replace")
    except subprocess.CalledProcessError as e:
        sys.stderr.write(e.output.decode("utf-8", errors="replace"))
        raise SystemExit(f"Command failed: {' '.join(cmd)} (exit {e.returncode})")


def load_ignore_patterns(repo_path: Path) -> List[str]:
    patterns: list[str] = []
    # Repomix ignore (if present)
    rm_ignore = repo_path / ".repomixignore"
    if rm_ignore.exists():
        for line in rm_ignore.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            patterns.append(line)
    # Reasonable defaults
    patterns += [
        ".git/", "node_modules/", "target/", "dist/", "build/", ".venv/", "venv/",
        "__pycache__/", ".idea/", ".vscode/", ".DS_Store", "*.lock", "*.min.js", "*.min.css",
        "*.png", "*.jpg", "*.jpeg", "*.gif", "*.webp", "*.svg", "*.pdf", "*.zip", "*.tar", "*.gz",
        "*.mp4", "*.mov", "*.mp3", "*.wav",
    ]
    return patterns


def path_is_ignored(path: str, patterns: List[str]) -> bool:
    # Normalize to forward slashes for matching consistency
    p = path.replace('\\', '/')
    for pat in patterns:
        if fnmatch.fnmatch(p, pat) or p.startswith(pat.rstrip('/')):
            return True
    return False


def list_branch_files(repo_path: Path, branch: str) -> List[str]:
    out = run_cmd(["git", "-C", str(repo_path), "ls-tree", "-r", "--name-only", branch])
    files = [line.strip() for line in out.splitlines() if line.strip()]
    return files


def get_file_content(repo_path: Path, branch: str, file_path: str) -> bytes:
    # Extract file as bytes at specific branch (HEAD of branch)
    return subprocess.check_output(["git", "-C", str(repo_path), "show", f"{branch}:{file_path}"])


def pack_branch(repo_path: Path, branch: str, out_file: Path, max_file_bytes: int = 800_000) -> Dict:
    patterns = load_ignore_patterns(repo_path)
    files = list_branch_files(repo_path, branch)
    kept = []
    skipped = []
    total_bytes = 0
    with out_file.open("w", encoding="utf-8", newline="\n") as f:
        for rel in files:
            if path_is_ignored(rel, patterns):
                skipped.append(rel)
                continue
            try:
                raw = get_file_content(repo_path, branch, rel)
            except subprocess.CalledProcessError:
                skipped.append(rel)
                continue
            # Skip likely-binary files
            if b"\x00" in raw:
                skipped.append(rel)
                continue
            # Heuristic: limit very large single files
            if len(raw) > max_file_bytes:
                skipped.append(rel)
                continue
            text = raw.decode("utf-8", errors="replace")
            f.write(f"===== FILE: {rel} =====\n")
            f.write(text)
            if not text.endswith("\n"):
                f.write("\n")
            f.write("\n")
            kept.append(rel)
            total_bytes += len(raw)
    return {
        "kept_count": len(kept),
        "skipped_count": len(skipped),
        "approx_bytes": total_bytes,
    }


def cmd_health(args: argparse.Namespace) -> None:
    base = args.api.rstrip('/')
    data = http_get_json(f"{base}/health")
    print(json.dumps(data, indent=2))


def cmd_prepare(args: argparse.Namespace) -> None:
    repo = Path(args.repo).resolve()
    if not (repo / ".git").exists():
        raise SystemExit(f"Not a git repository: {repo}")

    # Determine branches
    branches = list(args.branch)
    if not branches:
        # All local branches
        out = run_cmd(["git", "-C", str(repo), "branch", "--format", "%(refname:short)"])
        branches = [b.strip("* ") for b in out.splitlines() if b.strip()]
    if not branches:
        raise SystemExit("No branches detected.")

    run_id = str(uuid.uuid4())
    run_name = args.name or f"gitsorter-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}"
    out_dir = Path(args.out or f".gitsorter/{run_id}")
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Preparing run '{run_name}' (ID: {run_id}) -> {out_dir}")

    # Write run_config.json
    config = {
        "run_id": run_id,
        "run_name": run_name,
        "repo_path": str(repo),
        "branches": branches,
        "model": args.model,
        "lens_pk": args.lens,
        "api_base": args.api,
    }
    (out_dir / "run_config.json").write_text(json.dumps(config, indent=2))

    # Pack each branch
    stats = {}
    for br in branches:
        target = out_dir / f"{br.replace('/', '_')}.txt"
        print(f"Packing branch '{br}' -> {target}")
        st = pack_branch(repo, br, target)
        stats[br] = st
        print(f"  kept={st['kept_count']} skipped={st['skipped_count']} bytes≈{st['approx_bytes']}")

    (out_dir / "pack_stats.json").write_text(json.dumps(stats, indent=2))
    print("Done.")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="gitsorter", description="Gitsorter CLI orchestrator")
    sub = p.add_subparsers(dest="cmd", required=True)

    # health
    ph = sub.add_parser("health", help="Check server health")
    ph.add_argument("--api", default=DEFAULT_API_BASE, help="API base URL (default: %(default)s)")
    ph.set_defaults(func=cmd_health)

    # prepare
    pp = sub.add_parser("prepare", help="Prepare a run: pack branches into artifacts")
    pp.add_argument("--repo", required=True, help="Path to a local Git repository")
    pp.add_argument("--branch", action="append", default=[], help="Branch to include (repeatable). If omitted, include all local branches.")
    pp.add_argument("--name", help="Run name")
    pp.add_argument("--out", help="Output directory for artifacts")
    pp.add_argument("--model", default="openai/gpt-4o", help="Model identifier for later voting")
    pp.add_argument("--lens", default="architectural_vision_v1", help="Lens primary key")
    pp.add_argument("--api", default=DEFAULT_API_BASE, help="API base URL to embed in config")
    pp.set_defaults(func=cmd_prepare)

    return p


def main(argv: Optional[List[str]] = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
