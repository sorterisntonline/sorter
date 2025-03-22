import pytest

class TestHealth:
    """
    Tests for the health endpoint
    """
    
    def test_health_endpoint(self, sorter_client):
        """
        Test that the health endpoint returns a successful response
        """
        response = sorter_client.health()
        assert response.status_code == 200
        assert "healthy" in response.json()
        
    def test_health_contains_version(self, sorter_client):
        """
        Test that the health endpoint returns version information
        """
        response = sorter_client.health()
        assert response.status_code == 200
        data = response.json()
        assert "version" in data 