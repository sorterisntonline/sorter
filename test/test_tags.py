import pytest
from sorterpy.exceptions import SorterAPIError

class TestTags:
    """
    Tests for tag-related endpoints
    """
    
    def test_get_tags(self, sorter_client):
        """
        Test fetching tags
        """
        response = sorter_client.get_tags()
        assert response.status_code == 200
        data = response.json()
        assert "tags" in data
        assert isinstance(data["tags"], list)
    
    def test_get_tag_by_id(self, sorter_client):
        """
        Test fetching a specific tag by ID
        """
        # First get all tags to find an ID to test with
        tags_response = sorter_client.get_tags()
        assert tags_response.status_code == 200
        tags_data = tags_response.json()
        
        # Skip if no tags exist
        if not tags_data["tags"]:
            pytest.skip("No tags available for testing")
        
        # Get the first tag ID
        tag_id = tags_data["tags"][0]["id"]
        
        # Test fetching the specific tag
        response = sorter_client.get_tag(tag_id)
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["id"] == tag_id
    
    def test_get_tag_items(self, sorter_client):
        """
        Test fetching items in a tag
        """
        # First get all tags to find an ID to test with
        tags_response = sorter_client.get_tags()
        assert tags_response.status_code == 200
        tags_data = tags_response.json()
        
        # Skip if no tags exist
        if not tags_data["tags"]:
            pytest.skip("No tags available for testing")
        
        # Get the first tag ID
        tag_id = tags_data["tags"][0]["id"]
        
        # Test fetching the items in the tag
        response = sorter_client.get_tag_items(tag_id)
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
    
    def test_get_nonexistent_tag(self, sorter_client):
        """
        Test fetching a tag that doesn't exist
        """
        with pytest.raises(SorterAPIError) as excinfo:
            sorter_client.get_tag(999999)
        assert excinfo.value.status_code == 404 