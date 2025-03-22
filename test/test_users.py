import pytest
from sorterpy.exceptions import SorterAPIError

class TestUsers:
    """
    Tests for user-related endpoints
    """
    
    def test_get_user_profile(self, sorter_client):
        """
        Test fetching a user profile
        """
        # Try to get a specific user (admin is likely to exist)
        response = sorter_client.get_user_profile("admin")
        
        # If admin doesn't exist, this might fail, so we handle both cases
        if response.status_code == 200:
            data = response.json()
            assert "user_name" in data
            assert data["user_name"] == "admin"
        else:
            # If admin doesn't exist, the test should be skipped
            assert response.status_code == 404
            pytest.skip("Admin user doesn't exist")
    
    def test_current_user_unauthenticated(self, sorter_client):
        """
        Test getting the current user when not authenticated
        """
        response = sorter_client.get_current_user()
        assert response.status_code == 200
        data = response.json()
        assert "authenticated" in data
        assert data["authenticated"] is False
    
    def test_search_users(self, sorter_client):
        """
        Test searching for users
        """
        response = sorter_client.search_users("test")
        assert response.status_code == 200
        data = response.json()
        assert "users" in data
        assert isinstance(data["users"], list)
    
    def test_get_nonexistent_user(self, sorter_client):
        """
        Test fetching a user that doesn't exist
        """
        with pytest.raises(SorterAPIError) as excinfo:
            sorter_client.get_user_profile("nonexistentuser12345")
        assert excinfo.value.status_code == 404 