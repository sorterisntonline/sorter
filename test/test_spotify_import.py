import httpx
import pytest
import uuid
import time
from typing import Dict, Any, Optional, Tuple
import pytest_asyncio

# --- Configuration ---
BASE_URL = "http://localhost:8081/"
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
    # Make the DELETE request and capture the response
    response = await make_request("DELETE", f"/api/entity/{ns}/{pk}", headers=STATIC_ADMIN_AUTH_HEADER)
    # Log the status code of the delete attempt
    print(f"Cleanup Attempt Response Status ({ns}/{pk}): {response.status_code}")

async def cleanup_relationship(parent_ns: str, parent_pk: str, child_ns: str, child_pk: str):
    """Attempts to delete a relationship, ignoring errors."""
    params = {
        "parent_pk_namespace": parent_ns,
        "parent_pk": parent_pk,
        "child_pk_namespace": child_ns,
        "child_pk": child_pk,
    }
    print(f"Cleanup Attempt: Deleting relationship {parent_ns}/{parent_pk} -> {child_ns}/{child_pk}")
    response = await make_request("DELETE", "/api/relationships", headers=STATIC_ADMIN_AUTH_HEADER, params=params)

@pytest.mark.asyncio
@pytest.mark.dependency() # Mark the class itself for dependency management
class TestSpotifyEnsure:

    # Class variables to store state between dependent tests
    album_ns: Optional[str] = None
    album_pk: Optional[str] = None
    ensure_payload: Optional[Dict[str, Any]] = None
    created_entity_data: Optional[Dict[str, Any]] = None
    retrieved_entity_data: Optional[Dict[str, Any]] = None
    second_ensure_data: Optional[Dict[str, Any]] = None
    # Known Radiohead artist ID for related entity check
    radiohead_artist_pk = "4Z8W4fKeB5YxbusRsdQVPb"
    radiohead_artist_ns = "spotify.artist"

    @pytest.mark.dependency()
    async def test_pre_cleanup(self):
        # Class-scoped setup (runs once before any test in the class)
        print("\n--- TestSpotifyEnsure Class Pre-Cleanup ---")
        # Attempt to delete known entities before tests start
        # Use known IDs directly here for pre-cleanup
        album_to_cleanup_ns = "spotify.album"
        album_to_cleanup_pk = "6dVIqQ8qmQ5GBnJ9shOYGE" # OK Computer ID
        artist_to_cleanup_ns = "spotify.artist"
        artist_to_cleanup_pk = "4Z8W4fKeB5YxbusRsdQVPb" # Radiohead ID

        print(f"Pre-cleanup Attempt: Deleting primary entity: {album_to_cleanup_ns}/{album_to_cleanup_pk}")
        await cleanup_entity(album_to_cleanup_ns, album_to_cleanup_pk)
        print(f"Pre-cleanup Attempt: Deleting related artist: {artist_to_cleanup_ns}/{artist_to_cleanup_pk}")
        await cleanup_entity(artist_to_cleanup_ns, artist_to_cleanup_pk)
        # Add cleanup for specific tracks if they might persist

        # Reset class variables to ensure clean state before the first test
        TestSpotifyEnsure.album_ns = None
        TestSpotifyEnsure.album_pk = None
        TestSpotifyEnsure.ensure_payload = None
        TestSpotifyEnsure.created_entity_data = None
        TestSpotifyEnsure.retrieved_entity_data = None
        TestSpotifyEnsure.second_ensure_data = None


    @pytest.mark.dependency(depends=["TestSpotifyEnsure::test_pre_cleanup"])
    async def test_search_for_album(self):
        """Searches for 'ok computer' album and stores its details."""
        search_params = {"q": "ok computer"}
        search_response = await make_request(
            "GET", "/spotify/search", headers=STATIC_ADMIN_AUTH_HEADER, params=search_params
        )
        assert search_response.status_code == 200
        # The response body has keys: "albums", "artists", "tracks"
        search_data = search_response.json()
        assert "albums" in search_data
        search_results_albums = search_data['albums']
        assert isinstance(search_results_albums, list)
        assert len(search_results_albums) > 0, "Spotify search returned no album results for 'ok computer'"

        # Parse the first SimplifiedAlbum result from rspotify
        first_album_result = search_results_albums[0]
        assert "id" in first_album_result and first_album_result["id"] is not None, "Album ID missing from search result"
        assert "name" in first_album_result, "Album name missing from search result"

        album_spotify_id = first_album_result["id"]
        album_name = first_album_result["name"]
        album_namespace = "spotify.album"

        # Assert against known values for OK Computer
        assert album_spotify_id == "6dVIqQ8qmQ5GBnJ9shOYGE"
        assert "ok computer" in album_name.lower()

        # Store details in class variables for subsequent tests
        TestSpotifyEnsure.album_ns = album_namespace
        TestSpotifyEnsure.album_pk = album_spotify_id
        # The ensure payload should use the entire search result item as metadata initially
        TestSpotifyEnsure.ensure_payload = {
            "pk_namespace": TestSpotifyEnsure.album_ns,
            "pk": TestSpotifyEnsure.album_pk,
            "title": album_name, # Use the name from the search result
            "metadata": first_album_result # Send the whole SimplifiedAlbum blob
        }
        print(f"Search successful, found album: {TestSpotifyEnsure.album_ns}/{TestSpotifyEnsure.album_pk}")


    @pytest.mark.dependency(depends=["TestSpotifyEnsure::test_search_for_album"])
    async def test_first_ensure_call(self):
        """Ensures the album for the first time, expecting CREATED status."""
        assert TestSpotifyEnsure.ensure_payload is not None, "Ensure payload not set by previous test"

        ensure_response_1 = await make_request(
            "POST", "/spotify/ensure", headers=STATIC_ADMIN_AUTH_HEADER, json_payload=TestSpotifyEnsure.ensure_payload
        )
        assert ensure_response_1.status_code == 201 # CREATED

        # Store response data for verification in the next test
        TestSpotifyEnsure.created_entity_data = ensure_response_1.json()
        assert TestSpotifyEnsure.created_entity_data is not None


    @pytest.mark.dependency(depends=["TestSpotifyEnsure::test_first_ensure_call"])
    async def test_verify_first_ensure_response(self):
        """Verifies the details returned by the first successful ensure call."""
        assert TestSpotifyEnsure.created_entity_data is not None, "Created entity data not set"
        ensure_data = TestSpotifyEnsure.created_entity_data

        assert ensure_data["pk_namespace"] == TestSpotifyEnsure.album_ns
        assert ensure_data["pk"] == TestSpotifyEnsure.album_pk
        assert "ok computer" in ensure_data.get("title", "").lower()
        assert "metadata" in ensure_data

        metadata = ensure_data.get("metadata", {})
        assert isinstance(metadata, dict)
        artists = metadata.get("artists", [])
        assert isinstance(artists, list)
        assert len(artists) > 0
        found_radiohead = any(
            "radiohead" in artist.get("name", "").lower() and artist.get("id") == TestSpotifyEnsure.radiohead_artist_pk
            for artist in artists
        )
        assert found_radiohead, "Radiohead artist not found in ensured album metadata"


    @pytest.mark.dependency(depends=["TestSpotifyEnsure::test_first_ensure_call"])
    async def test_get_entity_after_ensure(self):
        """Retrieves the entity using the standard GET endpoint."""
        assert TestSpotifyEnsure.album_ns is not None and TestSpotifyEnsure.album_pk is not None

        get_response = await make_request(
            "GET", f"/api/entity/{TestSpotifyEnsure.album_ns}/{TestSpotifyEnsure.album_pk}", headers=STATIC_ADMIN_AUTH_HEADER
        )
        assert get_response.status_code == 200

        # Store response data for comparison
        TestSpotifyEnsure.retrieved_entity_data = get_response.json()
        assert TestSpotifyEnsure.retrieved_entity_data is not None


    @pytest.mark.dependency(depends=["TestSpotifyEnsure::test_verify_first_ensure_response", "TestSpotifyEnsure::test_get_entity_after_ensure"])
    async def test_verify_get_matches_ensure(self):
        """Verifies that the data from GET /entity matches the data from the first ensure call."""
        assert TestSpotifyEnsure.created_entity_data is not None, "Created entity data not set"
        assert TestSpotifyEnsure.retrieved_entity_data is not None, "Retrieved entity data not set"

        ensure_data = TestSpotifyEnsure.created_entity_data
        get_data = TestSpotifyEnsure.retrieved_entity_data

        assert get_data["pk_namespace"] == ensure_data["pk_namespace"]
        assert get_data["pk"] == ensure_data["pk"]
        assert get_data["title"] == ensure_data["title"]
        assert get_data["metadata"] == ensure_data["metadata"] # Assumes ensure returns full meta
        assert "created_at" in get_data
        print("GET response data matches first ensure response data.")


    @pytest.mark.dependency(depends=["TestSpotifyEnsure::test_first_ensure_call"])
    async def test_second_ensure_call_idempotency(self):
        """Ensures the album for the second time, expecting OK status (idempotency)."""
        assert TestSpotifyEnsure.ensure_payload is not None, "Ensure payload not set"

        ensure_response_2 = await make_request(
            "POST", "/spotify/ensure", headers=STATIC_ADMIN_AUTH_HEADER, json_payload=TestSpotifyEnsure.ensure_payload
        )
        assert ensure_response_2.status_code == 200 # OK (already exists)

        # Store response data for verification
        TestSpotifyEnsure.second_ensure_data = ensure_response_2.json()
        assert TestSpotifyEnsure.second_ensure_data is not None


    @pytest.mark.dependency(depends=["TestSpotifyEnsure::test_second_ensure_call_idempotency", "TestSpotifyEnsure::test_get_entity_after_ensure"])
    async def test_verify_second_ensure_response(self):
        """Verifies the data from the second ensure call matches the existing entity data."""
        assert TestSpotifyEnsure.second_ensure_data is not None, "Second ensure data not set"
        assert TestSpotifyEnsure.retrieved_entity_data is not None, "Retrieved entity data not set"

        ensure_data_2 = TestSpotifyEnsure.second_ensure_data
        get_data = TestSpotifyEnsure.retrieved_entity_data

        assert ensure_data_2["pk_namespace"] == get_data["pk_namespace"]
        assert ensure_data_2["pk"] == get_data["pk"]
        assert ensure_data_2["title"] == get_data["title"]
        assert ensure_data_2["metadata"] == get_data["metadata"]
        assert ensure_data_2["created_at"] == get_data["created_at"] # Creation time should not change
        print("Second ensure response data matches existing data (idempotency check passed).")