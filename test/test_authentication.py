import pytest
from sorterpy.exceptions import SorterAPIError


class TestAuthentication:
    @pytest.fixture(autouse=True)
    def check_auto_login(self, sorter_client):
        response = sorter_client.get_current_user()
        if response.status_code == 200:
            data = response.json()
            if data.get("authenticated", False) is True:
                pytest.fail(
                    "AUTO_LOGIN appears to be enabled in borter's .env file. "
                    "This will interfere with authentication tests. "
                    "Please disable AUTO_LOGIN and restart the service."
                )

    def test_login_invalid_credentials(
        self, sorter_client, test_username, test_password
    ):
        with pytest.raises(SorterAPIError) as excinfo:
            sorter_client.login(test_username, test_password)

        assert excinfo.value.status_code in [401, 404]

    def test_register_validation(self, sorter_client):
        with pytest.raises(SorterAPIError) as excinfo:
            sorter_client.register(
                username="test",
                email="invalid-email",
                password="short",  # noqa: S106
            )

        assert excinfo.value.status_code == 400

    def test_session_unauthenticated(self, sorter_client):
        response = sorter_client.get_session()
        assert response.status_code == 200
        data = response.json()
        assert "authenticated" in data
        assert data["authenticated"] is False

    def test_logout_unauthenticated(self, sorter_client):
        response = sorter_client.logout()
        assert response.status_code == 200
