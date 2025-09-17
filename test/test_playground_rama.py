import pytest

from util import make_request


@pytest.mark.asyncio
async def test_playground_round_trip():
    list_name = "ci-rama"

    clear_response = await make_request(
        "POST",
        "/playground/clear",
        json_payload={"list": list_name},
        assert_status_code=200,
    )
    payload = clear_response.json()
    assert payload["list"] == list_name
    assert payload["items"] == []

    created = await make_request(
        "POST",
        "/playground/items",
        json_payload={"list": list_name, "value": "alpha"},
        assert_status_code=201,
    )
    body = created.json()
    assert body["list"] == list_name
    assert body["items"] == ["alpha"]

    second = await make_request(
        "POST",
        "/playground/items",
        json_payload={"list": list_name, "value": "beta"},
        assert_status_code=201,
    )
    assert second.json()["items"] == ["alpha", "beta"]

    fetched = await make_request(
        "GET",
        "/playground/items",
        params={"list": list_name},
        assert_status_code=200,
    )
    assert fetched.json()["items"] == ["alpha", "beta"]

    cleared = await make_request(
        "POST",
        "/playground/clear",
        json_payload={"list": list_name},
        assert_status_code=200,
    )
    assert cleared.json()["items"] == []
