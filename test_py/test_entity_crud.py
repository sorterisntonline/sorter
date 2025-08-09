import httpx
import pytest
import uuid
import time
from typing import Dict, Any, Optional, Tuple

from util import make_request

# --- Helper Functions ---

async def cleanup_entity(ns: str, pk: str):
    """Attempts to delete an entity, ignoring errors if it's already gone."""
    print(f"Cleanup Attempt: Deleting entity {ns}/{pk}")
    await make_request("DELETE", f"/entity/{ns}/{pk}", is_authenticated=True, assert_status_code=204)

async def cleanup_relationship(parent_ns: str, parent_pk: str, child_ns: str, child_pk: str):
    """Attempts to delete a relationship, ignoring errors."""
    params = {
        "parent_pk_namespace": parent_ns,
        "parent_pk": parent_pk,
        "child_pk_namespace": child_ns,
        "child_pk": child_pk,
    }
    print(f"Cleanup Attempt: Deleting relationship {parent_ns}/{parent_pk} -> {child_ns}/{child_pk}")
    await make_request("DELETE", "/relationships", params=params, is_authenticated=True)


# --- Test Suite Marker ---
# Use a class to group related tests and manage state if needed
@pytest.mark.asyncio
@pytest.mark.dependency()
class TestEntityCrud:
    # Class variables to store state for dependent tests
    created_entity_ns: str | None = None
    created_entity_pk: str | None = None

    @pytest.mark.dependency()
    async def test_create_entity_success(self):
        """Tests successfully creating a new entity."""
        ns = "test.namespace"
        pk = f"test_pk_{uuid.uuid4()}"
        payload = {
            "pk_namespace": ns,
            "pk": pk,
            "title": "My Test Entity",
            "metadata": {"key": "value", "num": 123}
        }
        data = (await make_request("POST", "/entity", json_payload=payload, is_authenticated=True, assert_status_code=201)).json()

        assert data["pk_namespace"] == ns
        assert data["pk"] == pk
        assert data["title"] == "My Test Entity"
        assert data["metadata"] == {"key": "value", "num": 123}
        assert "created_at" in data

        # Store for subsequent tests
        TestEntityCrud.created_entity_ns = ns
        TestEntityCrud.created_entity_pk = pk
        print(f"Created entity: {ns}/{pk}")

    @pytest.mark.dependency(depends=["TestEntityCrud::test_create_entity_success"])
    async def test_create_entity_conflict(self):
        """Tests creating an entity with the same primary key (namespace + pk)."""
        assert TestEntityCrud.created_entity_ns is not None
        assert TestEntityCrud.created_entity_pk is not None
        payload = { # Use the same PKs as the successfully created entity
            "pk_namespace": TestEntityCrud.created_entity_ns,
            "pk": TestEntityCrud.created_entity_pk,
            "title": "Attempt to duplicate",
            "metadata": {}
        }
        data = (await make_request("POST", "/entity", json_payload=payload, is_authenticated=True, assert_status_code=409)).json()
        assert "already exists" in data.get("error", "").lower()

    @pytest.mark.dependency()
    async def test_create_entity_no_auth(self):
        """Tests creating an entity without authentication."""
        payload = {
            "pk_namespace": "noauth.ns",
            "pk": f"noauth_pk_{uuid.uuid4()}",
            "title": "No Auth Test",
            "metadata": None
        }
        await make_request("POST", "/entity", json_payload=payload, assert_status_code=401)

    @pytest.mark.dependency()
    async def test_create_entity_invalid_payload(self):
        """Tests creating an entity with missing required fields (e.g., pk)."""
        payload = {
            "pk_namespace": "invalid.ns",
            # Missing "pk"
            "title": "Invalid Payload"
        }
        # Axum's Json extractor usually returns 400 for missing fields in strict structs
        # or 422 if using specific validation layers
        data = (await make_request("POST", "/entity", json_payload=payload, is_authenticated=True, assert_status_code=[400, 422])).json()
        assert "error" in data

    # --- Read Tests ---
    @pytest.mark.dependency(depends=["TestEntityCrud::test_create_entity_success"])
    async def test_get_entity_success(self):
        """Tests successfully retrieving the created entity."""
        assert TestEntityCrud.created_entity_ns is not None
        assert TestEntityCrud.created_entity_pk is not None
        ns = TestEntityCrud.created_entity_ns
        pk = TestEntityCrud.created_entity_pk

        data = (await make_request("GET", f"/entity/{ns}/{pk}", is_authenticated=True, assert_status_code=200)).json()
        data = data["entity"]
        assert data["pk_namespace"] == ns
        assert data["pk"] == pk
        assert data["title"] == "My Test Entity" # Title from creation
        assert data["metadata"] == {"key": "value", "num": 123} # Metadata from creation

    @pytest.mark.dependency()
    async def test_get_entity_not_found(self):
        """Tests retrieving a non-existent entity."""
        ns = "nonexistent.ns"
        pk = f"nonexistent_pk_{uuid.uuid4()}"
        data = (await make_request("GET", f"/entity/{ns}/{pk}", is_authenticated=True, assert_status_code=404)).json()
        assert "not found" in data.get("error", "").lower()

    # --- List Tests ---
    @pytest.mark.dependency(depends=["TestEntityCrud::test_create_entity_success"])
    async def test_list_entities_success(self):
        """Tests listing entities and finding the created one."""
        assert TestEntityCrud.created_entity_ns is not None
        assert TestEntityCrud.created_entity_pk is not None
        ns = TestEntityCrud.created_entity_ns
        pk = TestEntityCrud.created_entity_pk

        data = (await make_request("GET", "/entity", is_authenticated=True, assert_status_code=200)).json()
        assert isinstance(data, list)

        found = False
        for entity in data:
            assert "pk_namespace" in entity
            assert "pk" in entity
            if entity["pk_namespace"] == ns and entity["pk"] == pk:
                found = True
                assert entity["title"] == "My Test Entity" # Check original title
        assert found, f"Entity {ns}/{pk} not found in list"

    @pytest.mark.dependency()
    async def test_list_entities_no_auth(self):
        """Tests listing entities without authentication."""
        data = (await make_request("GET", "/entity", assert_status_code=200)).json()
        assert isinstance(data, list)
        assert len(data) > 0 # Should have at least one entity

    # --- Update Tests ---
    @pytest.mark.dependency(depends=["TestEntityCrud::test_get_entity_success"]) # Depends on GET to confirm state before update
    async def test_update_entity_success(self):
        """Tests successfully updating the created entity."""
        assert TestEntityCrud.created_entity_ns is not None
        assert TestEntityCrud.created_entity_pk is not None
        ns = TestEntityCrud.created_entity_ns
        pk = TestEntityCrud.created_entity_pk

        payload = {
            "pk_namespace": ns, # Must match path
            "pk": pk,           # Must match path
            "title": "Updated Test Entity Title",
            "metadata": {"new_key": "new_value"}
        }
        data = (await make_request("PUT", f"/entity/{ns}/{pk}", json_payload=payload, is_authenticated=True, assert_status_code=200)).json()
        assert data["pk_namespace"] == ns
        assert data["pk"] == pk
        assert data["title"] == "Updated Test Entity Title"
        assert data["metadata"] == {"new_key": "new_value"}

        # Verify update by GETting again
        data_get = (await make_request("GET", f"/entity/{ns}/{pk}", is_authenticated=True, assert_status_code=200)).json()["entity"]
        assert data_get["title"] == "Updated Test Entity Title"
        assert data_get["metadata"] == {"new_key": "new_value"}

    @pytest.mark.dependency()
    async def test_update_entity_not_found(self):
        """Tests updating a non-existent entity."""
        ns = "nonexistent.ns"
        pk = f"nonexistent_pk_{uuid.uuid4()}"
        payload = {
            "pk_namespace": ns, "pk": pk,
            "title": "Update Non Existent", "metadata": {}
        }
        await make_request("PUT", f"/entity/{ns}/{pk}", json_payload=payload, is_authenticated=True, assert_status_code=404)

    @pytest.mark.dependency(depends=["TestEntityCrud::test_update_entity_success"]) # Needs an existing entity
    async def test_update_entity_mismatched_pk(self):
        """Tests updating with mismatched primary key between path and payload."""
        assert TestEntityCrud.created_entity_ns is not None
        assert TestEntityCrud.created_entity_pk is not None
        ns = TestEntityCrud.created_entity_ns
        pk = TestEntityCrud.created_entity_pk
        payload = {
            "pk_namespace": "mismatch.ns", # Different from path
            "pk": "mismatch.pk",         # Different from path
            "title": "Mismatch Test", "metadata": {}
        }
        data = (await make_request("PUT", f"/entity/{ns}/{pk}", json_payload=payload, is_authenticated=True, assert_status_code=400)).json()
        assert "must match payload primary key" in data.get("error", "").lower()

    @pytest.mark.dependency(depends=["TestEntityCrud::test_create_entity_success"])
    async def test_update_entity_no_auth(self):
        """Tests updating an entity without authentication."""
        assert TestEntityCrud.created_entity_ns is not None
        assert TestEntityCrud.created_entity_pk is not None
        ns = TestEntityCrud.created_entity_ns
        pk = TestEntityCrud.created_entity_pk
        payload = {"pk_namespace": ns, "pk": pk, "title": "No Auth Update"}
        await make_request("PUT", f"/entity/{ns}/{pk}", json_payload=payload, assert_status_code=401)

    # --- Delete Tests ---
    @pytest.mark.dependency(depends=["TestEntityCrud::test_update_entity_success"]) # Depends on entity existing
    async def test_delete_entity_success(self):
        """Tests successfully deleting the created entity."""
        assert TestEntityCrud.created_entity_ns is not None
        assert TestEntityCrud.created_entity_pk is not None
        ns = TestEntityCrud.created_entity_ns
        pk = TestEntityCrud.created_entity_pk

        await make_request("DELETE", f"/entity/{ns}/{pk}", is_authenticated=True, assert_status_code=204)

        # Verify deletion by trying to GET it again
        await make_request("GET", f"/entity/{ns}/{pk}", is_authenticated=True, assert_status_code=404)

        # Clear class variables as entity is gone
        TestEntityCrud.created_entity_ns = None
        TestEntityCrud.created_entity_pk = None

    @pytest.mark.dependency()
    async def test_delete_entity_not_found(self):
        """Tests deleting a non-existent entity."""
        ns = "nonexistent.ns"
        pk = f"nonexistent_pk_{uuid.uuid4()}"
        await make_request("DELETE", f"/entity/{ns}/{pk}", is_authenticated=True, assert_status_code=404)

    @pytest.mark.dependency()
    async def test_delete_entity_no_auth(self):
        """Tests deleting an entity without authentication."""
        # Create a temporary entity to try deleting without auth
        temp_ns = "tempdel.ns"
        temp_pk = f"tempdel_pk_{uuid.uuid4()}"
        payload = {"pk_namespace": temp_ns, "pk": temp_pk, "title": "Temp Delete"}
        await make_request("POST", "/entity", json_payload=payload, is_authenticated=True, assert_status_code=201)

        # Attempt delete without auth
        await make_request("DELETE", f"/entity/{temp_ns}/{temp_pk}", assert_status_code=401)

        # Cleanup the temporary entity
        await cleanup_entity(temp_ns, temp_pk)