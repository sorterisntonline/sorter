import pytest
import uuid
from sorterpy.exceptions import SorterAPIError

@pytest.mark.integration
class TestIntegration:
    """
    Integration tests for Sorter API
    
    These tests require a running Sorter instance and a valid user account.
    They will be skipped if the user can't be authenticated.
    """
    
    @pytest.fixture(scope="class")
    def authenticated_client(self, sorter_client, test_username, test_password):
        """
        Create an authenticated client if possible
        """
        try:
            sorter_client.login(test_username, test_password)
            return sorter_client
        except SorterAPIError:
            pytest.skip("Cannot authenticate with provided credentials")
    
    @pytest.fixture
    def unique_tag_title(self):
        """
        Generate a unique tag title for testing
        """
        return f"Test Tag {uuid.uuid4().hex[:8]}"
    
    @pytest.fixture
    def unique_item_title(self):
        """
        Generate a unique item title for testing
        """
        return f"Test Item {uuid.uuid4().hex[:8]}"
    
    def test_create_tag(self, authenticated_client, unique_tag_title):
        """
        Test creating a new tag
        """
        # Skip if not authenticated
        if not authenticated_client:
            pytest.skip("Not authenticated")
        
        # Create a new tag
        response = authenticated_client.create_tag(
            title=unique_tag_title,
            description="A test tag created by the pytest suite"
        )
        
        # Verify it was created
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["title"] == unique_tag_title
        
        # Return the tag ID for later tests
        return data["id"]
    
    def test_create_item_and_add_to_tag(self, authenticated_client, unique_item_title, unique_tag_title):
        """
        Test creating a new item and adding it to a tag
        """
        # Skip if not authenticated
        if not authenticated_client:
            pytest.skip("Not authenticated")
        
        # Create a new tag first
        tag_response = authenticated_client.create_tag(
            title=unique_tag_title,
            description="A test tag created by the pytest suite"
        )
        assert tag_response.status_code == 200
        tag_id = tag_response.json()["id"]
        
        # Create a new item
        item_response = authenticated_client.create_item(
            title=unique_item_title,
            body="A test item created by the pytest suite"
        )
        assert item_response.status_code == 200
        item_id = item_response.json()["id"]
        
        # Add the item to the tag
        add_response = authenticated_client.add_item_to_tag(
            item_id=item_id,
            tag_id=tag_id
        )
        assert add_response.status_code == 200
        
        # Verify the item is in the tag
        items_response = authenticated_client.get_tag_items(tag_id)
        assert items_response.status_code == 200
        items = items_response.json()["items"]
        assert any(item["id"] == item_id for item in items)
    
    def test_create_vote(self, authenticated_client, unique_tag_title):
        """
        Test creating a vote between two items
        """
        # Skip if not authenticated
        if not authenticated_client:
            pytest.skip("Not authenticated")
        
        # Create a new tag
        tag_response = authenticated_client.create_tag(
            title=unique_tag_title,
            description="A test tag created by the pytest suite"
        )
        assert tag_response.status_code == 200
        tag_id = tag_response.json()["id"]
        
        # Create two items
        item1_response = authenticated_client.create_item(
            title=f"Test Item 1 {uuid.uuid4().hex[:8]}",
            body="A test item created by the pytest suite"
        )
        assert item1_response.status_code == 200
        item1_id = item1_response.json()["id"]
        
        item2_response = authenticated_client.create_item(
            title=f"Test Item 2 {uuid.uuid4().hex[:8]}",
            body="A test item created by the pytest suite"
        )
        assert item2_response.status_code == 200
        item2_id = item2_response.json()["id"]
        
        # Add both items to the tag
        authenticated_client.add_item_to_tag(item_id=item1_id, tag_id=tag_id)
        authenticated_client.add_item_to_tag(item_id=item2_id, tag_id=tag_id)
        
        # Create a vote between the items
        vote_response = authenticated_client.create_vote(
            left_item_id=item1_id,
            right_item_id=item2_id,
            tag_id=tag_id,
            value=0.75  # Slightly prefer the left item
        )
        assert vote_response.status_code == 200
        vote_id = vote_response.json()["id"]
        
        # Verify the vote was created
        votes_response = authenticated_client.get_votes(tag_id=tag_id)
        assert votes_response.status_code == 200
        votes = votes_response.json()["votes"]
        assert any(vote["id"] == vote_id for vote in votes) 