import httpx
import pytest

@pytest.mark.asyncio
async def test_health_endpoint():
    async with httpx.AsyncClient() as client:
        response = await client.get("http://localhost:8081/api/health")
        
        # Check status code
        assert response.status_code == 200
        
        # Parse JSON response
        data = response.json()
        
        # Check response structure
        assert "status" in data
        assert "version" in data
        
        # Check expected values
        assert data["status"] == "healthy"
        assert isinstance(data["version"], str)  # Version should be a string
