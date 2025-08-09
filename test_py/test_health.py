import httpx
import pytest

from util import make_request

@pytest.mark.asyncio
async def test_health_endpoint():
    data = (await make_request("GET", "/health", assert_status_code=200)).json()
    
    # Check response structure
    assert "status" in data
    assert "version" in data
    
    # Check expected values
    assert data["status"] == "healthy"
    assert isinstance(data["version"], str)  # Version should be a string
