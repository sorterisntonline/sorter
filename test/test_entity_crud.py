import httpx
import pytest
import uuid
import time
from typing import Dict, Any, Optional, Tuple

# --- Configuration ---
BASE_URL = "http://localhost:8081/api"
# This MUST match the static key defined in your Rust auth_middleware.rs
STATIC_ADMIN_KEY = "STATIC_TEST_KEY_FOR_ADMIN_USER_123"
STATIC_ADMIN_AUTH_HEADER = {"Authorization": f"Bearer {STATIC_ADMIN_KEY}"}

# --- Helper Functions ---

async def make_request(
    method: str,
    endpoint: str,
    headers: Dict[str, str] | None = None,
    json_payload: Dict[str, Any] | None = None,
    params: Dict[str, Any] | None = None,
) -> httpx.Response:
    """Helper function to make HTTP requests."""
    async with httpx.AsyncClient(base_url=BASE_URL) as client:
        print(f"\nRequest: {method} {endpoint}")
        if headers: print(f"Headers: {headers}")
        if params: print(f"Params: {params}")
        if json_payload: print(f"Payload: {json_payload}")

        try:
            response = await client.request(method, endpoint, headers=headers, json=json_payload, params=params)
        except httpx.RequestError as e:
            pytest.fail(f"HTTP request failed: {e}")

        print(f"Response Status: {response.status_code}")
        try:
            # Attempt to log JSON, but handle cases where it's not JSON
            print(f"Response Body: {response.json()}")
        except Exception:
            print(f"Response Body (non-JSON): {response.text}")
        return response

async def cleanup_entity(ns: str, pk: str):
    """Attempts to delete an entity, ignoring errors if it's already gone."""
    print(f"Cleanup Attempt: Deleting entity {ns}/{pk}")
    await make_request("DELETE", f"/entity/{ns}/{pk}", headers=STATIC_ADMIN_AUTH_HEADER)

async def cleanup_relationship(parent_ns: str, parent_pk: str, child_ns: str, child_pk: str):
    """Attempts to delete a relationship, ignoring errors."""
    params = {
        "parent_pk_namespace": parent_ns,
        "parent_pk": parent_pk,
        "child_pk_namespace": child_ns,
        "child_pk": child_pk,
    }
    print(f"Cleanup Attempt: Deleting relationship {parent_ns}/{parent_pk} -> {child_ns}/{child_pk}")
    await make_request("DELETE", "/relationships", headers=STATIC_ADMIN_AUTH_HEADER, params=params)


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
        response = await make_request("POST", "/entity", headers=STATIC_ADMIN_AUTH_HEADER, json_payload=payload)

        assert response.status_code == 201 # Created
        data = response.json()
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
        response = await make_request("POST", "/entity", headers=STATIC_ADMIN_AUTH_HEADER, json_payload=payload)
        assert response.status_code == 409 # Conflict
        assert "already exists" in response.json().get("error", "").lower()

    @pytest.mark.dependency()
    async def test_create_entity_no_auth(self):
        """Tests creating an entity without authentication."""
        payload = {
            "pk_namespace": "noauth.ns",
            "pk": f"noauth_pk_{uuid.uuid4()}",
            "title": "No Auth Test",
            "metadata": None
        }
        response = await make_request("POST", "/entity", json_payload=payload) # No headers
        assert response.status_code == 401 # Unauthorized

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
        response = await make_request("POST", "/entity", headers=STATIC_ADMIN_AUTH_HEADER, json_payload=payload)
        assert response.status_code in [400, 422] # Bad Request or Unprocessable Entity
        assert "error" in response.json()

    # --- Read Tests ---
    @pytest.mark.dependency(depends=["TestEntityCrud::test_create_entity_success"])
    async def test_get_entity_success(self):
        """Tests successfully retrieving the created entity."""
        assert TestEntityCrud.created_entity_ns is not None
        assert TestEntityCrud.created_entity_pk is not None
        ns = TestEntityCrud.created_entity_ns
        pk = TestEntityCrud.created_entity_pk

        response = await make_request("GET", f"/entity/{ns}/{pk}", headers=STATIC_ADMIN_AUTH_HEADER)
        assert response.status_code == 200
        data = response.json()
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
        response = await make_request("GET", f"/entity/{ns}/{pk}", headers=STATIC_ADMIN_AUTH_HEADER)
        assert response.status_code == 404 # Not Found
        assert "not found" in response.json().get("error", "").lower()

    # --- List Tests ---
    @pytest.mark.dependency(depends=["TestEntityCrud::test_create_entity_success"])
    async def test_list_entities_success(self):
        """Tests listing entities and finding the created one."""
        assert TestEntityCrud.created_entity_ns is not None
        assert TestEntityCrud.created_entity_pk is not None
        ns = TestEntityCrud.created_entity_ns
        pk = TestEntityCrud.created_entity_pk

        response = await make_request("GET", "/entity", headers=STATIC_ADMIN_AUTH_HEADER)
        assert response.status_code == 200
        data = response.json()
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
        response = await make_request("GET", "/entity") # No headers
        assert response.status_code == 200
        data = response.json()
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
        response = await make_request("PUT", f"/entity/{ns}/{pk}", headers=STATIC_ADMIN_AUTH_HEADER, json_payload=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["pk_namespace"] == ns
        assert data["pk"] == pk
        assert data["title"] == "Updated Test Entity Title"
        assert data["metadata"] == {"new_key": "new_value"}

        # Verify update by GETting again
        response_get = await make_request("GET", f"/entity/{ns}/{pk}", headers=STATIC_ADMIN_AUTH_HEADER)
        assert response_get.status_code == 200
        data_get = response_get.json()
        data_get = data_get["entity"]
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
        response = await make_request("PUT", f"/entity/{ns}/{pk}", headers=STATIC_ADMIN_AUTH_HEADER, json_payload=payload)
        assert response.status_code == 404 # Not Found

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
        response = await make_request("PUT", f"/entity/{ns}/{pk}", headers=STATIC_ADMIN_AUTH_HEADER, json_payload=payload)
        assert response.status_code == 400 # Bad Request (due to the check added in the handler)
        assert "must match payload primary key" in response.json().get("error", "").lower()

    @pytest.mark.dependency()
    async def test_update_entity_no_auth(self):
        """Tests updating an entity without authentication."""
        assert TestEntityCrud.created_entity_ns is not None
        assert TestEntityCrud.created_entity_pk is not None
        ns = TestEntityCrud.created_entity_ns
        pk = TestEntityCrud.created_entity_pk
        payload = {"pk_namespace": ns, "pk": pk, "title": "No Auth Update"}
        response = await make_request("PUT", f"/entity/{ns}/{pk}", json_payload=payload) # No headers
        assert response.status_code == 401 # Unauthorized

    # --- Delete Tests ---
    @pytest.mark.dependency(depends=["TestEntityCrud::test_update_entity_success"]) # Depends on entity existing
    async def test_delete_entity_success(self):
        """Tests successfully deleting the created entity."""
        assert TestEntityCrud.created_entity_ns is not None
        assert TestEntityCrud.created_entity_pk is not None
        ns = TestEntityCrud.created_entity_ns
        pk = TestEntityCrud.created_entity_pk

        response = await make_request("DELETE", f"/entity/{ns}/{pk}", headers=STATIC_ADMIN_AUTH_HEADER)
        assert response.status_code == 204 # No Content

        # Verify deletion by trying to GET it again
        response_get = await make_request("GET", f"/entity/{ns}/{pk}", headers=STATIC_ADMIN_AUTH_HEADER)
        assert response_get.status_code == 404 # Not Found

        # Clear class variables as entity is gone
        TestEntityCrud.created_entity_ns = None
        TestEntityCrud.created_entity_pk = None

    @pytest.mark.dependency()
    async def test_delete_entity_not_found(self):
        """Tests deleting a non-existent entity."""
        ns = "nonexistent.ns"
        pk = f"nonexistent_pk_{uuid.uuid4()}"
        response = await make_request("DELETE", f"/entity/{ns}/{pk}", headers=STATIC_ADMIN_AUTH_HEADER)
        assert response.status_code == 404 # Not Found

    @pytest.mark.dependency()
    async def test_delete_entity_no_auth(self):
        """Tests deleting an entity without authentication."""
        # Create a temporary entity to try deleting without auth
        temp_ns = "tempdel.ns"
        temp_pk = f"tempdel_pk_{uuid.uuid4()}"
        payload = {"pk_namespace": temp_ns, "pk": temp_pk, "title": "Temp Delete"}
        create_res = await make_request("POST", "/entity", headers=STATIC_ADMIN_AUTH_HEADER, json_payload=payload)
        assert create_res.status_code == 201

        # Attempt delete without auth
        response = await make_request("DELETE", f"/entity/{temp_ns}/{temp_pk}") # No headers
        assert response.status_code == 401 # Unauthorized

        # Cleanup the temporary entity
        await cleanup_entity(temp_ns, temp_pk)