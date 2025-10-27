"""
Tests for entity pool management API endpoints.
"""

import pytest
from util import make_request


@pytest.mark.asyncio
async def test_pool_status_unclassified_by_default():
    """Test that entities start as unclassified (NULL) by default."""
    # Create a test entity first
    entity_data = {
        "ns": "test",
        "pk": "pool_test_entity",
        "title": "Test Entity for Pool"
    }
    
    try:
        # Clean up any existing entity first
        await make_request("DELETE", "/entity/test/pool_test_entity", is_authenticated=True, assert_status_code=[204, 404])
        
        await make_request("POST", "/entity", json_payload=entity_data, is_authenticated=True, assert_status_code=201)
        
        # Check pool status - should be unclassified by default
        response = await make_request("GET", "/pool/test/pool_test_entity", is_authenticated=True)
        data = response.json()
        
        assert data["entity_ns"] == "test"
        assert data["entity_pk"] == "pool_test_entity"
        assert data["status"] == "unclassified"
        assert data["status_updated_at"] is None
    finally:
        # Clean up
        await make_request("DELETE", "/entity/test/pool_test_entity", is_authenticated=True, assert_status_code=[204, 404])


@pytest.mark.asyncio
async def test_add_entity_to_pool():
    """Test adding an entity to the pool (in_pool = true)."""
    # Create a test entity
    entity_data = {
    "ns": "test",
    "pk": "pool_add_test",
    "title": "Test Entity for Adding"
    }
    
    await make_request("POST", "/entity", json_payload=entity_data, is_authenticated=True, assert_status_code=201)
    
    # Add to pool
    response = await make_request("POST", "/pool/test/pool_add_test/add", is_authenticated=True)
    data = response.json()
    
    assert data["entity_ns"] == "test"
    assert data["entity_pk"] == "pool_add_test"
    assert data["status"] == "in_pool"
    assert data["status_updated_at"] is not None
    
    # Verify status persists
    response = await make_request("GET", "/pool/test/pool_add_test", is_authenticated=True)
    data = response.json()
    assert data["status"] == "in_pool"


@pytest.mark.asyncio
async def test_block_entity_from_pool():
    """Test blocking an entity from the pool (in_pool = false)."""
    # Create a test entity
    entity_data = {
        "ns": "test",
        "pk": "pool_block_test",
        "title": "Test Entity for Blocking"
    }
    
    await make_request("POST", "/entity", json_payload=entity_data, is_authenticated=True, assert_status_code=201)
    
    # Block from pool
    response = await make_request("POST", "/pool/test/pool_block_test/block", is_authenticated=True)
    data = response.json()
    
    assert data["entity_ns"] == "test"
    assert data["entity_pk"] == "pool_block_test"
    assert data["status"] == "blocked"
    assert data["status_updated_at"] is not None


@pytest.mark.asyncio
async def test_remove_entity_from_pool():
    """Test removing an entity from pool (delete record, return to NULL)."""
    # Create a test entity
    entity_data = {
        "ns": "test",
        "pk": "pool_remove_test",
        "title": "Test Entity for Removing"
    }
    
    await make_request("POST", "/entity", json_payload=entity_data, is_authenticated=True, assert_status_code=201)
    
    # First add to pool
    await make_request("POST", "/pool/test/pool_remove_test/add", is_authenticated=True)
    
    # Then remove from pool
    response = await make_request("DELETE", "/pool/test/pool_remove_test/remove", is_authenticated=True)
    data = response.json()
    
    assert data["entity_ns"] == "test"
    assert data["entity_pk"] == "pool_remove_test"
    assert data["status"] == "unclassified"
    assert data["status_updated_at"] is None


@pytest.mark.asyncio
async def test_pool_status_transitions():
    """Test all pool status transitions work correctly."""
    # Create a test entity
    entity_data = {
        "ns": "test",
        "pk": "pool_transition_test",
        "title": "Test Entity for Transitions"
    }
    
    await make_request("POST", "/entity", json_payload=entity_data, is_authenticated=True, assert_status_code=201)
    
    # Start: unclassified
    response = await make_request("GET", "/pool/test/pool_transition_test", is_authenticated=True)
    assert response.json()["status"] == "unclassified"
    
    # Add to pool: unclassified -> in_pool
    await make_request("POST", "/pool/test/pool_transition_test/add", is_authenticated=True)
    response = await make_request("GET", "/pool/test/pool_transition_test", is_authenticated=True)
    assert response.json()["status"] == "in_pool"
    
    # Block from pool: in_pool -> blocked
    await make_request("POST", "/pool/test/pool_transition_test/block", is_authenticated=True)
    response = await make_request("GET", "/pool/test/pool_transition_test", is_authenticated=True)
    assert response.json()["status"] == "blocked"
    
    # Remove from pool: blocked -> unclassified
    await make_request("DELETE", "/pool/test/pool_transition_test/remove", is_authenticated=True)
    response = await make_request("GET", "/pool/test/pool_transition_test", is_authenticated=True)
    assert response.json()["status"] == "unclassified"
    
    # Direct block from unclassified: unclassified -> blocked
    await make_request("POST", "/pool/test/pool_transition_test/block", is_authenticated=True)
    response = await make_request("GET", "/pool/test/pool_transition_test", is_authenticated=True)
    assert response.json()["status"] == "blocked"
    
    # Add to pool from blocked: blocked -> in_pool  
    await make_request("POST", "/pool/test/pool_transition_test/add", is_authenticated=True)
    response = await make_request("GET", "/pool/test/pool_transition_test", is_authenticated=True)
    assert response.json()["status"] == "in_pool"


@pytest.mark.asyncio
async def test_batch_pool_operations():
    """Test batch operations for pool management."""
    # Create test entities
    test_entities = []
    for i in range(3):
        entity_data = {
            "ns": "test",
            "pk": f"batch_test_{i}",
            "title": f"Batch Test Entity {i}"
        }
        await make_request("POST", "/entity", json_payload=entity_data, is_authenticated=True, assert_status_code=201)
        test_entities.append((entity_data["ns"], entity_data["pk"]))
    
    # Prepare batch operations
    batch_request = {
        "operations": [
            {"entity_ns": "test", "entity_pk": "batch_test_0", "action": "add"},
            {"entity_ns": "test", "entity_pk": "batch_test_1", "action": "block"},
            {"entity_ns": "test", "entity_pk": "batch_test_2", "action": "add"},
        ]
    }
    
    # Execute batch operations
    response = await make_request("POST", "/pool/batch", json_payload=batch_request, is_authenticated=True)
    result = response.json()
    
    assert result["success_count"] == 3
    assert len(result["failed_operations"]) == 0
    
    # Verify the operations were applied correctly
    response = await make_request("GET", "/pool/test/batch_test_0", is_authenticated=True)
    assert response.json()["status"] == "in_pool"
    
    response = await make_request("GET", "/pool/test/batch_test_1", is_authenticated=True)
    assert response.json()["status"] == "blocked"
    
    response = await make_request("GET", "/pool/test/batch_test_2", is_authenticated=True)
    assert response.json()["status"] == "in_pool"


@pytest.mark.asyncio
async def test_list_pool_entities():
    """Test listing entities with their pool status."""
    # Create test entities with different statuses
    entities = [
        ("test", "pool_list_1", "in_pool"),
        ("test", "pool_list_2", "blocked"), 
        ("test", "pool_list_3", "unclassified"),
        ("test", "pool_list_4", "in_pool"),
    ]
    
    for ns, pk, status in entities:
        entity_data = {"ns": ns, "pk": pk, "title": f"List Test Entity {pk}"}
        await make_request("POST", "/entity", json_payload=entity_data, is_authenticated=True, assert_status_code=201)
        
        if status == "in_pool":
            await make_request("POST", f"/pool/{ns}/{pk}/add", is_authenticated=True)
        elif status == "blocked":
            await make_request("POST", f"/pool/{ns}/{pk}/block", is_authenticated=True)
        # unclassified entities need no action
    
    # List entities with test namespace
    response = await make_request("GET", "/pool/list", params={"ns": "test"}, is_authenticated=True)
    entities_data = response.json()
    
    assert len(entities_data) >= 4
    
    # Check that our test entities have the correct status
    entity_statuses = {e["pk"]: e["pool_status"] for e in entities_data if e["pk"].startswith("pool_list_")}
    
    assert entity_statuses.get("pool_list_1") == "in_pool"
    assert entity_statuses.get("pool_list_2") == "blocked"
    assert entity_statuses.get("pool_list_3") == "unclassified"
    assert entity_statuses.get("pool_list_4") == "in_pool"


@pytest.mark.asyncio
async def test_pool_operations_require_authentication():
    """Test that pool operations require authentication."""
    # All pool operations should require authentication
    responses = []
    
    # Test each endpoint without authentication
    responses.append(await make_request("GET", "/pool/test/entity", assert_status_code=401))
    responses.append(await make_request("POST", "/pool/test/entity/add", assert_status_code=401))
    responses.append(await make_request("POST", "/pool/test/entity/block", assert_status_code=401))
    responses.append(await make_request("DELETE", "/pool/test/entity/remove", assert_status_code=401))
    responses.append(await make_request("GET", "/pool/list", assert_status_code=401))
    responses.append(await make_request("POST", "/pool/batch", json_payload={"operations": []}, assert_status_code=401))
    
    # All responses should be 401
    for response in responses:
        assert response.status_code == 401
