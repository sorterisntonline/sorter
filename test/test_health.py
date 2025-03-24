class TestHealth:
    def test_health_endpoint(self, sorter_client):
        response = sorter_client.health()
        assert response.status_code == 200
        assert "healthy" in response.json()

    def test_health_contains_version(self, sorter_client):
        response = sorter_client.health()
        assert response.status_code == 200
        data = response.json()
        assert "version" in data
