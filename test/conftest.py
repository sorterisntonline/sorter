import json
import os
from pathlib import Path

import httpx
import pytest
from dotenv import load_dotenv
from sorterpy import SorterClient

dotenv_path = Path(__file__).parent / ".env.test"
if dotenv_path.exists():
    load_dotenv(dotenv_path)


@pytest.fixture(scope="session", autouse=True)
def check_borter_config():
    base_url = os.environ.get("SORTER_API_URL", "http://localhost:3000")
    try:
        response = httpx.get(f"{base_url}/api/health", timeout=5.0)
        if response.status_code != 200:
            pytest.skip(
                f"Sorter API at {base_url} is not responding with 200 status code"
            )

        session_response = httpx.get(f"{base_url}/api/session", timeout=5.0)
        if session_response.status_code == 200:
            session_data = session_response.json()
            if session_data.get("authenticated", False) is True:
                pytest.fail(
                    "You appear to have AUTO_LOGIN=true set, which will interfere with "
                    "authentication tests. Please set AUTO_LOGIN=false in borter's "
                    ".env file and restart borter."
                )
    except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout):
        pytest.skip(
            f"Sorter API at {base_url} is not accessible. Is the server running?"
        )


@pytest.fixture(scope="session")
def openapi_spec():
    base_url = os.environ.get("SORTER_API_URL", "http://localhost:3000")
    try:
        response = httpx.get(f"{base_url}/openapi.json", timeout=5.0)
        if response.status_code == 200:
            return response.json()
    except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout):
        pass

    try:
        with Path("../openapi.json").open() as f:
            return json.load(f)
    except FileNotFoundError:
        pytest.skip("OpenAPI spec not found")


@pytest.fixture(scope="session")
def sorter_client():
    base_url = os.environ.get("SORTER_API_URL", "http://localhost:3000")
    return SorterClient(base_url=base_url)


@pytest.fixture
def test_username():
    return os.environ.get("TEST_USERNAME", "test_user")


@pytest.fixture
def test_password():
    return os.environ.get("TEST_PASSWORD", "test_password")
