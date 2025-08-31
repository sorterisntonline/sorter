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


def http_post_json(url: str, payload: Dict, headers: Optional[Dict[str, str]] = None) -> Dict:
    body = json.dumps(payload).encode("utf-8")
    req = request.Request(url, method="POST", data=body)
    req.add_header("Content-Type", "application/json")
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


def http_post_json_ignore_conflict(url: str, payload: Dict, headers: Optional[Dict[str, str]] = None) -> Optional[Dict]:
    body = json.dumps(payload).encode("utf-8")
    req = request.Request(url, method="POST", data=body)
    req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with request.urlopen(req) as resp:
            data = resp.read()
            return json.loads(data.decode("utf-8"))
    except error.HTTPError as e:
        if e.code == 409:
            # Conflict: resource already exists. Ignore per idempotent ingest.
            return None
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
    abs_out = str(out_file.resolve())
    worktree_dir = Path(tempfile.mkdtemp(prefix="gitsorter-wt-"))
    try:
        run_cmd(["git", "-C", str(repo_path), "worktree", "add", "--detach", str(worktree_dir), branch])
        cmd = [
            "npx",
            "repomix",
            "--output",
            abs_out,
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

    out_dir = Path(args.out or f".gitsorter/{uuid.uuid4()}")
    out_dir.mkdir(parents=True, exist_ok=True)

    # Determine requested branches
    requested_branches = list(args.branch)
    if not requested_branches:
        out = run_cmd(["git", "-C", str(repo), "branch", "--format", "%(refname:short)"])
        requested_branches = [b.strip("* ") for b in out.splitlines() if b.strip()]
    if not requested_branches:
        raise SystemExit("No branches detected.")

    cfg_path = out_dir / "run_config.json"
    existing_cfg = None
    if args.append:
        if not cfg_path.exists():
            raise SystemExit(f"--append specified but {cfg_path} not found")
        existing_cfg = json.loads(cfg_path.read_text())

    if existing_cfg:
        run_id = existing_cfg.get("run_id")
        run_name = existing_cfg.get("run_name") or args.name or f"gitsorter-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}"
        combined = sorted(list({*existing_cfg.get("branches", []), *requested_branches}))
        config = existing_cfg
        config.update({
            "run_name": run_name,
            "repo_path": str(repo),
            "branches": combined,
            "model": args.model or existing_cfg.get("model"),
            "lens_pk": args.lens or existing_cfg.get("lens_pk"),
            "style": "xml",
            "api_base": args.api or existing_cfg.get("api_base"),
        })
    else:
        run_id = str(uuid.uuid4())
        run_name = args.name or f"gitsorter-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}"
        config = {
            "run_id": run_id,
            "run_name": run_name,
            "repo_path": str(repo),
            "branches": requested_branches,
            "model": args.model,
            "lens_pk": args.lens,
            "style": "xml",
            "api_base": args.api,
        }

    print(f"Preparing run '{run_name}' (ID: {run_id}) -> {out_dir}")

    # Persist/Update config
    cfg_path.write_text(json.dumps(config, indent=2))

    # Pack each branch with repomix only
    stats = {}
    for br in requested_branches:
        target = out_dir / f"{br.replace('/', '_')}.xml"
        print(f"Packing branch '{br}' -> {target}")
        st = pack_branch_repomix(repo, br, target, style="xml")
        stats[br] = st
        approx = st.get("approx_bytes")
        packer_used = st.get("packer")
        print(f"  packer={packer_used} style=xml bytes≈{approx}")

    (out_dir / "pack_stats.json").write_text(json.dumps(stats, indent=2))
    print("Done.")


def auth_headers(api_key: Optional[str]) -> Dict[str, str]:
    headers: Dict[str, str] = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def git_branch_sha(repo: Path, branch: str) -> str:
    return run_cmd(["git", "-C", str(repo), "rev-parse", branch]).strip()


def cmd_ingest(args: argparse.Namespace) -> None:
    out_dir = Path(args.dir)
    cfg = json.loads((out_dir / "run_config.json").read_text())
    repo = Path(cfg["repo_path"]).resolve()
    branches = cfg["branches"]
    run_id = cfg["run_id"]
    run_name = cfg.get("run_name")
    # Enforce XML artifacts regardless of per-branch repomix configs
    style = "xml"
    api = args.api.rstrip('/')
    api_key = args.api_key or os.environ.get("SORTER_API_KEY")
    hdrs = auth_headers(api_key)

    # 1) Create run entity
    run_payload = {
        "pk_namespace": "gitsort.run",
        "pk": run_id,
        "title": run_name,
        "metadata": cfg,
        "profile_picture_url": None,
    }
    run_entity = http_post_json_ignore_conflict(f"{api}/entity", run_payload, headers=hdrs)
    if run_entity is None:
        print(f"Run entity already exists: gitsort.run/{run_id}")
    else:
        print(f"Created run entity: gitsort.run/{run_id}")

    # 2) Create/ensure lens entity
    lens_pk = cfg.get("lens_pk", args.lens)
    if lens_pk:
        lens_payload = {
            "pk_namespace": "gitsort.lens",
            "pk": lens_pk,
            "title": lens_pk,
            "metadata": None,
            "profile_picture_url": None,
        }
        http_post_json_ignore_conflict(f"{api}/entity", lens_payload, headers=hdrs)
        rel = {
            "parent_pk_namespace": "gitsort.run",
            "parent_pk": run_id,
            "child_pk_namespace": "gitsort.lens",
            "child_pk": lens_pk,
        }
        http_post_json_ignore_conflict(f"{api}/entity_relationships", rel, headers=hdrs)
        print(f"Linked lens gitsort.lens/{lens_pk} to run (or already linked)")

    # 3) Create snapshot entities and relationships
    stats = json.loads((out_dir / "pack_stats.json").read_text())
    for br in branches:
        sha = git_branch_sha(repo, br)
        # Require XML files only
        packed_path = out_dir / f"{br.replace('/', '_')}.xml"
        if not packed_path.exists():
            raise SystemExit(
                f"Missing XML artifact for branch '{br}': {packed_path}. Re-run prepare to generate XML (default)."
            )
        content = packed_path.read_text(encoding="utf-8")
        pk = f"{br}:{sha}"
        payload = {
            "pk_namespace": "gitsort.branch_snapshot",
            "pk": pk,
            "title": br,
            "metadata": {
                "branch": br,
                "commit_sha": sha,
                "packed_style": style,
                "packed_bytes": packed_path.stat().st_size,
                "repomix_output": content,
            },
            "profile_picture_url": None,
        }
        http_post_json_ignore_conflict(f"{api}/entity", payload, headers=hdrs)
        rel = {
            "parent_pk_namespace": "gitsort.run",
            "parent_pk": run_id,
            "child_pk_namespace": "gitsort.branch_snapshot",
            "child_pk": pk,
        }
        http_post_json_ignore_conflict(f"{api}/entity_relationships", rel, headers=hdrs)
        print(f"Linked snapshot {pk} (or already linked)")

    print("Ingestion complete.")


# ------------------------- LLM Voting Orchestrator -------------------------

def default_lens_prompts() -> Dict[str, str]:
    return {
        "system": (
            "You are a principal software architect and product strategist. "
            "You compare two entire codebases (A and B) and judge them strictly against the provided lens. "
            "Be rigorous, consistent, and decisive. Respond ONLY with a single JSON object as instructed; do not include prose, code fences, or any extra characters."
        ),
        "user_template": (
            "Lens Criteria:\n{{LENS}}\n\n"
            "Compare two codebases labeled <A> and <B>.\n"
            "In your rationale, you MUST refer to the codebases by their branch names, '{{A_BRANCH}}' and '{{B_BRANCH}}'.\n"
            "Your JSON response MUST be exactly:\n"
            "{\n  \"winner\": \"{{A_BRANCH}}|{{B_BRANCH}}|tie\",\n  \"score\": 0..100,\n  \"confidence\": 0..1,\n  \"rationale\": \"short reason using branch names\"\n}\n\n"
            "Codebase A (metadata):\nBranch: {{A_BRANCH}}\nCommit: {{A_SHA}}\nBytes: {{A_BYTES}}\n\n"
            "<A_CODE>\n{{A_CONTENT}}\n</A_CODE>\n\n"
            "Codebase B (metadata):\nBranch: {{B_BRANCH}}\nCommit: {{B_SHA}}\nBytes: {{B_BYTES}}\n\n"
            "<B_CODE>\n{{B_CONTENT}}\n</B_CODE>\n"
        ),
    }


def build_prompt_for_pair(lens_text: str, a_meta: Dict, b_meta: Dict) -> Dict[str, List[Dict[str, str]]]:
    prompts = default_lens_prompts()
    system = prompts["system"]
    user = prompts["user_template"]
    user_filled = (
        user
        .replace("{{LENS}}", lens_text)
        .replace("{{A_BRANCH}}", str(a_meta.get("branch", "")))
        .replace("{{A_SHA}}", str(a_meta.get("commit_sha", "")))
        .replace("{{A_BYTES}}", str(a_meta.get("packed_bytes", "")))
        .replace("{{A_CONTENT}}", a_meta.get("repomix_output", ""))
        .replace("{{B_BRANCH}}", str(b_meta.get("branch", "")))
        .replace("{{B_SHA}}", str(b_meta.get("commit_sha", "")))
        .replace("{{B_BYTES}}", str(b_meta.get("packed_bytes", "")))
        .replace("{{B_CONTENT}}", b_meta.get("repomix_output", ""))
    )
    return {
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_filled},
        ]
    }


def call_openrouter_chat(model: str, api_key: str, messages: List[Dict[str, str]], temperature: float = 0.1, extra: Optional[Dict] = None) -> Dict:
    import ssl
    from urllib import request as _req
    body = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        # Ask for structured output when supported
        "response_format": {"type": "json_object"},
    }
    if extra:
        body.update(extra)
    data = json.dumps(body).encode("utf-8")
    req = _req.Request("https://openrouter.ai/api/v1/chat/completions", data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", f"Bearer {api_key}")
    # Some environments require this user-agent per OpenRouter policy
    req.add_header("HTTP-Referer", "https://sorter.local/cli")
    req.add_header("X-Title", "gitsorter-cli")
    try:
        # default SSL context
        with _req.urlopen(req, context=ssl.create_default_context()) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except error.HTTPError as e:
        raise SystemExit(f"OpenRouter HTTP {e.code}: {e.read().decode('utf-8', errors='ignore')}")
    except error.URLError as e:
        raise SystemExit(f"OpenRouter request failed: {e}")


def parse_llm_decision(text: str, a_branch: Optional[str] = None, b_branch: Optional[str] = None) -> Dict:
    # Strict JSON only; no fallback parsing.
    obj = json.loads(text)
    raw_winner = str(obj.get("winner", "")).strip()
    wl = raw_winner.lower()
    winner: str
    if a_branch is not None and b_branch is not None:
        a_lower = str(a_branch).lower()
        b_lower = str(b_branch).lower()
        if wl == "tie":
            winner = "tie"
        elif wl == a_lower:
            winner = "a"
        elif wl == b_lower:
            winner = "b"
        else:
            raise ValueError("invalid winner")
    else:
        if wl not in ("a", "b", "tie"):
            raise ValueError("invalid winner")
        winner = wl
    score = float(obj.get("score", 50))
    confidence = float(obj.get("confidence", 0.5))
    rationale = str(obj.get("rationale", ""))
    return {"winner": winner, "score": score, "confidence": confidence, "rationale": rationale}


def magnitude_from_score(winner: str, score: float) -> int:
    # score is 0..100; map to [-50, 50] where positive favors listed left
    # We'll always set left=A; if winner B, we negate later when posting (server canonicalizes anyway)
    mag = int(round(score - 50))
    if winner == "tie":
        return 0
    return max(-50, min(50, mag))


def get_run_children(api: str, run_id: str, api_key: Optional[str]) -> Dict[str, Dict]:
    data = http_get_json(
        f"{api.rstrip('/')}/entity/gitsort.run/{run_id}?children=true",
        headers=auth_headers(api_key),
    )
    # Normalize shape
    children = data.get("children")
    if children is None and isinstance(data, dict):
        children = data.get("entity", {}).get("children")
    if children is None:
        children = []
    # Build map by (ns,pk)
    by_id: Dict[str, Dict] = {}
    for e in children:
        key = f"{e['pk_namespace']}::{e['pk']}"
        by_id[key] = e
    return by_id


def rank_entities(api: str, entities: List[Dict[str, str]], api_key: Optional[str]) -> Dict:
    return http_post_json(f"{api.rstrip('/')}/rank", entities, headers=auth_headers(api_key))


def check_existing_vote_for_pair(api: str, left_entity: Dict[str, str], right_entity: Dict[str, str], api_key: Optional[str]) -> bool:
    """Check if a vote already exists for the given pair of entities.

    Returns True if a vote exists, False otherwise.
    """
    payload = {
        "kind": "Pair",
        "entities": [
            {
                "pk_namespace": left_entity["pk_namespace"],
                "pk": left_entity["pk"]
            },
            {
                "pk_namespace": right_entity["pk_namespace"],
                "pk": right_entity["pk"]
            }
        ]
    }

    try:
        response = http_post_json(f"{api.rstrip('/')}/vote/filtered", payload, headers=auth_headers(api_key))
        # If we get votes back, one already exists
        return len(response) > 0
    except SystemExit:
        # If the API call fails, assume no vote exists to be safe (don't skip unnecessarily)
        return False


def cmd_vote_llm(args: argparse.Namespace) -> None:
    api = args.api.rstrip('/')
    api_key = args.api_key or os.environ.get("SORTER_API_KEY")
    llm_key = os.environ.get(args.llm_key_env)
    if not llm_key:
        raise SystemExit(f"Missing LLM API key in env var {args.llm_key_env}")

    # Load run children and separate snapshots and lens
    child_map = get_run_children(api, args.run_id, api_key)
    snapshots: List[Dict] = []
    lens_entities: List[Dict] = []
    for e in child_map.values():
        if e.get("pk_namespace") == "gitsort.branch_snapshot":
            snapshots.append(e)
        elif e.get("pk_namespace") == "gitsort.lens":
            lens_entities.append(e)
    if not snapshots:
        print("No snapshots found; run ingest first.")
        return

    # Determine lens text
    lens_text = args.lens_text or ""
    if not lens_text and lens_entities:
        lens_meta = lens_entities[0].get("metadata") or {}
        lens_text = lens_meta.get("prompt_template") or lens_meta.get("text") or lens_meta.get("prompt") or ""
    if not lens_text:
        lens_text = (
            "Evaluate architectural clarity, modularity, cohesion/coupling, naming, testability, documentation, "
            "and execution quality. Prefer clean, maintainable, well-structured designs aligned with the stated goals."
        )

    # Build identifiers list for rank
    idents = [{"pk_namespace": s["pk_namespace"], "pk": s["pk"]} for s in snapshots]
    rank = rank_entities(api, idents, api_key)
    unsorted = rank.get("unsorted", [])
    sorted_list = rank.get("sorted", [])

    # Helper to lookup entity metadata by identifier
    def get_entity_by_ident(ident: Dict) -> Dict:
        key = f"{ident['pk_namespace']}::{ident['pk']}"
        return child_map[key]

    votes_done = 0
    max_votes = int(args.count) if args.count else 1_000_000_000

    # Phase 1: single-edge inserts
    while not sorted_list and len(unsorted) >= 2 and votes_done < max_votes:
        a_ident = unsorted[0]
        b_ident = unsorted[1]
        a = get_entity_by_ident(a_ident)
        b = get_entity_by_ident(b_ident)
        a_meta = a.get("metadata") or {}
        b_meta = b.get("metadata") or {}
        print(f"[vote-llm][seed] Pair A={a_ident['pk']} ({a_meta.get('branch')}@{a_meta.get('commit_sha')}) vs B={b_ident['pk']} ({b_meta.get('branch')}@{b_meta.get('commit_sha')})")

        # Check if vote already exists for this pair
        if check_existing_vote_for_pair(api, a, b, api_key):
            print(f"[vote-llm][seed] Vote already exists for this pair, skipping...")
            votes_done += 1  # Still count as "done" since we're not processing it
            # Re-rank and continue
            rank = rank_entities(api, idents, api_key)
            unsorted = rank.get("unsorted", [])
            sorted_list = rank.get("sorted", [])
            continue

        messages_payload = build_prompt_for_pair(lens_text, a_meta, b_meta)
        if args.dry_run:
            print(json.dumps({"pair": [a_ident, b_ident], "prompt": messages_payload}, indent=2))
            return
        print(f"[vote-llm][seed] Calling LLM model={args.model} temp={args.temperature}")
        resp = call_openrouter_chat(args.model, llm_key, messages_payload["messages"], temperature=args.temperature)
        print("[vote-llm][seed] LLM response received")
        content = resp.get("choices", [{}])[0].get("message", {}).get("content", "")
        try:
            decision = parse_llm_decision(content, a_meta.get("branch"), b_meta.get("branch"))
        except Exception:
            # Single strict reprompt, then skip on failure
            reprompt = messages_payload["messages"] + [{
                "role": "user",
                "content": (
                    "Your previous response was invalid. Reply ONLY with a single JSON object: "
                    + "{\"winner\":\"" + str(a_meta.get("branch", "")).replace("\"", "'")
                    + "|" + str(b_meta.get("branch", "")).replace("\"", "'")
                    + "|tie\",\"score\":0..100,\"confidence\":0..1,\"rationale\":\"short reason using branch names\"}"
                )
            }]
            print("[vote-llm][seed] Reprompting due to invalid JSON...")
            resp = call_openrouter_chat(args.model, llm_key, reprompt, temperature=args.temperature)
            print("[vote-llm][seed] LLM response received (reprompt)")
            content = resp.get("choices", [{}])[0].get("message", {}).get("content", "")
            try:
                decision = parse_llm_decision(content, a_meta.get("branch"), b_meta.get("branch"))
            except Exception:
                print("[vote-llm][seed] Strict JSON parse failed twice; skipping this pair.")
                decision = None
        if not decision:
            # Skip posting a vote
            # Re-rank to see if other changes happened; then continue
            print("[vote-llm][seed] Re-ranking after skip...")
            rank = rank_entities(api, idents, api_key)
            unsorted = rank.get("unsorted", [])
            sorted_list = rank.get("sorted", [])
            # Continue with next step
            pass
        else:
            winner = decision["winner"]
            score = decision["score"]
            magnitude = magnitude_from_score(winner, score)
            # Post vote using A vs B; server canonicalizes
            payload = {
                "left_entity_pk_namespace": a_ident["pk_namespace"],
                "left_entity_pk": a_ident["pk"],
                "right_entity_pk_namespace": b_ident["pk_namespace"],
                "right_entity_pk": b_ident["pk"],
                "magnitude": magnitude,
                "rationale": decision.get("rationale"),
                "attribute_id": 1,
            }
            print(f"[vote-llm][seed] Decision winner={winner} score={score} magnitude={payload['magnitude']} -> POST /vote")
            http_post_json(f"{api}/vote", payload, headers=auth_headers(api_key))
            votes_done += 1

        # Re-rank after seeding
        print("[vote-llm][seed] Re-ranking after vote...")
        rank = rank_entities(api, idents, api_key)
        unsorted = rank.get("unsorted", [])
        sorted_list = rank.get("sorted", [])
        print(f"[vote-llm][seed] Rank: unsorted={len(unsorted)} sorted={len(sorted_list)}")

    # Insert remaining unsorted items with single comparison to an anchor
    while unsorted and votes_done < max_votes:
        anchor_idx = len(sorted_list) // 2 if sorted_list else 0
        anchor_ident = (sorted_list[anchor_idx]["identifier"] if sorted_list else unsorted[0])
        item_ident = unsorted[0]
        a = get_entity_by_ident(item_ident)
        b = get_entity_by_ident(anchor_ident)
        a_meta = a.get("metadata") or {}
        b_meta = b.get("metadata") or {}
        print(f"[vote-llm][insert] Item={item_ident['pk']} ({a_meta.get('branch')}@{a_meta.get('commit_sha')} bytes={a_meta.get('packed_bytes')}) vs Anchor={anchor_ident['pk']} ({b_meta.get('branch')}@{b_meta.get('commit_sha')} bytes={b_meta.get('packed_bytes')})")

        # Check if vote already exists for this pair
        if check_existing_vote_for_pair(api, a, b, api_key):
            print(f"[vote-llm][insert] Vote already exists for this pair, skipping...")
            votes_done += 1  # Still count as "done" since we're not processing it
            continue

        messages_payload = build_prompt_for_pair(lens_text, a_meta, b_meta)
        if args.dry_run:
            print(json.dumps({"pair": [item_ident, anchor_ident], "prompt": messages_payload}, indent=2))
            return
        print(f"[vote-llm][insert] Calling LLM model={args.model} temp={args.temperature}")
        resp = call_openrouter_chat(args.model, llm_key, messages_payload["messages"], temperature=args.temperature)
        print("[vote-llm][insert] LLM response received")
        content = resp.get("choices", [{}])[0].get("message", {}).get("content", "")
        try:
            decision = parse_llm_decision(content, a_meta.get("branch"), b_meta.get("branch"))
        except Exception:
            reprompt = messages_payload["messages"] + [{
                "role": "user",
                "content": (
                    "Your previous response was invalid. Reply ONLY with a single JSON object: "
                    + "{\"winner\":\"" + str(a_meta.get("branch", "")).replace("\"", "'")
                    + "|" + str(b_meta.get("branch", "")).replace("\"", "'")
                    + "|tie\",\"score\":0..100,\"confidence\":0..1,\"rationale\":\"short reason using branch names\"}"
                )
            }]
            print("[vote-llm][insert] Reprompting due to invalid JSON...")
            resp = call_openrouter_chat(args.model, llm_key, reprompt, temperature=args.temperature)
            print("[vote-llm][insert] LLM response received (reprompt)")
            content = resp.get("choices", [{}])[0].get("message", {}).get("content", "")
            try:
                decision = parse_llm_decision(content, a_meta.get("branch"), b_meta.get("branch"))
            except Exception:
                print("Strict JSON parse failed twice; skipping this insertion.")
                decision = None
        if not decision:
            print("[vote-llm][insert] Re-ranking after skip...")
            rank = rank_entities(api, idents, api_key)
            unsorted = rank.get("unsorted", [])
            sorted_list = rank.get("sorted", [])
            print(f"[vote-llm][insert] Rank: unsorted={len(unsorted)} sorted={len(sorted_list)}")
            continue
        winner = decision["winner"]
        score = decision["score"]
        magnitude = magnitude_from_score(winner, score)
        payload = {
            "left_entity_pk_namespace": item_ident["pk_namespace"],
            "left_entity_pk": item_ident["pk"],
            "right_entity_pk_namespace": anchor_ident["pk_namespace"],
            "right_entity_pk": anchor_ident["pk"],
            "magnitude": magnitude,
            "rationale": decision.get("rationale"),
            "attribute_id": 1,
        }
        print(f"[vote-llm][insert] Decision winner={winner} score={score} magnitude={payload['magnitude']} -> POST /vote")
        http_post_json(f"{api}/vote", payload, headers=auth_headers(api_key))
        votes_done += 1

        # Optionally re-rank in batches; keep simple: re-rank every insertion or when unsorted shrinks
        print("[vote-llm][insert] Re-ranking after vote...")
        rank = rank_entities(api, idents, api_key)
        unsorted = rank.get("unsorted", [])
        sorted_list = rank.get("sorted", [])
        print(f"[vote-llm][insert] Rank: unsorted={len(unsorted)} sorted={len(sorted_list)}")

    # Phase 2: run up to N adjacent sweeps, then stop (ignore remaining budget)
    if sorted_list and getattr(args, "sweeps", 1) > 0:
        for sweep_idx in range(int(getattr(args, "sweeps", 1))):
            prev_order = [e["identifier"] for e in sorted_list]
            swaps = 0
            print(f"[vote-llm][adjacent] Sweep {sweep_idx+1}/{args.sweeps} over {len(prev_order)} items (votes={votes_done}/{max_votes})")
            for i in range(1, len(prev_order)):
                if votes_done >= max_votes:
                    break
                left_ident = prev_order[i - 1]
                right_ident = prev_order[i]
                a = get_entity_by_ident(left_ident)
                b = get_entity_by_ident(right_ident)
                a_meta = a.get("metadata") or {}
                b_meta = b.get("metadata") or {}
                print(f"[vote-llm][adjacent] Pair {i}/{len(prev_order)-1}: {left_ident['pk']} ({a_meta.get('branch')}@{a_meta.get('commit_sha')}) vs {right_ident['pk']} ({b_meta.get('branch')}@{b_meta.get('commit_sha')})")

                # Check if vote already exists for this pair
                if check_existing_vote_for_pair(api, a, b, api_key):
                    print(f"[vote-llm][adjacent] Vote already exists for this pair, skipping...")
                    votes_done += 1  # Still count as "done" since we're not processing it
                    continue

                messages_payload = build_prompt_for_pair(lens_text, a_meta, b_meta)
                if args.dry_run:
                    print(json.dumps({"pair": [left_ident, right_ident], "prompt": messages_payload}, indent=2))
                    return
                print(f"[vote-llm][adjacent] Calling LLM model={args.model} temp={args.temperature}")
                resp = call_openrouter_chat(args.model, llm_key, messages_payload["messages"], temperature=args.temperature)
                print("[vote-llm][adjacent] LLM response received")
                content = resp.get("choices", [{}])[0].get("message", {}).get("content", "")
                try:
                    decision = parse_llm_decision(content, a_meta.get("branch"), b_meta.get("branch"))
                except Exception:
                    reprompt = messages_payload["messages"] + [{
                        "role": "user",
                        "content": (
                            "Your previous response was invalid. Reply ONLY with a single JSON object: "
                            + "{\"winner\":\"" + str(a_meta.get("branch", "")).replace("\"", "'")
                            + "|" + str(b_meta.get("branch", "")).replace("\"", "'")
                            + "|tie\",\"score\":0..100,\"confidence\":0..1,\"rationale\":\"short reason using branch names\"}"
                        )
                    }]
                    print("[vote-llm][adjacent] Reprompting due to invalid JSON...")
                    resp = call_openrouter_chat(args.model, llm_key, reprompt, temperature=args.temperature)
                    print("[vote-llm][adjacent] LLM response received (reprompt)")
                    content = resp.get("choices", [{}])[0].get("message", {}).get("content", "")
                    try:
                        decision = parse_llm_decision(content, a_meta.get("branch"), b_meta.get("branch"))
                    except Exception:
                        print("Strict JSON parse failed twice; skipping this adjacent pair.")
                        continue
                winner = decision["winner"]
                score = decision["score"]
                magnitude = magnitude_from_score(winner, score)
                if winner == "b":
                    swaps += 1
                payload = {
                    "left_entity_pk_namespace": left_ident["pk_namespace"],
                    "left_entity_pk": left_ident["pk"],
                    "right_entity_pk_namespace": right_ident["pk_namespace"],
                    "right_entity_pk": right_ident["pk"],
                    "magnitude": magnitude,
                    "rationale": decision.get("rationale"),
                    "attribute_id": 1,
                }
                print(f"[vote-llm][adjacent] Decision winner={winner} score={score} magnitude={payload['magnitude']} -> POST /vote")
                http_post_json(f"{api}/vote", payload, headers=auth_headers(api_key))
                votes_done += 1

            # Re-rank after sweep and decide whether to continue
            print("[vote-llm][adjacent] Re-ranking after sweep...")
            rank = rank_entities(api, idents, api_key)
            new_sorted = rank.get("sorted", [])
            new_order = [e["identifier"] for e in new_sorted]
            print(f"[vote-llm][adjacent] Sweep {sweep_idx+1} done. swaps={swaps} stable={new_order == prev_order}")
            sorted_list = new_sorted
            if swaps == 0 or new_order == prev_order:
                break

    print(f"[vote-llm] Complete. votes_cast={votes_done}")


def cmd_pair(args: argparse.Namespace) -> None:
    api = args.api.rstrip('/')
    params = {
        "pk_namespace": "gitsort.run",
        "pk": args.run_id,
    }
    if args.left_ns: params["left_pin_ns"] = args.left_ns
    if args.left_pk: params["left_pin_pk"] = args.left_pk
    if args.right_ns: params["right_pin_ns"] = args.right_ns
    if args.right_pk: params["right_pin_pk"] = args.right_pk
    # urllib doesn't have easy query builder here; just build manually
    from urllib.parse import urlencode
    url = f"{api}/pair?{urlencode(params)}"
    data = http_get_json(url, headers=auth_headers(args.api_key or os.environ.get("SORTER_API_KEY")))
    left = data.get("left_entity", {})
    right = data.get("right_entity", {})
    print(json.dumps({"left": left, "right": right}, indent=2))


def cmd_rank(args: argparse.Namespace) -> None:
    api = args.api.rstrip('/')
    # Fetch run with children
    run = http_get_json(
        f"{api}/entity/gitsort.run/{args.run_id}?children=true",
        headers=auth_headers(args.api_key or os.environ.get("SORTER_API_KEY")),
    )
    children = run.get("children") or run.get("entity", {}).get("children") or []
    # Depending on response structure, normalize
    entities = []
    for e in children:
        entities.append({"pk_namespace": e["pk_namespace"], "pk": e["pk"]})
    if not entities:
        print("No child entities found for run.")
        return
    resp = http_post_json(f"{api}/rank", entities, headers=auth_headers(args.api_key or os.environ.get("SORTER_API_KEY")))
    print(json.dumps(resp, indent=2))


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
    pp.add_argument("--append", action="store_true", help="Append to an existing out dir: reuse run_id and update run_config; pack only specified branches or all local if none specified")
    pp.add_argument("--model", default="openai/gpt-4o", help="Model identifier for later voting")
    pp.add_argument("--lens", default="architectural_vision_v1", help="Lens primary key")
    pp.add_argument("--api", default=DEFAULT_API_BASE, help="API base URL to embed in config")
    pp.set_defaults(func=cmd_prepare)

    # ingest
    pi = sub.add_parser("ingest", help="Create entities and relationships from prepared artifacts")
    pi.add_argument("--dir", required=True, help="Path to prepare output directory containing run_config.json")
    pi.add_argument("--api", default=DEFAULT_API_BASE, help="API base URL")
    pi.add_argument("--api-key", help="API key, or set SORTER_API_KEY env var")
    pi.add_argument("--lens", help="Lens pk if not in config")
    pi.set_defaults(func=cmd_ingest)

    # pair
    pr = sub.add_parser("pair", help="Fetch a random pair from a run's children")
    pr.add_argument("--run-id", required=True, help="Run ID (gitsort.run pk)")
    pr.add_argument("--api", default=DEFAULT_API_BASE, help="API base URL")
    pr.add_argument("--api-key", help="API key, or set SORTER_API_KEY env var")
    pr.add_argument("--left-ns")
    pr.add_argument("--left-pk")
    pr.add_argument("--right-ns")
    pr.add_argument("--right-pk")
    pr.set_defaults(func=cmd_pair)

    # rank
    rk = sub.add_parser("rank", help="Rank a run's children using accumulated votes")
    rk.add_argument("--run-id", required=True)
    rk.add_argument("--api", default=DEFAULT_API_BASE)
    rk.add_argument("--api-key", help="API key, or set SORTER_API_KEY env var")
    rk.set_defaults(func=cmd_rank)

    # vote-llm
    vl = sub.add_parser("vote-llm", help="Automate voting via LLM using lens and snapshots")
    vl.add_argument("--run-id", required=True)
    vl.add_argument("--api", default=DEFAULT_API_BASE)
    vl.add_argument("--api-key", help="API key for Rust server, or SORTER_API_KEY env var")
    vl.add_argument("--provider", default="openrouter")
    vl.add_argument("--model", default="openai/gpt-4o")
    vl.add_argument("--llm-key-env", default="OPENROUTER_API_KEY", help="Env var containing provider API key")
    vl.add_argument("--temperature", type=float, default=0.1)
    vl.add_argument("--count", type=int, help="Max votes to cast (spanning tree + sweeps)")
    vl.add_argument("--sweeps", type=int, default=1, help="Number of adjacent sweeps in phase 2 (default: %(default)s)")
    vl.add_argument("--dry-run", action="store_true")
    vl.add_argument("--lens-text", help="Override lens prompt text if lens entity has none")
    vl.set_defaults(func=cmd_vote_llm)

    return p


def main(argv: Optional[List[str]] = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
