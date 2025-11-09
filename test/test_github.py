"""
Tests for GitHub integration API endpoints.
"""

import pytest
from util import make_request


@pytest.mark.asyncio
async def test_github_ingest_repository():
    """Test ingesting a GitHub repository and its issues."""
    # Use a simple, public repository for testing
    payload = {
        "owner": "octocat",
        "repo": "Hello-World"
    }

    # Clean up first in case entity exists
    try:
        await make_request("DELETE", "/entity/github.repo/octocat%2FHello-World", is_authenticated=True, assert_status_code=[204, 404])
        # Clean up any existing issues
        list_response = await make_request("GET", "/entity", params={"ns": "github.issue"}, is_authenticated=True)
        entities = list_response.json()
        for entity in entities:
            if entity["pk"].startswith("octocat/Hello-World#"):
                pk_encoded = entity["pk"].replace("/", "%2F").replace("#", "%23")
                await make_request("DELETE", f"/entity/github.issue/{pk_encoded}", is_authenticated=True, assert_status_code=[204, 404])
    except Exception as e:
        print(f"Cleanup warning: {e}")

    response = await make_request("POST", "/github/ingest", json_payload=payload, is_authenticated=True)
    data = response.json()

    # Check that response has expected structure
    assert "repo_ns" in data
    assert "repo_pk" in data
    assert "issues_ingested" in data
    assert "message" in data

    assert data["repo_ns"] == "github.repo"
    assert data["repo_pk"] == "octocat/Hello-World"
    assert isinstance(data["issues_ingested"], int)
    assert data["issues_ingested"] >= 0
    assert "octocat/Hello-World" in data["message"]

    # Verify the repository entity was created
    repo_response = await make_request("GET", "/entity/github.repo/octocat%2FHello-World", is_authenticated=True)
    repo_data = repo_response.json()["entity"]

    assert repo_data["ns"] == "github.repo"
    assert repo_data["pk"] == "octocat/Hello-World"
    assert repo_data["title"] is not None
    assert "octocat/Hello-World" in repo_data["title"]
    assert repo_data["metadata"] is not None

    # Verify metadata contains GitHub API response
    metadata = repo_data["metadata"]
    assert "id" in metadata
    assert "name" in metadata
    assert "full_name" in metadata
    assert metadata["full_name"] == "octocat/Hello-World"

    # Clean up
    try:
        await make_request("DELETE", "/entity/github.repo/octocat%2FHello-World", is_authenticated=True, assert_status_code=[204, 404])

        # Clean up any issues that were created
        if data["issues_ingested"] > 0:
            # List entities to find issues created
            list_response = await make_request("GET", "/entity", params={"ns": "github.issue"}, is_authenticated=True)
            entities = list_response.json()

            for entity in entities:
                if entity["pk"].startswith("octocat/Hello-World"):
                    pk_encoded = entity["pk"].replace("/", "%2F").replace("#", "%23")
                    await make_request("DELETE", f"/entity/github.issue/{pk_encoded}", is_authenticated=True, assert_status_code=[204, 404])
    except Exception as e:
        print(f"Cleanup warning: {e}")


@pytest.mark.asyncio
async def test_github_ingest_requires_authentication():
    """Test that GitHub ingest requires authentication."""
    payload = {
        "owner": "octocat",
        "repo": "Hello-World"
    }

    response = await make_request("POST", "/github/ingest", json_payload=payload, assert_status_code=401)
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_github_ingest_invalid_repository():
    """Test ingesting a non-existent repository."""
    payload = {
        "owner": "nonexistent-user-12345",
        "repo": "nonexistent-repo-12345"
    }

    response = await make_request("POST", "/github/ingest", json_payload=payload, is_authenticated=True, assert_status_code=400)
    assert response.status_code == 400

    data = response.json()
    assert "error" in data
    assert "Failed to fetch repository" in data["error"]


@pytest.mark.asyncio
async def test_github_ingest_missing_fields():
    """Test GitHub ingest with missing required fields."""
    # Missing repo field
    payload = {
        "owner": "octocat"
    }

    response = await make_request("POST", "/github/ingest", json_payload=payload, is_authenticated=True, assert_status_code=422)
    assert response.status_code == 422

    # Missing owner field
    payload = {
        "repo": "Hello-World"
    }

    response = await make_request("POST", "/github/ingest", json_payload=payload, is_authenticated=True, assert_status_code=422)
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_github_entities_in_list():
    """Test that ingested GitHub entities appear in entity lists."""
    payload = {
        "owner": "octocat",
        "repo": "Hello-World"
    }

    try:
        # Ingest repository
        response = await make_request("POST", "/github/ingest", json_payload=payload, is_authenticated=True)
        data = response.json()

        # Check repository appears in github.repo namespace list
        repo_list = await make_request("GET", "/entity", params={"ns": "github.repo"}, is_authenticated=True)
        repo_entities = repo_list.json()

        repo_found = False
        for entity in repo_entities:
            if entity["pk"] == "octocat/Hello-World":
                repo_found = True
                break

        assert repo_found, "Repository should appear in github.repo entity list"

        # If issues were ingested, check they appear in github.issue namespace list
        if data["issues_ingested"] > 0:
            issue_list = await make_request("GET", "/entity", params={"ns": "github.issue"}, is_authenticated=True)
            issue_entities = issue_list.json()

            issue_found = False
            for entity in issue_entities:
                if entity["pk"].startswith("octocat/Hello-World#"):
                    issue_found = True
                    break

            assert issue_found, "At least one issue should appear in github.issue entity list"

    finally:
        # Clean up
        try:
            await make_request("DELETE", "/entity/github.repo/octocat%2FHello-World", is_authenticated=True, assert_status_code=[204, 404])

            # Clean up any issues
            list_response = await make_request("GET", "/entity", params={"ns": "github.issue"}, is_authenticated=True)
            entities = list_response.json()

            for entity in entities:
                if entity["pk"].startswith("octocat/Hello-World"):
                    pk_encoded = entity["pk"].replace("/", "%2F").replace("#", "%23")
                    await make_request("DELETE", f"/entity/github.issue/{pk_encoded}", is_authenticated=True, assert_status_code=[204, 404])
        except Exception as e:
            print(f"Cleanup warning: {e}")