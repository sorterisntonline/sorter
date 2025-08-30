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


def pack_branch_repomix(repo_path: Path, branch: str, out_file: Path, style: str = "xml") -> Dict:
    """Use repomix to pack a branch honoring .repomixignore and config.
    Requires Node+npx and repomix. No fallback.
    """
    # Create a temporary git worktree for the target branch to let repomix
    # operate on the correct tree with proper .git context.
    out_file.parent.mkdir(parents=True, exist_ok=True)
    worktree_dir = Path(tempfile.mkdtemp(prefix="gitsorter-wt-"))
    try:
        run_cmd(["git", "-C", str(repo_path), "worktree", "add", "--detach", str(worktree_dir), branch])
        cmd = [
            "npx",
            "repomix",
            "--output",
            str(out_file),
            "--style",
            style,
        ]
        # Run in the worktree so config/ignore applies naturally
        subprocess.check_call(cmd, cwd=str(worktree_dir))
        approx_bytes = out_file.stat().st_size if out_file.exists() else 0
        return {"approx_bytes": approx_bytes, "packer": "repomix", "style": style}
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        raise SystemExit(f"repomix packing failed for branch '{branch}': {e}")
    finally:
        # Clean up worktree regardless of success
        try:
            run_cmd(["git", "-C", str(repo_path), "worktree", "remove", "--force", str(worktree_dir)])
        except Exception:
            pass


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

    # Pack each branch with repomix only
    stats = {}
    for br in branches:
        ext = ".xml" if args.style == "xml" else ".txt" if args.style == "plain" else ".md"
        target = out_dir / f"{br.replace('/', '_')}{ext}"
        print(f"Packing branch '{br}' -> {target}")
        st = pack_branch_repomix(repo, br, target, style=args.style)
        stats[br] = st
        approx = st.get("approx_bytes")
        packer_used = st.get("packer")
        print(f"  packer={packer_used} style={args.style} bytes≈{approx}")

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
    pp.add_argument("--style", choices=["xml", "markdown", "plain"], default="xml", help="Repomix output style (default: xml)")
    pp.set_defaults(func=cmd_prepare)

    return p


def main(argv: Optional[List[str]] = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
