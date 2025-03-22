import pytest
from sorterpy.exceptions import SorterAPIError

class TestItems:
    """
    Tests for item-related endpoints
    """
    
    def test_get_items(self, sorter_client):
        """
        Test fetching items
        """
        response = sorter_client.get_items()
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert isinstance(data["items"], list)
    
    def test_get_item_by_id(self, sorter_client):
        """
        Test fetching a specific item by ID
        """
        # First get all items to find an ID to test with
        items_response = sorter_client.get_items()
        assert items_response.status_code == 200
        items_data = items_response.json()
        
        # Skip if no items exist
        if not items_data["items"]:
            pytest.skip("No items available for testing")
        
        # Get the first item ID
        item_id = items_data["items"][0]["id"]
        
        # Test fetching the specific item
        response = sorter_client.get_item(item_id)
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["id"] == item_id
    
    def test_search_items(self, sorter_client):
        """
        Test searching for items
        """
        response = sorter_client.search_items("test")
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert isinstance(data["items"], list)
    
    def test_get_nonexistent_item(self, sorter_client):
        """
        Test fetching an item that doesn't exist
        """
        with pytest.raises(SorterAPIError) as excinfo:
            sorter_client.get_item(999999)
        assert excinfo.value.status_code == 404 