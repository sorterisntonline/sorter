import httpx
import pytest
import uuid
import time

# --- Configuration ---
BASE_URL = "http://localhost:8081/api"
# This MUST match the static key defined in your Rust auth_middleware.rs
STATIC_ADMIN_KEY = "STATIC_TEST_KEY_FOR_ADMIN_USER_123"
STATIC_ADMIN_AUTH_HEADER = {"Authorization": f"Bearer {STATIC_ADMIN_KEY}"}

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
class TestApiKeyFlow:
    # Class variables to store state between dependent tests
    created_key_name: str | None = None
    created_plain_text_key: str | None = None
    regenerated_plain_text_key: str | None = None

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
    async def test_protected_route_no_auth(self):
        """Tests accessing a protected route without any authentication."""
        response = await self.make_request("GET", "/protected")
        assert response.status_code == 401
        assert "No authentication credentials" in response.json().get("error", "")

    @pytest.mark.dependency()
    @pytest.mark.dependency(depends=["test_health_endpoint"])
    async def test_protected_route_invalid_key(self):
        """Tests accessing a protected route with an invalid key."""
        headers = {"Authorization": "Bearer invalid-key-123"}
        response = await self.make_request("GET", "/protected", headers=headers)
        assert response.status_code == 401
        assert "Invalid or expired API key" in response.json().get("error", "")

    @pytest.mark.dependency()
    @pytest.mark.dependency(depends=["test_health_endpoint"])
    async def test_protected_route_static_key(self):
        """Tests accessing a protected route using the static debug key."""
        response = await self.make_request("GET", "/protected", headers=STATIC_ADMIN_AUTH_HEADER)
        assert response.status_code == 200
        data = response.json()
        assert "Hello, admin!" in data.get("message", "")
        assert data.get("authenticated_user") == "admin"

    # --- CRUD Tests ---

    @pytest.mark.dependency()
    @pytest.mark.dependency(depends=["TestApiKeyFlow::test_protected_route_static_key"])
    async def test_create_key_success(self):
        """Tests successfully creating a new API key."""
        key_name = f"test_key_{uuid.uuid4()}"
        payload = {"name": key_name}
        response = await self.make_request("POST", "/keys", headers=STATIC_ADMIN_AUTH_HEADER, json_payload=payload)

        assert response.status_code == 201 # Created
        data = response.json()
        assert data.get("name") == key_name
        assert "api_key" in data
        assert data["api_key"].startswith("sort_")
        assert "preview" in data
        assert data["preview"].startswith("sort_")
        assert "message" in data

        # Store for subsequent tests
        TestApiKeyFlow.created_key_name = key_name
        TestApiKeyFlow.created_plain_text_key = data["api_key"]
        print(f"Created key: Name='{key_name}', Key='{data['api_key']}'") # Log for debugging

    @pytest.mark.dependency()
    @pytest.mark.dependency(depends=["TestApiKeyFlow::test_create_key_success"])
    async def test_create_key_conflict(self):
        """Tests trying to create a key with a name that already exists."""
        assert TestApiKeyFlow.created_key_name is not None, "Dependency test_create_key_success must run first"
        payload = {"name": TestApiKeyFlow.created_key_name}
        response = await self.make_request("POST", "/keys", headers=STATIC_ADMIN_AUTH_HEADER, json_payload=payload)
        assert response.status_code == 409 # Conflict
        assert "already exists" in response.json().get("error", "").lower()

    @pytest.mark.dependency()
    @pytest.mark.dependency(depends=["TestApiKeyFlow::test_protected_route_static_key"])
    async def test_create_key_invalid_name_empty(self):
        """Tests creating a key with an empty name."""
        payload = {"name": ""}
        response = await self.make_request("POST", "/keys", headers=STATIC_ADMIN_AUTH_HEADER, json_payload=payload)
        assert response.status_code == 400 # Bad Request
        assert "Invalid key name" in response.json().get("error", "")

    @pytest.mark.dependency()
    @pytest.mark.dependency(depends=["TestApiKeyFlow::test_create_key_success"])
    async def test_list_keys(self):
        """Tests listing the API keys for the user."""
        assert TestApiKeyFlow.created_key_name is not None, "Dependency test_create_key_success must run first"
        # Give a slight delay in case of eventual consistency (though likely not needed for this)
        time.sleep(0.1)

        response = await self.make_request("GET", "/keys", headers=STATIC_ADMIN_AUTH_HEADER)
        assert response.status_code == 200
        data = response.json()
        assert "api_keys" in data
        assert isinstance(data["api_keys"], list)

        found_key = False
        for key in data["api_keys"]:
            assert "id" in key
            assert "name" in key
            assert "preview" in key
            assert "hashed_key" not in key # IMPORTANT: Ensure hashed key isn't leaked
            assert "active" in key
            assert "created_at" in key
            # last_used_at can be null or a string
            assert "last_used_at" in key or key["last_used_at"] is None

            if key["name"] == TestApiKeyFlow.created_key_name:
                found_key = True
                assert key["active"] is True

        assert found_key, f"Newly created key '{TestApiKeyFlow.created_key_name}' not found in list"

    @pytest.mark.dependency()
    @pytest.mark.dependency(depends=["TestApiKeyFlow::test_create_key_success"])
    async def test_protected_route_real_key(self):
        """Tests accessing a protected route using the newly created real API key."""
        assert TestApiKeyFlow.created_plain_text_key is not None, "Need plain text key from creation test"
        headers = {"Authorization": f"Bearer {TestApiKeyFlow.created_plain_text_key}"}
        response = await self.make_request("GET", "/protected", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "Hello, admin!" in data.get("message", "")
        assert data.get("authenticated_user") == "admin"
        # Check that last_used_at was likely updated (hard to assert time exactly)

    @pytest.mark.dependency()
    @pytest.mark.dependency(depends=["TestApiKeyFlow::test_protected_route_real_key"])
    async def test_regenerate_key_success(self):
        """Tests regenerating an existing API key."""
        assert TestApiKeyFlow.created_key_name is not None, "Need key name from creation test"
        payload = {"name": TestApiKeyFlow.created_key_name}
        response = await self.make_request("POST", "/keys/regenerate", headers=STATIC_ADMIN_AUTH_HEADER, json_payload=payload)

        assert response.status_code == 200
        data = response.json()
        assert data.get("name") == TestApiKeyFlow.created_key_name
        assert "api_key" in data
        assert data["api_key"] != TestApiKeyFlow.created_plain_text_key # Ensure it's a NEW key
        assert data["api_key"].startswith("sort_")
        assert "preview" in data
        assert "message" in data

        # Store the new key for subsequent tests
        TestApiKeyFlow.regenerated_plain_text_key = data["api_key"]
        print(f"Regenerated key: Name='{TestApiKeyFlow.created_key_name}', New Key='{data['api_key']}'")

    @pytest.mark.dependency()
    @pytest.mark.dependency(depends=["TestApiKeyFlow::test_regenerate_key_success"])
    async def test_regenerate_old_key_fails(self):
        """Tests that the OLD key no longer works after regeneration."""
        assert TestApiKeyFlow.created_plain_text_key is not None, "Need old plain text key"
        headers = {"Authorization": f"Bearer {TestApiKeyFlow.created_plain_text_key}"}
        response = await self.make_request("GET", "/protected", headers=headers)
        assert response.status_code == 401 # Should be unauthorized now
        assert "Invalid or expired API key" in response.json().get("error", "")

    @pytest.mark.dependency()
    @pytest.mark.dependency(depends=["TestApiKeyFlow::test_regenerate_key_success"])
    async def test_regenerate_new_key_works(self):
        """Tests that the NEW key works after regeneration."""
        assert TestApiKeyFlow.regenerated_plain_text_key is not None, "Need regenerated plain text key"
        headers = {"Authorization": f"Bearer {TestApiKeyFlow.regenerated_plain_text_key}"}
        response = await self.make_request("GET", "/protected", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "Hello, admin!" in data.get("message", "")
        assert data.get("authenticated_user") == "admin"

    @pytest.mark.dependency()
    @pytest.mark.dependency(depends=["TestApiKeyFlow::test_protected_route_static_key"])
    async def test_regenerate_nonexistent_key_creates(self):
        """Tests regenerating a non-existent key name (should create it based on current Rust impl)."""
        key_name = f"nonexistent_then_created_{uuid.uuid4()}"
        payload = {"name": key_name}
        response = await self.make_request("POST", "/keys/regenerate", headers=STATIC_ADMIN_AUTH_HEADER, json_payload=payload)
        assert response.status_code == 200 # Should succeed and create
        data = response.json()
        assert data.get("name") == key_name
        assert "api_key" in data # Should have created a new key

        # Clean up by revoking the unexpectedly created key
        revoke_payload = {"name": key_name}
        await self.make_request("POST", "/keys/revoke", headers=STATIC_ADMIN_AUTH_HEADER, json_payload=revoke_payload)


    @pytest.mark.dependency()
    @pytest.mark.dependency(depends=["TestApiKeyFlow::test_regenerate_new_key_works"])
    async def test_revoke_key_success(self):
        """Tests revoking the currently active (regenerated) key."""
        assert TestApiKeyFlow.created_key_name is not None, "Need key name"
        payload = {"name": TestApiKeyFlow.created_key_name}
        response = await self.make_request("POST", "/keys/revoke", headers=STATIC_ADMIN_AUTH_HEADER, json_payload=payload)
        assert response.status_code == 200
        assert "revoked successfully" in response.json().get("message", "")

    @pytest.mark.dependency()
    @pytest.mark.dependency(depends=["TestApiKeyFlow::test_revoke_key_success"])
    async def test_revoke_key_fails_auth(self):
        """Tests that the revoked key no longer works for authentication."""
        assert TestApiKeyFlow.regenerated_plain_text_key is not None, "Need revoked plain text key"
        headers = {"Authorization": f"Bearer {TestApiKeyFlow.regenerated_plain_text_key}"}
        response = await self.make_request("GET", "/protected", headers=headers)
        assert response.status_code == 401 # Should be unauthorized now
        assert "Invalid or expired API key" in response.json().get("error", "")

    @pytest.mark.dependency()
    @pytest.mark.dependency(depends=["TestApiKeyFlow::test_revoke_key_success"])
    async def test_revoke_already_revoked_key(self):
        """Tests trying to revoke a key that has already been revoked."""
        assert TestApiKeyFlow.created_key_name is not None, "Need key name"
        payload = {"name": TestApiKeyFlow.created_key_name}
        response = await self.make_request("POST", "/keys/revoke", headers=STATIC_ADMIN_AUTH_HEADER, json_payload=payload)
        assert response.status_code == 404 # Not Found (as no *active* key with that name exists)
        assert "not found" in response.json().get("error", "").lower()

    @pytest.mark.dependency()
    @pytest.mark.dependency(depends=["TestApiKeyFlow::test_protected_route_static_key"])
    async def test_revoke_nonexistent_key(self):
        """Tests trying to revoke a key name that never existed."""
        payload = {"name": f"does_not_exist_{uuid.uuid4()}"}
        response = await self.make_request("POST", "/keys/revoke", headers=STATIC_ADMIN_AUTH_HEADER, json_payload=payload)
        assert response.status_code == 404 # Not Found
        assert "not found" in response.json().get("error", "").lower()

    @pytest.mark.dependency()
    @pytest.mark.dependency(depends=["test_revoke_key_success"])
    async def test_list_keys_after_revoke(self):
        """Tests listing keys again to check the status of the revoked key."""
        assert TestApiKeyFlow.created_key_name is not None, "Need key name"
        response = await self.make_request("GET", "/keys", headers=STATIC_ADMIN_AUTH_HEADER)
        assert response.status_code == 200
        data = response.json()
        assert "api_keys" in data

        found_key = False
        for key in data["api_keys"]:
            if key["name"] == TestApiKeyFlow.created_key_name:
                found_key = True
                assert key["active"] is False # Key should now be inactive

        assert found_key, f"Revoked key '{TestApiKeyFlow.created_key_name}' should still be in list but inactive"
