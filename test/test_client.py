import pytest
import os
from sorterpy import SorterClient
from sorterpy.exceptions import SorterAPIError

class TestClient:
    """
    Tests for the SorterClient class
    """
    
    def test_client_initialization(self):
        """
        Test that the client can be initialized
        """
        client = SorterClient(base_url="http://localhost:3000")
        assert client is not None
        assert client.base_url == "http://localhost:3000"
    
    def test_client_initialization_with_environment(self):
        """
        Test that the client can be initialized from environment variables
        """
        # Set environment variable temporarily
        os.environ["SORTER_API_URL"] = "http://test-url:3000"
        
        # Create client
        client = SorterClient()
        
        # Assert that it used the environment variable
        assert client.base_url == "http://test-url:3000"
        
        # Restore environment variable
        if "SORTER_API_URL" in os.environ:
            del os.environ["SORTER_API_URL"]
    
    def test_client_custom_headers(self):
        """
        Test that custom headers can be set
        """
        client = SorterClient(base_url="http://localhost:3000")
        client.set_headers({"X-Custom-Header": "test-value"})
        
        # Check that the header was added
        assert "X-Custom-Header" in client.headers
        assert client.headers["X-Custom-Header"] == "test-value"
    
    def test_client_auth_token(self):
        """
        Test that auth token can be set
        """
        client = SorterClient(base_url="http://localhost:3000")
        client.set_auth_token("test-token")
        
        # Check that the auth header was added
        assert "Authorization" in client.headers
        assert client.headers["Authorization"] == "Bearer test-token"
    
    def test_invalid_url_raises_error(self):
        """
        Test that an invalid URL raises an error
        """
        client = SorterClient(base_url="invalid-url")
        
        # Making a request to an invalid URL should raise an exception
        with pytest.raises(Exception):
            client.health() 