import json
import os
import sys
import pytest
import httpx
from sorterpy import SorterClient
from dotenv import load_dotenv

# Load environment variables from .env.test if it exists
dotenv_path = os.path.join(os.path.dirname(__file__), '.env.test')
if os.path.exists(dotenv_path):
    load_dotenv(dotenv_path)

@pytest.fixture(scope="session", autouse=True)
def check_borter_config():
    """
    Check that borter doesn't have AUTO_LOGIN=true set
    """
    base_url = os.environ.get("SORTER_API_URL", "http://localhost:3000")
    try:
        # Try to access the API to see if it's running
        response = httpx.get(f"{base_url}/api/health", timeout=5.0)
        if response.status_code != 200:
            pytest.skip(f"Sorter API at {base_url} is not responding with 200 status code")
            
        # Check if AUTO_LOGIN is enabled by checking if we're automatically authenticated
        session_response = httpx.get(f"{base_url}/api/session", timeout=5.0)
        if session_response.status_code == 200:
            session_data = session_response.json()
            if session_data.get("authenticated", False) is True:
                pytest.fail("Borter appears to have AUTO_LOGIN=true set, which will interfere with authentication tests. "
                           "Please disable AUTO_LOGIN in borter's .env file and restart the service.")
    except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout):
        pytest.skip(f"Sorter API at {base_url} is not accessible. Is the server running?")

@pytest.fixture(scope="session")
def openapi_spec():
    """
    Load the OpenAPI specification
    """
    # Try to load the OpenAPI spec from the API first
    base_url = os.environ.get("SORTER_API_URL", "http://localhost:3000")
    try:
        response = httpx.get(f"{base_url}/openapi.json", timeout=5.0)
        if response.status_code == 200:
            return response.json()
    except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout):
        pass
        
    # If that fails, try to load it from the file
    try:
        with open("../openapi.json", "r") as f:
            return json.load(f)
    except FileNotFoundError:
        pytest.skip("OpenAPI spec not found")

@pytest.fixture(scope="session")
def sorter_client():
    """
    Create a SorterClient instance for testing
    """
    base_url = os.environ.get("SORTER_API_URL", "http://localhost:3000")
    return SorterClient(base_url=base_url)

@pytest.fixture
def test_username():
    """Username for testing"""
    return os.environ.get("TEST_USERNAME", "test_user")

@pytest.fixture
def test_password():
    """Password for testing"""
    return os.environ.get("TEST_PASSWORD", "test_password") 