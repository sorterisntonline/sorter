from typing import Any, Dict

import httpx
import pytest


BASE_URL = "http://localhost:8081/api"
# This MUST match the static key defined in your Rust auth_middleware.rs
STATIC_ADMIN_KEY = "STATIC_TEST_KEY_FOR_ADMIN_USER_123"
# Must be consistent with the user id in the users table
USER_ID = "f14eb2b5-127b-4a88-94bd-536b8766023d"


async def make_request(
    method: str,
    endpoint: str,
    headers: Dict[str, str] | None = None,
    json_payload: Dict[str, Any] | None = None,
    params: Dict[str, Any] | None = None,
    is_authenticated: bool = False,
    assert_status_code: int | list[int] | None = 200,
) -> httpx.Response:
    if is_authenticated:
        if headers is None:
            headers = {}

        headers["Authorization"] = f"Bearer {STATIC_ADMIN_KEY}"

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

        if assert_status_code is not None:
            if isinstance(assert_status_code, list):
                assert response.status_code in assert_status_code, f"Expected {assert_status_code}, got {response.status_code}"
            else:
                assert response.status_code == assert_status_code, f"Expected {assert_status_code}, got {response.status_code}"

        print(f"Response Status: {response.status_code}")
        try:
            # Attempt to log JSON, but handle cases where it's not JSON
            print(f"Response Body: {response.json()}")
        except Exception:
            print(f"Response Body (non-JSON): {response.text}")
        return response
