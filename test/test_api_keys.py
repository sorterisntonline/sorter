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
    # Renamed variable to hold the full key (sort_identifier_secret)
    created_full_key: str | None = None
    # Renamed variable to hold the regenerated full key
    regenerated_full_key: str | None = None

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
        # Error message might change slightly depending on middleware implementation
        assert "No authentication credentials" in response.json().get("error", "") \
            or "Unauthorized" in response.json().get("error", "")


    @pytest.mark.dependency()
    @pytest.mark.dependency(depends=["test_health_endpoint"])
    async def test_protected_route_invalid_key_format(self):
        """Tests accessing a protected route with an invalid key format."""
        # Key doesn't match sort_identifier_secret
        headers = {"Authorization": "Bearer invalid-key-123"}
        response = await self.make_request("GET", "/protected", headers=headers)
        assert response.status_code == 401 # Unauthorized
        assert "Invalid API key format" in response.json().get("error", "")

    @pytest.mark.dependency()
    @pytest.mark.dependency(depends=["test_health_endpoint"])
    async def test_protected_route_incorrect_key_value(self):
        """Tests accessing a protected route with a correctly formatted but non-existent key."""
        # Generate a plausible but fake key
        fake_identifier = "".join(uuid.uuid4().hex[:16])
        fake_secret = "".join(uuid.uuid4().hex[:32])
        fake_key = f"sort_{fake_identifier}_{fake_secret}"
        headers = {"Authorization": f"Bearer {fake_key}"}
        response = await self.make_request("GET", "/protected", headers=headers)
        assert response.status_code == 401 # Unauthorized
        # The error might be generic "Unauthorized" or more specific depending on ApiKeyError mapping
        assert "Unauthorized" in response.json().get("error", "") or \
               "verification failed" in response.json().get("error", "")

    @pytest.mark.dependency()
    @pytest.mark.dependency(depends=["test_health_endpoint"])
    async def test_protected_route_static_key(self):
        """Tests accessing a protected route using the static debug key."""
        response = await self.make_request("GET", "/protected", headers=STATIC_ADMIN_AUTH_HEADER)
        assert response.status_code == 200
        data = response.json()
        assert "Hello!" in data.get("message", "")

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
        # *** CHANGED: Check for 'full_key' instead of 'api_key' ***
        assert "full_key" in data
        assert isinstance(data["full_key"], str)
        # *** CHANGED: Assert correct key format ***
        assert data["full_key"].startswith("sort_")
        key_parts = data["full_key"].split("_")
        assert len(key_parts) == 3 # sort, identifier, secret
        assert key_parts[0] == "sort"
        assert len(key_parts[1]) > 0 # Identifier part
        assert len(key_parts[2]) > 0 # Secret part

        assert "message" in data

        # Store for subsequent tests
        TestApiKeyFlow.created_key_name = key_name
        # *** CHANGED: Store 'full_key' ***
        TestApiKeyFlow.created_full_key = data["full_key"]
        print(f"Created key: Name='{key_name}', FullKey='{data['full_key']}'") # Log for debugging

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
        time.sleep(0.1) # Small delay for potential consistency

        response = await self.make_request("GET", "/keys", headers=STATIC_ADMIN_AUTH_HEADER)
        assert response.status_code == 200
        data = response.json()
        assert "api_keys" in data
        assert isinstance(data["api_keys"], list)

        found_key = False
        for key in data["api_keys"]:
            assert "id" in key
            assert "name" in key
            assert "hashed_key" not in key # Ensure hashed key isn't leaked
            assert "key_identifier" not in key # Ensure identifier isn't leaked here either
            assert "active" in key
            assert "created_at" in key
            assert "last_used_at" in key or key["last_used_at"] is None

            if key["name"] == TestApiKeyFlow.created_key_name:
                found_key = True
                assert key["active"] is True

        assert found_key, f"Newly created key '{TestApiKeyFlow.created_key_name}' not found in list"

    @pytest.mark.dependency()
    @pytest.mark.dependency(depends=["TestApiKeyFlow::test_create_key_success"])
    async def test_protected_route_real_key(self):
        """Tests accessing a protected route using the newly created real API key."""
        # *** CHANGED: Use created_full_key ***
        assert TestApiKeyFlow.created_full_key is not None, "Need full key from creation test"
        headers = {"Authorization": f"Bearer {TestApiKeyFlow.created_full_key}"}
        response = await self.make_request("GET", "/protected", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "Hello!" in data.get("message", "")
        # Add a small delay to allow the async last_used_at update to likely complete
        time.sleep(0.2)


    @pytest.mark.dependency()
    @pytest.mark.dependency(depends=["TestApiKeyFlow::test_protected_route_real_key"])
    async def test_list_keys_after_use(self):
        """Tests listing keys again to check if last_used_at was updated."""
        assert TestApiKeyFlow.created_key_name is not None
        response = await self.make_request("GET", "/keys", headers=STATIC_ADMIN_AUTH_HEADER)
        assert response.status_code == 200
        data = response.json()
        found_key = False
        for key in data["api_keys"]:
            if key["name"] == TestApiKeyFlow.created_key_name:
                found_key = True
                assert key["active"] is True
                assert key["last_used_at"] is not None, "last_used_at should be updated after successful use"
                # You could potentially parse the timestamp and check if it's recent,
                # but checking for None is usually sufficient here.
                print(f"Key '{key['name']}' last used at: {key['last_used_at']}")
        assert found_key


    @pytest.mark.dependency()
    @pytest.mark.dependency(depends=["TestApiKeyFlow::test_list_keys_after_use"]) # Depends on the check after use
    async def test_regenerate_key_success(self):
        """Tests regenerating an existing API key."""
        assert TestApiKeyFlow.created_key_name is not None, "Need key name from creation test"
        payload = {"name": TestApiKeyFlow.created_key_name}
        response = await self.make_request("POST", "/keys/regenerate", headers=STATIC_ADMIN_AUTH_HEADER, json_payload=payload)

        assert response.status_code == 200
        data = response.json()
        assert data.get("name") == TestApiKeyFlow.created_key_name
        # *** CHANGED: Check for 'full_key' ***
        assert "full_key" in data
        assert isinstance(data["full_key"], str)
        # *** CHANGED: Ensure it's a NEW full key ***
        assert data["full_key"] != TestApiKeyFlow.created_full_key
        assert data["full_key"].startswith("sort_")
        key_parts = data["full_key"].split("_") # Re-check format
        assert len(key_parts) == 3 and key_parts[0] == "sort"

        assert "message" in data

        # Store the new key for subsequent tests
        # *** CHANGED: Store 'full_key' ***
        TestApiKeyFlow.regenerated_full_key = data["full_key"]
        print(f"Regenerated key: Name='{TestApiKeyFlow.created_key_name}', New FullKey='{data['full_key']}'")

    @pytest.mark.dependency()
    @pytest.mark.dependency(depends=["TestApiKeyFlow::test_regenerate_key_success"])
    async def test_regenerate_old_key_fails(self):
        """Tests that the OLD key no longer works after regeneration."""
        # *** CHANGED: Use created_full_key (the original one) ***
        assert TestApiKeyFlow.created_full_key is not None, "Need old full key"
        headers = {"Authorization": f"Bearer {TestApiKeyFlow.created_full_key}"}
        response = await self.make_request("GET", "/protected", headers=headers)
        assert response.status_code == 401 # Should be unauthorized now
        assert "Unauthorized" in response.json().get("error", "") or \
               "verification failed" in response.json().get("error", "")

    @pytest.mark.dependency()
    @pytest.mark.dependency(depends=["TestApiKeyFlow::test_regenerate_key_success"])
    async def test_regenerate_new_key_works(self):
        """Tests that the NEW key works after regeneration."""
        # *** CHANGED: Use regenerated_full_key ***
        assert TestApiKeyFlow.regenerated_full_key is not None, "Need regenerated full key"
        headers = {"Authorization": f"Bearer {TestApiKeyFlow.regenerated_full_key}"}
        response = await self.make_request("GET", "/protected", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "Hello!" in data.get("message", "")

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
        # *** CHANGED: Check for 'full_key' ***
        assert "full_key" in data # Should have created a new key
        newly_created_key = data["full_key"] # Store to test auth briefly

        # Optional: Briefly test if the newly created key works
        headers_new = {"Authorization": f"Bearer {newly_created_key}"}
        response_auth = await self.make_request("GET", "/protected", headers=headers_new)
        assert response_auth.status_code == 200

        # Clean up by revoking the unexpectedly created key
        revoke_payload = {"name": key_name}
        response_revoke = await self.make_request("POST", "/keys/revoke", headers=STATIC_ADMIN_AUTH_HEADER, json_payload=revoke_payload)
        assert response_revoke.status_code == 200


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
        # *** CHANGED: Use regenerated_full_key (the one that was just revoked) ***
        assert TestApiKeyFlow.regenerated_full_key is not None, "Need revoked full key"
        headers = {"Authorization": f"Bearer {TestApiKeyFlow.regenerated_full_key}"}
        response = await self.make_request("GET", "/protected", headers=headers)
        assert response.status_code == 401 # Should be unauthorized now
        assert "Unauthorized" in response.json().get("error", "") or \
               "verification failed" in response.json().get("error", "")

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
    @pytest.mark.dependency(depends=["TestApiKeyFlow::test_revoke_key_success"])
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
