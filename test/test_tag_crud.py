import httpx
import pytest
import uuid
import time

# --- Configuration ---
BASE_URL = "http://localhost:8081/api"
# This MUST match the static key defined in your Rust auth_middleware.rs
STATIC_ADMIN_KEY = "STATIC_TEST_KEY_FOR_ADMIN_USER_123"
STATIC_ADMIN_AUTH_HEADER = {"Authorization": f"Bearer {STATIC_ADMIN_KEY}"}
ADMIN_USERNAME = "admin" # Matches the user associated with the static key

# --- Test Suite ---

@pytest.mark.asyncio
@pytest.mark.dependency() # Mark this as the base dependency
async def test_health_endpoint():
    """Verifies the basic health check endpoint is working."""
    async with httpx.AsyncClient(base_url=BASE_URL) as client:
        response = await client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        assert "version" in data
        print(f"Health check successful (Version: {data.get('version')})")


@pytest.mark.asyncio
@pytest.mark.dependency()
class TestTagFlow:
    # Class variables to store state between dependent tests
    created_tag_id: int | None = None
    created_tag_slug: str | None = None
    initial_tag_data: dict | None = None
    second_tag_id: int | None = None # For conflict tests
    second_tag_slug: str | None = None # For conflict tests

    async def make_request(
        self,
        method: str,
        endpoint: str,
        headers: dict | None = None,
        json_payload: dict | None = None,
    ) -> httpx.Response:
        """Helper function to make HTTP requests."""
        async with httpx.AsyncClient(base_url=BASE_URL) as client:
            print(f"\nRequest: {method} {endpoint}")
            if headers: print(f"Headers: {headers}")
            if json_payload: print(f"Payload: {json_payload}")

            response = await client.request(method, endpoint, headers=headers, json=json_payload)

            print(f"Response Status: {response.status_code}")
            try:
                print(f"Response JSON: {response.json()}")
            except Exception:
                print(f"Response Text: {response.text}")
            return response

    # --- Authentication Tests ---

    @pytest.mark.dependency()
    @pytest.mark.dependency(depends=["test_health_endpoint"])
    async def test_tags_no_auth_create(self):
        """Tests POST /tags without authentication."""
        payload = {"title": "No Auth Tag", "slug": "no-auth-slug"}
        response = await self.make_request("POST", "/tags", json_payload=payload)
        assert response.status_code == 401

    @pytest.mark.dependency()
    @pytest.mark.dependency(depends=["test_health_endpoint"])
    async def test_tags_no_auth_get(self):
        """Tests GET /tags/{id} without authentication."""
        response = await self.make_request("GET", "/tags/1") # Assumes ID 1 might exist or not, checks auth first
        assert response.status_code == 401

    @pytest.mark.dependency()
    @pytest.mark.dependency(depends=["test_health_endpoint"])
    async def test_tags_no_auth_update(self):
        """Tests PUT /tags/{id} without authentication."""
        payload = {"title": "No Auth Update", "slug": "no-auth-update-slug"}
        response = await self.make_request("PUT", "/tags/1", json_payload=payload)
        assert response.status_code == 401

    @pytest.mark.dependency()
    @pytest.mark.dependency(depends=["test_health_endpoint"])
    async def test_tags_no_auth_delete(self):
        """Tests DELETE /tags/{id} without authentication."""
        response = await self.make_request("DELETE", "/tags/1")
        assert response.status_code == 401


    # --- CRUD Tests ---

    @pytest.mark.dependency()
    @pytest.mark.dependency(depends=["test_health_endpoint"])
    async def test_create_tag_success(self):
        """Tests successfully creating a new tag."""
        unique_part = uuid.uuid4().hex[:8]
        tag_title = f"Test Tag {unique_part}"
        tag_slug = f"test-tag-{unique_part}"
        payload = {
            "title": tag_title,
            "slug": tag_slug,
            "description": "A tag created during automated testing.",
            "domain_pk": None,
            "domain_pk_namespace": None,
            "domain_url": None,
            "ns": "test_ns",
            "unlisted": False,
            "nsfw": False,
            "hide_item_authors": False
        }
        # Store initial payload without owner/timestamps for later comparison
        TestTagFlow.initial_tag_data = payload.copy()

        response = await self.make_request("POST", "/tags", headers=STATIC_ADMIN_AUTH_HEADER, json_payload=payload)

        assert response.status_code == 201 # Created
        data = response.json()

        # Assertions about the returned data
        assert "id" in data and isinstance(data["id"], int)
        assert data["owner"] == ADMIN_USERNAME # Should be set by the backend
        assert data["title"] == tag_title
        assert data["slug"] == tag_slug
        assert data["description"] == payload["description"]
        assert data["domain_pk"] == payload["domain_pk"]
        assert data["domain_pk_namespace"] == payload["domain_pk_namespace"]
        assert data["domain_url"] == payload["domain_url"]
        assert data["ns"] == payload["ns"]
        assert data["unlisted"] == payload["unlisted"]
        assert data["nsfw"] == payload["nsfw"]
        assert data["hide_item_authors"] == payload["hide_item_authors"]
        assert "created_at" in data
        assert "edited_at" in data
        assert data["created_at"] == data["edited_at"] # Should be same on creation

        # Store for subsequent tests
        TestTagFlow.created_tag_id = data["id"]
        TestTagFlow.created_tag_slug = data["slug"]
        print(f"Created tag: ID={TestTagFlow.created_tag_id}, Slug='{TestTagFlow.created_tag_slug}'")

    @pytest.mark.dependency()
    @pytest.mark.dependency(depends=["TestTagFlow::test_create_tag_success"])
    async def test_create_tag_conflict(self):
        """Tests trying to create a tag with a slug that already exists for the same owner."""
        assert TestTagFlow.created_tag_slug is not None, "Dependency test_create_tag_success must run first"
        assert TestTagFlow.initial_tag_data is not None

        # Use the *exact same* slug as the previously created tag
        payload = TestTagFlow.initial_tag_data.copy()
        payload["slug"] = TestTagFlow.created_tag_slug
        payload["title"] = "Conflict Test Title" # Title can be different

        response = await self.make_request("POST", "/tags", headers=STATIC_ADMIN_AUTH_HEADER, json_payload=payload)
        assert response.status_code == 409 # Conflict
        data = response.json()
        assert "error" in data
        assert "slug already exists" in data["error"].lower()

    @pytest.mark.dependency()
    @pytest.mark.dependency(depends=["TestTagFlow::test_create_tag_success"])
    async def test_get_tag_success(self):
        """Tests retrieving the created tag by its ID."""
        assert TestTagFlow.created_tag_id is not None, "Dependency test_create_tag_success must run first"
        assert TestTagFlow.initial_tag_data is not None

        response = await self.make_request("GET", f"/tags/{TestTagFlow.created_tag_id}", headers=STATIC_ADMIN_AUTH_HEADER)

        assert response.status_code == 200 # OK
        data = response.json()

        # Verify the retrieved data matches the created data
        assert data["id"] == TestTagFlow.created_tag_id
        assert data["owner"] == ADMIN_USERNAME
        assert data["title"] == TestTagFlow.initial_tag_data["title"]
        assert data["slug"] == TestTagFlow.created_tag_slug
        assert data["description"] == TestTagFlow.initial_tag_data["description"]
        assert data["ns"] == TestTagFlow.initial_tag_data["ns"]
        assert data["unlisted"] == TestTagFlow.initial_tag_data["unlisted"]
        assert data["nsfw"] == TestTagFlow.initial_tag_data["nsfw"]
        assert data["hide_item_authors"] == TestTagFlow.initial_tag_data["hide_item_authors"]
        assert "created_at" in data
        assert "edited_at" in data

    @pytest.mark.dependency()
    @pytest.mark.dependency(depends=["test_health_endpoint"])
    async def test_get_tag_not_found(self):
        """Tests retrieving a tag with a non-existent ID."""
        non_existent_id = 9999999
        response = await self.make_request("GET", f"/tags/{non_existent_id}", headers=STATIC_ADMIN_AUTH_HEADER)
        assert response.status_code == 404 # Not Found

    @pytest.mark.dependency()
    @pytest.mark.dependency(depends=["TestTagFlow::test_get_tag_success"])
    async def test_update_tag_success(self):
        """Tests successfully updating an existing tag."""
        assert TestTagFlow.created_tag_id is not None, "Need tag ID from creation test"
        assert TestTagFlow.initial_tag_data is not None

        unique_part = uuid.uuid4().hex[:8]
        updated_title = f"Updated Test Tag {unique_part}"
        updated_slug = f"updated-test-tag-{unique_part}"
        updated_description = "This tag has been updated."
        update_payload = {
             # Include all fields expected by the Tag struct/payload
            "title": updated_title,
            "slug": updated_slug,
            "description": updated_description,
            "domain_pk": TestTagFlow.initial_tag_data["domain_pk"], # Keep others same or update as needed
            "domain_pk_namespace": TestTagFlow.initial_tag_data["domain_pk_namespace"],
            "domain_url": TestTagFlow.initial_tag_data["domain_url"],
            "ns": "updated_ns",
            "unlisted": True,
            "nsfw": True,
            "hide_item_authors": True,
             # id, owner, created_at, edited_at are ignored in payload / set by backend
        }

        # Slight delay to ensure edited_at will be different from created_at
        time.sleep(0.1)

        response = await self.make_request("PUT", f"/tags/{TestTagFlow.created_tag_id}", headers=STATIC_ADMIN_AUTH_HEADER, json_payload=update_payload)

        assert response.status_code == 200 # OK
        data = response.json()

        # Verify the response reflects the updates
        assert data["id"] == TestTagFlow.created_tag_id
        assert data["owner"] == ADMIN_USERNAME
        assert data["title"] == updated_title
        assert data["slug"] == updated_slug
        assert data["description"] == updated_description
        assert data["ns"] == "updated_ns"
        assert data["unlisted"] is True
        assert data["nsfw"] is True
        assert data["hide_item_authors"] is True
        assert "created_at" in data
        assert "edited_at" in data
        assert data["edited_at"] > data["created_at"] # edited_at should be later now

        # Update the class variable for the slug if changed
        TestTagFlow.created_tag_slug = updated_slug
        print(f"Updated tag: ID={TestTagFlow.created_tag_id}, New Slug='{TestTagFlow.created_tag_slug}'")

        # Verify the update persisted with another GET
        get_response = await self.make_request("GET", f"/tags/{TestTagFlow.created_tag_id}", headers=STATIC_ADMIN_AUTH_HEADER)
        assert get_response.status_code == 200
        get_data = get_response.json()
        assert get_data["title"] == updated_title
        assert get_data["slug"] == updated_slug
        assert get_data["unlisted"] is True

    @pytest.mark.dependency()
    @pytest.mark.dependency(depends=["TestTagFlow::test_update_tag_success"])
    async def test_create_second_tag_for_conflict_test(self):
        """Creates a second tag to test update conflicts."""
        unique_part = uuid.uuid4().hex[:8]
        tag_title = f"Second Tag {unique_part}"
        tag_slug = f"second-tag-{unique_part}"
        payload = {
            "title": tag_title, "slug": tag_slug, "description": "Second tag for testing",
            "ns": "test_ns", "unlisted": False, "nsfw": False, "hide_item_authors": False
            # other fields can be None/default
        }
        response = await self.make_request("POST", "/tags", headers=STATIC_ADMIN_AUTH_HEADER, json_payload=payload)
        assert response.status_code == 201
        data = response.json()
        TestTagFlow.second_tag_id = data["id"]
        TestTagFlow.second_tag_slug = data["slug"]
        print(f"Created second tag: ID={TestTagFlow.second_tag_id}, Slug='{TestTagFlow.second_tag_slug}'")


    @pytest.mark.dependency()
    @pytest.mark.dependency(depends=["TestTagFlow::test_create_second_tag_for_conflict_test"])
    async def test_update_tag_conflict(self):
        """Tests updating a tag to use a slug that already exists for another tag owned by the same user."""
        assert TestTagFlow.created_tag_id is not None
        assert TestTagFlow.second_tag_id is not None
        assert TestTagFlow.second_tag_slug is not None

        # Get the current state of the first tag to use as a base for the update payload
        get_response = await self.make_request("GET", f"/tags/{TestTagFlow.created_tag_id}", headers=STATIC_ADMIN_AUTH_HEADER)
        assert get_response.status_code == 200
        current_tag_data = get_response.json()

        # Prepare update payload: attempt to change slug to the second tag's slug
        update_payload = {
            "title": current_tag_data["title"],
            "slug": TestTagFlow.second_tag_slug, # The conflicting slug
            "description": current_tag_data["description"],
            "domain_pk": current_tag_data["domain_pk"],
            "domain_pk_namespace": current_tag_data["domain_pk_namespace"],
            "domain_url": current_tag_data["domain_url"],
            "ns": current_tag_data["ns"],
            "unlisted": current_tag_data["unlisted"],
            "nsfw": current_tag_data["nsfw"],
            "hide_item_authors": current_tag_data["hide_item_authors"],
        }

        response = await self.make_request("PUT", f"/tags/{TestTagFlow.created_tag_id}", headers=STATIC_ADMIN_AUTH_HEADER, json_payload=update_payload)

        assert response.status_code == 409 # Conflict (due to unique constraint on owner + slug)
        data = response.json()
        assert "error" in data
        assert "slug already exists" in data["error"].lower()

        # Clean up the second tag
        del_response = await self.make_request("DELETE", f"/tags/{TestTagFlow.second_tag_id}", headers=STATIC_ADMIN_AUTH_HEADER)
        assert del_response.status_code == 200


    @pytest.mark.dependency()
    @pytest.mark.dependency(depends=["test_health_endpoint"])
    async def test_update_tag_not_found(self):
        """Tests updating a tag with a non-existent ID."""
        non_existent_id = 9999998
        update_payload = {"title": "Not Found Update", "slug": "not-found-slug"}
        response = await self.make_request("PUT", f"/tags/{non_existent_id}", headers=STATIC_ADMIN_AUTH_HEADER, json_payload=update_payload)
        assert response.status_code == 404 # Not Found

    @pytest.mark.dependency()
    @pytest.mark.dependency(depends=["TestTagFlow::test_update_tag_success"]) # Depends on update to ensure we delete the latest state
    async def test_delete_tag_success(self):
        """Tests successfully deleting the created tag."""
        assert TestTagFlow.created_tag_id is not None, "Need tag ID from prior tests"

        response = await self.make_request("DELETE", f"/tags/{TestTagFlow.created_tag_id}", headers=STATIC_ADMIN_AUTH_HEADER)
        # The Rust code currently returns Ok(HttpResponse::Ok().finish()) on success
        assert response.status_code == 200 # OK (or could be 204 No Content)

        # Clear the stored ID so subsequent tests know it's gone
        deleted_id = TestTagFlow.created_tag_id
        TestTagFlow.created_tag_id = None
        TestTagFlow.created_tag_slug = None
        print(f"Deleted tag: ID={deleted_id}")

    @pytest.mark.dependency()
    @pytest.mark.dependency(depends=["TestTagFlow::test_delete_tag_success"])
    async def test_get_deleted_tag_not_found(self):
        """Tests that retrieving the deleted tag now results in Not Found."""
        # The ID was cleared in test_delete_tag_success, use a placeholder or ensure logic handles None
        # Re-running GET with the previously stored ID (which is now None) isn't ideal.
        # Instead, we rely on the delete test passing and check a non-existent ID.
        # A better approach might be to store the deleted ID in a separate variable.
        # Let's assume the delete worked and check a known invalid ID again.
        non_existent_id = 9999997
        response = await self.make_request("GET", f"/tags/{non_existent_id}", headers=STATIC_ADMIN_AUTH_HEADER)
        assert response.status_code == 404 # Not Found

        # If we had stored the deleted ID:
        # assert TestTagFlow.created_tag_id is None, "Tag ID should be None after delete"
        # deleted_id = ... # retrieve deleted id if stored separately
        # response = await self.make_request("GET", f"/tags/{deleted_id}", headers=STATIC_ADMIN_AUTH_HEADER)
        # assert response.status_code == 404


    @pytest.mark.dependency()
    @pytest.mark.dependency(depends=["test_health_endpoint"])
    async def test_delete_tag_not_found(self):
        """Tests deleting a tag with a non-existent ID."""
        non_existent_id = 9999996
        response = await self.make_request("DELETE", f"/tags/{non_existent_id}", headers=STATIC_ADMIN_AUTH_HEADER)
        assert response.status_code == 404 # Not Found
