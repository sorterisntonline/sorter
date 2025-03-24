import os

import httpx
import pytest
from sorterpy import SorterClient


class TestClient:
    def test_client_initialization(self):
        client = SorterClient(base_url="http://localhost:3000")
        assert client is not None
        assert client.base_url == "http://localhost:3000"

    def test_client_initialization_with_environment(self):
        os.environ["SORTER_API_URL"] = "http://test-url:3000"

        client = SorterClient()

        assert client.base_url == "http://test-url:3000"

        if "SORTER_API_URL" in os.environ:
            del os.environ["SORTER_API_URL"]

    def test_client_custom_headers(self):
        client = SorterClient(base_url="http://localhost:3000")
        client.set_headers({"X-Custom-Header": "test-value"})

        assert "X-Custom-Header" in client.headers
        assert client.headers["X-Custom-Header"] == "test-value"

    def test_client_auth_token(self):
        client = SorterClient(base_url="http://localhost:3000")
        client.set_auth_token("test-token")

        assert "Authorization" in client.headers
        assert client.headers["Authorization"] == "Bearer test-token"

    def test_invalid_url_raises_error(self):
        client = SorterClient(base_url="invalid-url")

        with pytest.raises(httpx.InvalidURL):
            client.health()
