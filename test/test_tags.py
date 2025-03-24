import pytest
from sorterpy.exceptions import SorterAPIError


class TestTags:
    def test_get_tags(self, sorter_client):
        response = sorter_client.get_tags()
        assert response.status_code == 200
        data = response.json()
        assert "tags" in data
        assert isinstance(data["tags"], list)

    def test_get_tag_by_id(self, sorter_client):
        tags_response = sorter_client.get_tags()
        assert tags_response.status_code == 200
        tags_data = tags_response.json()

        if not tags_data["tags"]:
            pytest.skip("No tags available for testing")

        tag_id = tags_data["tags"][0]["id"]

        response = sorter_client.get_tag(tag_id)
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["id"] == tag_id

    def test_get_tag_items(self, sorter_client):
        tags_response = sorter_client.get_tags()
        assert tags_response.status_code == 200
        tags_data = tags_response.json()

        if not tags_data["tags"]:
            pytest.skip("No tags available for testing")

        tag_id = tags_data["tags"][0]["id"]

        response = sorter_client.get_tag_items(tag_id)
        assert response.status_code == 200
        data = response.json()
        assert "items" in data

    def test_get_nonexistent_tag(self, sorter_client):
        with pytest.raises(SorterAPIError) as excinfo:
            sorter_client.get_tag(999999)
        assert excinfo.value.status_code == 404
