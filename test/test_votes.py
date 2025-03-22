import pytest
from sorterpy.exceptions import SorterAPIError

class TestVotes:
    """
    Tests for vote-related endpoints
    """
    
    def test_get_votes(self, sorter_client):
        """
        Test fetching votes
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
        
        # Test fetching votes for this tag
        response = sorter_client.get_votes(tag_id=tag_id)
        assert response.status_code == 200
        data = response.json()
        assert "votes" in data
        assert isinstance(data["votes"], list)
    
    def test_get_vote_by_id(self, sorter_client):
        """
        Test fetching a specific vote by ID
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
        
        # Get votes for this tag
        votes_response = sorter_client.get_votes(tag_id=tag_id)
        assert votes_response.status_code == 200
        votes_data = votes_response.json()
        
        # Skip if no votes exist
        if not votes_data["votes"]:
            pytest.skip("No votes available for testing")
        
        # Get the first vote ID
        vote_id = votes_data["votes"][0]["id"]
        
        # Test fetching the specific vote
        response = sorter_client.get_vote(vote_id)
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["id"] == vote_id
    
    def test_get_nonexistent_vote(self, sorter_client):
        """
        Test fetching a vote that doesn't exist
        """
        with pytest.raises(SorterAPIError) as excinfo:
            sorter_client.get_vote(999999)
        assert excinfo.value.status_code == 404 