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

    @pytest.mark.dependency()
    async def test_get_entity_no_auth(self):
        """Tests retrieving an entity without authentication."""
        # Using the previously created entity's PKs, but without auth header
        assert TestEntityCrud.created_entity_ns is not None
        assert TestEntityCrud.created_entity_pk is not None
        ns = TestEntityCrud.created_entity_ns
        pk = TestEntityCrud.created_entity_pk
        response = await make_request("GET", f"/entity/{ns}/{pk}") # No headers
        assert response.status_code == 401 # Unauthorized

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
        assert response.status_code == 401 # Unauthorized

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

# --- Relationship Tests ---

@pytest.mark.asyncio
@pytest.mark.dependency()
class TestRelationshipCrud:
    # Store PKs of entities created specifically for these relationship tests
    parent_ns: str | None = None
    parent_pk: str | None = None
    child_ns: str | None = None
    child_pk: str | None = None
    other_parent_ns: str | None = None # For filtering tests
    other_parent_pk: str | None = None

    @classmethod
    @pytest.fixture(scope="class", autouse=True)
    async def setup_entities(cls):
        """Create necessary parent/child entities before running relationship tests."""
        print("\nSetting up entities for relationship tests...")
        cls.parent_ns = "rel_parent.ns"
        cls.parent_pk = f"rel_parent_{uuid.uuid4()}"
        cls.child_ns = "rel_child.ns"
        cls.child_pk = f"rel_child_{uuid.uuid4()}"
        cls.other_parent_ns = "rel_other_parent.ns"
        cls.other_parent_pk = f"rel_other_parent_{uuid.uuid4()}"

        entities_to_create = [
            {"pk_namespace": cls.parent_ns, "pk": cls.parent_pk, "title": "Rel Parent"},
            {"pk_namespace": cls.child_ns, "pk": cls.child_pk, "title": "Rel Child"},
            {"pk_namespace": cls.other_parent_ns, "pk": cls.other_parent_pk, "title": "Rel Other Parent"},
        ]

        for entity in entities_to_create:
            res = await make_request("POST", "/entity", headers=STATIC_ADMIN_AUTH_HEADER, json_payload=entity)
            if res.status_code != 201:
                pytest.fail(f"Failed to create entity {entity['pk_namespace']}/{entity['pk']} for setup: Status {res.status_code} Body: {res.text}")
            print(f"Setup: Created entity {entity['pk_namespace']}/{entity['pk']}")
        yield
        # --- Teardown ---
        print("\nTearing down entities from relationship tests...")
        await cleanup_entity(cls.parent_ns, cls.parent_pk)
        await cleanup_entity(cls.child_ns, cls.child_pk)
        await cleanup_entity(cls.other_parent_ns, cls.other_parent_pk)
        # Also attempt cleanup of relationship in case a test failed before delete
        await cleanup_relationship(cls.parent_ns, cls.parent_pk, cls.child_ns, cls.child_pk)


    # --- Create Relationship Tests ---
    @pytest.mark.dependency()
    async def test_create_relationship_success(self):
        """Tests successfully creating a new entity relationship."""
        assert self.parent_ns and self.parent_pk and self.child_ns and self.child_pk
        payload = {
            "parent_pk_namespace": self.parent_ns,
            "parent_pk": self.parent_pk,
            "child_pk_namespace": self.child_ns,
            "child_pk": self.child_pk,
        }
        response = await make_request("POST", "/relationships", headers=STATIC_ADMIN_AUTH_HEADER, json_payload=payload)
        assert response.status_code == 201 # Created
        data = response.json()
        assert data["parent_pk_namespace"] == self.parent_ns
        assert data["parent_pk"] == self.parent_pk
        assert data["child_pk_namespace"] == self.child_ns
        assert data["child_pk"] == self.child_pk
        assert "submitter_user_id" in data # Assuming auth middleware provides user ID
        assert "created_at" in data
        print(f"Created relationship: {self.parent_ns}/{self.parent_pk} -> {self.child_ns}/{self.child_pk}")


    @pytest.mark.dependency(depends=["TestRelationshipCrud::test_create_relationship_success"])
    async def test_create_relationship_conflict(self):
        """Tests creating the exact same relationship again."""
        assert self.parent_ns and self.parent_pk and self.child_ns and self.child_pk
        payload = { # Same payload as successful creation
            "parent_pk_namespace": self.parent_ns,
            "parent_pk": self.parent_pk,
            "child_pk_namespace": self.child_ns,
            "child_pk": self.child_pk,
        }
        response = await make_request("POST", "/relationships", headers=STATIC_ADMIN_AUTH_HEADER, json_payload=payload)
        assert response.status_code == 409 # Conflict
        assert "already exists" in response.json().get("error", "").lower()

    @pytest.mark.dependency()
    async def test_create_relationship_nonexistent_parent(self):
        """Tests creating a relationship with a non-existent parent entity."""
        assert self.child_ns and self.child_pk
        payload = {
            "parent_pk_namespace": "nonexistent.ns",
            "parent_pk": f"nonexistent_{uuid.uuid4()}",
            "child_pk_namespace": self.child_ns,
            "child_pk": self.child_pk,
        }
        # This depends on DB foreign key constraints. If they exist, expect 500/error.
        # If not checked, might succeed, which is less ideal. Assuming FKs or app-level check fail.
        response = await make_request("POST", "/relationships", headers=STATIC_ADMIN_AUTH_HEADER, json_payload=payload)
        assert response.status_code >= 400 # Expecting some kind of error (400, 409, 500)
        # Check error message if possible (might be FK violation error from DB)
        print(f"Non-existent parent error response: {response.text}")


    @pytest.mark.dependency()
    async def test_create_relationship_no_auth(self):
        """Tests creating a relationship without authentication."""
        assert self.parent_ns and self.parent_pk and self.child_ns and self.child_pk
        payload = {
            "parent_pk_namespace": self.parent_ns, "parent_pk": self.parent_pk,
            "child_pk_namespace": self.child_ns, "child_pk": self.child_pk,
        }
        response = await make_request("POST", "/relationships", json_payload=payload) # No headers
        assert response.status_code == 401 # Unauthorized


    # --- List Relationship Tests ---
    @pytest.mark.dependency(depends=["TestRelationshipCrud::test_create_relationship_success"])
    async def test_list_relationships_filter_by_parent(self):
        """Tests listing relationships filtered by the parent entity."""
        assert self.parent_ns and self.parent_pk and self.child_ns and self.child_pk
        params = {
            "parent_pk_namespace": self.parent_ns,
            "parent_pk": self.parent_pk,
        }
        response = await make_request("GET", "/relationships", headers=STATIC_ADMIN_AUTH_HEADER, params=params)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1 # Should find at least the one we created
        found = False
        for rel in data:
            if (rel["parent_pk_namespace"] == self.parent_ns and
                rel["parent_pk"] == self.parent_pk and
                rel["child_pk_namespace"] == self.child_ns and
                rel["child_pk"] == self.child_pk):
                found = True
                break
        assert found, "Created relationship not found when filtering by parent"

    @pytest.mark.dependency(depends=["TestRelationshipCrud::test_create_relationship_success"])
    async def test_list_relationships_filter_by_child(self):
        """Tests listing relationships filtered by the child entity."""
        assert self.parent_ns and self.parent_pk and self.child_ns and self.child_pk
        params = {
            "child_pk_namespace": self.child_ns,
            "child_pk": self.child_pk,
        }
        response = await make_request("GET", "/relationships", headers=STATIC_ADMIN_AUTH_HEADER, params=params)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        found = False
        for rel in data:
             if (rel["parent_pk_namespace"] == self.parent_ns and
                 rel["parent_pk"] == self.parent_pk and
                 rel["child_pk_namespace"] == self.child_ns and
                 rel["child_pk"] == self.child_pk):
                 found = True
                 break
        assert found, "Created relationship not found when filtering by child"


    @pytest.mark.dependency(depends=["TestRelationshipCrud::test_create_relationship_success"])
    async def test_list_relationships_filter_no_results(self):
        """Tests listing relationships with filters that yield no results."""
        assert self.other_parent_ns and self.other_parent_pk # Use the unrelated parent
        params = {
            "parent_pk_namespace": self.other_parent_ns,
            "parent_pk": self.other_parent_pk,
             "child_pk_namespace": "some_unrelated_child.ns" # Non-existent child
        }
        response = await make_request("GET", "/relationships", headers=STATIC_ADMIN_AUTH_HEADER, params=params)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 0 # Expect empty list


    @pytest.mark.dependency()
    async def test_list_relationships_no_auth(self):
        """Tests listing relationships without authentication."""
        response = await make_request("GET", "/relationships") # No headers
        assert response.status_code == 401 # Unauthorized


    # --- Delete Relationship Tests ---
    @pytest.mark.dependency(depends=["TestRelationshipCrud::test_create_relationship_success"])
    async def test_delete_relationship_success(self):
        """Tests successfully deleting the created relationship."""
        assert self.parent_ns and self.parent_pk and self.child_ns and self.child_pk
        params = {
            "parent_pk_namespace": self.parent_ns,
            "parent_pk": self.parent_pk,
            "child_pk_namespace": self.child_ns,
            "child_pk": self.child_pk,
        }
        response = await make_request("DELETE", "/relationships", headers=STATIC_ADMIN_AUTH_HEADER, params=params)
        assert response.status_code == 204 # No Content

        # Verify deletion by trying to list/filter for it again
        list_params = { "parent_pk_namespace": self.parent_ns, "parent_pk": self.parent_pk }
        response_list = await make_request("GET", "/relationships", headers=STATIC_ADMIN_AUTH_HEADER, params=list_params)
        assert response_list.status_code == 200
        found_deleted = False
        for rel in response_list.json():
             if (rel["parent_pk_namespace"] == self.parent_ns and
                 rel["parent_pk"] == self.parent_pk and
                 rel["child_pk_namespace"] == self.child_ns and
                 rel["child_pk"] == self.child_pk):
                 found_deleted = True
                 break
        assert not found_deleted, "Deleted relationship was still found after DELETE call"


    @pytest.mark.dependency()
    async def test_delete_relationship_not_found(self):
        """Tests deleting a relationship that doesn't exist."""
        params = {
            "parent_pk_namespace": "not.real.pns",
            "parent_pk": f"not_real_{uuid.uuid4()}",
            "child_pk_namespace": "not.real.cns",
            "child_pk": f"not_real_{uuid.uuid4()}",
        }
        response = await make_request("DELETE", "/relationships", headers=STATIC_ADMIN_AUTH_HEADER, params=params)
        assert response.status_code == 404 # Not Found


    @pytest.mark.dependency()
    async def test_delete_relationship_missing_params(self):
        """Tests deleting a relationship with incomplete identifying parameters."""
        params = { # Missing child_pk
            "parent_pk_namespace": self.parent_ns,
            "parent_pk": self.parent_pk,
            "child_pk_namespace": self.child_ns,
        }
        # Expecting Axum's Query extractor to fail
        response = await make_request("DELETE", "/relationships", headers=STATIC_ADMIN_AUTH_HEADER, params=params)
        assert response.status_code == 400 # Bad Request (or 422) due to missing query param for struct
        assert "error" in response.json()


    @pytest.mark.dependency()
    async def test_delete_relationship_no_auth(self):
        """Tests deleting a relationship without authentication."""
        # Re-create the relationship temporarily to try deleting without auth
        assert self.parent_ns and self.parent_pk and self.child_ns and self.child_pk
        payload = {"parent_pk_namespace": self.parent_ns, "parent_pk": self.parent_pk,
                   "child_pk_namespace": self.child_ns, "child_pk": self.child_pk}
        create_res = await make_request("POST", "/relationships", headers=STATIC_ADMIN_AUTH_HEADER, json_payload=payload)
        # Allow conflict if setup didn't clean up properly, we just need one to exist
        assert create_res.status_code in [201, 409]

        # Attempt delete without auth
        params = {"parent_pk_namespace": self.parent_ns, "parent_pk": self.parent_pk,
                   "child_pk_namespace": self.child_ns, "child_pk": self.child_pk}
        response = await make_request("DELETE", "/relationships", params=params) # No headers
        assert response.status_code == 401 # Unauthorized

        # Clean up the temp relationship if it still exists
        await cleanup_relationship(self.parent_ns, self.parent_pk, self.child_ns, self.child_pk)
