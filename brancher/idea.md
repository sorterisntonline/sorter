Of course. Let's design the fastest, most robust path to achieving your Gitsorter vision using the specified components: the `branchsorter` API, an external `repomix` command, and a new orchestrating CLI.

This is an excellent problem because it forces us to design a robust entity schema that can be manipulated by a simple, powerful command-line tool. The architecture of the `xrpsorter` CLI provides a perfect template for this.

### The Goal: A Gitsorter CLI

We will design a Python CLI tool named `gitsorter`. This tool will be the "user" of your `branchsorter` Sorter API. It will be responsible for preparing the code, ingesting it as entities, orchestrating the AI voting, and fetching the final results.

This approach requires **zero changes to your existing Rust backend**, using it purely as a generic ranking engine via its REST API.

---

### Part 1: The Robust Entity Schema

This is the most critical part. We need a schema that is clear, auditable, and fits the generic entity model of the `branchsorter` backend.

Here is the proposed entity structure:

| Entity Type | Namespace (`ns`) | Primary Key (`pk`) | Title | Metadata | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Sorting Run** | `gitsort.run` | A unique UUID for the run (e.g., `uuid4()`). | A user-friendly name for the run (e.g., "Sorter Vision Comparison - 2024-08-08"). | The `run_config.json` content: branches, model, lens PK, etc. | The top-level container for a specific sorting job. Acts like a "tag". |
| **Branch Blob** | `gitsort.branch` | `{run_uuid}:{branch_name}` (e.g., `uuid:reddit`). | The branch name (e.g., "reddit"). | `{"packed_code": "...", "repomix_output": "..."}`. The full packed code blob. | Represents one of the items to be sorted. Each branch is a distinct item. |
| **The Lens** | `gitsort.lens` | A stable, semantic name (e.g., `architectural_vision_v1`). | A human-readable title (e.g., "Architectural Vision & Execution Lens"). | `{"prompt_template": "You are a..."}`. The full LLM prompt template. | The criteria for the sorting job. An entity that represents the *goal* of the sort. |

**Relationships (`entity_relationships` table):**
This schema creates a clean, hierarchical structure:
*   `gitsort.run` **(parent)** -> `gitsort.branch` **(child)**: Links each branch entity to its specific sorting run.
*   `gitsort.run` **(parent)** -> `gitsort.lens` **(child)**: Links the run to the specific lens used, for perfect auditability.

This is robust because every sort is isolated within its own `gitsort.run` container, and the exact code blob (`gitsort.branch`) and criteria (`gitsort.lens`) are stored as immutable entities.

---

### Part 2: The `gitsorter` CLI Design

We will structure our CLI using the same successful, multi-stage, artifact-driven pattern from `xrpsorter`.

#### `gitsorter_cli.py`

```python
import click
import subprocess
import os
import json
import httpx
import uuid
from itertools import combinations
import xml.etree.ElementTree as ET

# --- CONFIG ---
SORTER_API_URL = "http://localhost:8081/api"
API_KEY = "STATIC_TEST_KEY_FOR_ADMIN_USER_123" # From branchsorter
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY")

# The strategic prompt for comparing codebases.
CODEBASE_LENS_PROMPT = """
You are a principal software engineer and product strategist...
Evaluate the two codebases <A> and <B> on architectural clarity, vision, and execution quality.
...
Your response MUST include the line "SCORE: [your score]" at the end.
"""

# --- API Helper ---
def make_api_request(method, endpoint, json=None,
    # ... same as the previous Python script ...

@click.group()
def cli():
    """Gitsorter: A CLI to sort codebases using the Sorter API."""
    pass

# --- 1. PREPARE ---
@cli.command()
@click.option('--run-name', required=True, help="A name for this sorting run.")
@click.option('--branch', 'branches', multiple=True, required=True, help="Git branches to compare.")
@click.option('--model', default='openai/gpt-4o', help="LLM model for voting.")
@click.option('--out', 'out_dir', required=True, type=click.Path(), help="Output directory for run artifacts.")
def prepare(run_name, branches, model, out_dir):
    """Prepares a run by fetching codebases via repomix."""
    os.makedirs(out_dir, exist_ok=True)
    run_id = str(uuid.uuid4())

    print(f"🚀 Preparing run '{run_name}' (ID: {run_id})")
    
    # 1. Create run_config.json
    config = {
        "run_id": run_id,
        "run_name": run_name,
        "branches": list(branches),
        "model": model,
        "lens_pk": "architectural_vision_v1", # The PK for our gitsort.lens entity
        "prompt": CODEBASE_LENS_PROMPT,
    }
    with open(os.path.join(out_dir, "run_config.json"), "w") as f:
        json.dump(config, f, indent=2)

    # 2. Use npx repomix to generate XML files for each branch
    for branch in branches:
        xml_path = os.path.join(out_dir, f"{branch}.xml")
        print(f"📦 Packing branch '{branch}' into {xml_path}...")
        subprocess.run(
            ['npx', 'repomix', '--o', xml_path, '--branch', branch],
            check=True
        )
    print("✅ Preparation complete.")


# --- 2. INGEST ---
@cli.command()
@click.option('--run-dir', required=True, type=click.Path(exists=True))
def ingest(run_dir):
    """Ingests prepared codebases into Sorter as entities."""
    config_path = os.path.join(run_dir, "run_config.json")
    with open(config_path, 'r') as f:
        config = json.load(f)

    run_id = config['run_id']
    
    # 1. Create parent `gitsort.run` entity
    run_ns = "gitsort.run"
    run_pk = run_id
    print(f"📤 Ingesting run: {run_ns}:{run_pk}")
    make_api_request("POST", "/entity", json={
        "ns": run_ns, "pk": run_pk, "title": config['run_name'], "metadata": config
    })

    # 2. Create `gitsort.lens` entity
    lens_ns = "gitsort.lens"
    lens_pk = config['lens_pk']
    make_api_request("POST", "/entity", json={
        "ns": lens_ns, "pk": lens_pk, "title": "Architectural Vision Lens",
        "metadata": {"prompt_template": config['prompt']}
    })

    entity_map = {}
    for branch in config['branches']:
        xml_path = os.path.join(run_dir, f"{branch}.xml")
        with open(xml_path, 'r') as f:
            xml_content = f.read()
        
        # Repomix XML has a <contents> tag. We just want the raw content.
        # This parsing is simple and robust enough.
        packed_code = ET.fromstring(xml_content).find('contents').text
        
        # 3. Create `gitsort.branch` entity
        branch_ns = "gitsort.branch"
        branch_pk = f"{run_id}:{branch}"
        print(f"📤 Ingesting branch: {branch_ns}:{branch_pk}")
        make_api_request("POST", "/entity", json={
            "ns": branch_ns, "pk": branch_pk, "title": branch,
            "metadata": {"packed_code": packed_code}
        })
        entity_map[branch] = {"ns": branch_ns, "pk": branch_pk}
        
        # 4. Create relationships
        make_api_request("POST", "/entity_relationships", json={
            "parent_ns": run_ns, "parent_pk": run_pk,
            "child_ns": branch_ns, "child_pk": branch_pk
        })

    with open(os.path.join(run_dir, "entity_map.json"), "w") as f:
        json.dump(entity_map, f, indent=2)

    print("✅ Ingestion complete.")


# --- 3. VOTE ---
@cli.command()
@click.option('--run-dir', required=True, type=click.Path(exists=True))
def vote(run_dir):
    """Runs AI voting on ingested branches."""
    # ... load config and entity_map ...
    config = json.load(open(os.path.join(run_dir, "run_config.json")))
    entity_map = json.load(open(os.path.join(run_dir, "entity_map.json")))

    # THE `branchsorter` API VOTE-TABLE WORKAROUND
    # We must create a dummy attribute to link votes to.
    ATTRIBUTE_ID_FOR_GITSORT = 100 
    ATTRIBUTE_SLUG = "gitsort_strategic_vision"
    print(f"🔧 Ensuring dummy attribute exists for voting (ID: {ATTRIBUTE_ID_FOR_GITSORT})...")
    # This endpoint needs to be added to the `branchsorter` backend
    make_api_request("POST", "/attribute", json={
        "id": ATTRIBUTE_ID_FOR_GITSORT, "slug": ATTRIBUTE_SLUG, "description": "AI codebase evals"
    })

    pairs = list(combinations(config['branches'], 2))
    votes_log_path = os.path.join(run_dir, "votes.jsonl")

    # ... (Resumability logic by checking votes_log_path) ...

    for branch_a, branch_b in pairs:
        # Fetch packed code from local XML file (faster than API)
        code_a = ET.parse(os.path.join(run_dir, f"{branch_a}.xml")).find('contents').text
        code_b = ET.parse(os.path.join(run_dir, f"{branch_b}.xml")).find('contents').text
        
        score, rationale = get_ai_vote(code_a, code_b, config['model'])
        
        # POST the vote to the `branchsorter` API
        entity_a = entity_map[branch_a]
        entity_b = entity_map[branch_b]
        
        vote_payload = {
            "left_entity_ns": entity_a["ns"],
            "left_entity_pk": entity_a["pk"],
            "right_entity_ns": entity_b["ns"],
            "right_entity_pk": entity_b["pk"],
            "magnitude": score,
            "attribute_id": ATTRIBUTE_ID_FOR_GITSORT, # Use our dummy attribute ID
        }
        make_api_request("POST", "/vote", json=vote_payload)
        
        # ... (Log to votes.jsonl) ...
    print("✅ Voting complete.")


# --- 4. RANK & REPORT ---
@cli.command()
@click.option('--run-dir', required=True, type=click.Path(exists=True))
def rank(run_dir):
    """Gets the final rankings from the Sorter API."""
    entity_map = json.load(open(os.path.join(run_dir, "entity_map.json")))
    
    rank_payload = [details for details in entity_map.values()]
    
    response = make_api_request("POST", "/rank", json=rank_payload)
    
    print("\n\n🏆🏆🏆 FINAL RANKINGS 🏆🏆🏆")
    # ... (Pretty print the results from the response) ...


# ... (Helper functions like get_ai_vote go here) ...

if __name__ == '__main__':
    cli()
```

### The Workflow in Action

This design results in a beautifully simple and powerful user workflow:

1.  **Prepare the arena:**
    ```bash
    gitsorter prepare \
      --run-name "Sorter Vision Comparison" \
      --branch blobbed \
      --branch llmvoter \
      --branch reddit \
      --out ./runs/sorter_vision_01
    ```
    This creates `runs/sorter_vision_01/` and populates it with `run_config.json` and the three `.xml` files from `repomix`.

2.  **Upload the contenders:**
    ```bash
    gitsorter ingest --run-dir ./runs/sorter_vision_01
    ```
    This connects to your `branchsorter` API, creates all the necessary entities (`run`, `branch`, `lens`) and their relationships.

3.  **Let the games begin:**
    ```bash
    export OPENROUTER_API_KEY="sk-..."
    gitsorter vote --run-dir ./runs/sorter_vision_01
    ```
    The CLI orchestrates the AI voting, comparing all three branches (`blobbed` vs `llmvoter`, `blobbed` vs `reddit`, `llmvoter` vs `reddit`) and posting the votes to your Sorter API.

4.  **Announce the winner:**
    ```bash
    gitsorter rank --run-dir ./runs/sorter_vision_01
    ```
    This queries the `/rank` endpoint with the three `gitsort.branch` entity identifiers and prints the final, definitive ranking of your three architectural visions.

This is the fastest, most direct path to bringing Gitsorter to life. It reuses your existing backend perfectly and provides a clean, professional CLI experience.
