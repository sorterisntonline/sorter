import uuid
from datetime import datetime, timedelta

import pytest
import pytest_asyncio

from util import make_request


@pytest_asyncio.fixture
async def list_context():
    list_ns = "test.list"
    list_pk = f"list-{uuid.uuid4()}"
    parent_payload = {
        "ns": list_ns,
        "pk": list_pk,
        "title": "List Actions Test",
        "metadata": {},
    }
    await make_request(
        "POST",
        "/entity",
        json_payload=parent_payload,
        is_authenticated=True,
        assert_status_code=201,
    )

    items = []
    for idx in range(3):
        child_ns = "test.item"
        child_pk = f"item-{idx}-{uuid.uuid4()}"
        child_payload = {
            "ns": child_ns,
            "pk": child_pk,
            "title": f"Item {idx}",
            "metadata": {},
        }
        await make_request(
            "POST",
            "/entity",
            json_payload=child_payload,
            is_authenticated=True,
            assert_status_code=201,
        )

        relationship_payload = {
            "parent_ns": list_ns,
            "parent_pk": list_pk,
            "child_ns": child_ns,
            "child_pk": child_pk,
        }
        await make_request(
            "POST",
            "/entity_relationships",
            json_payload=relationship_payload,
            is_authenticated=True,
            assert_status_code=201,
        )
        
        # Add item to pool so it's available for pairing/voting
        await make_request(
            "POST",
            f"/pool/{child_ns}/{child_pk}/add",
            is_authenticated=True,
            assert_status_code=200,
        )
        
        items.append({"ns": child_ns, "pk": child_pk})

    try:
        yield {
            "list_ns": list_ns,
            "list_pk": list_pk,
            "items": items,
        }
    finally:
        for item in items:
            params = {
                "parent_ns": list_ns,
                "parent_pk": list_pk,
                "child_ns": item["ns"],
                "child_pk": item["pk"],
            }
            await make_request(
                "DELETE",
                "/entity_relationships",
                params=params,
                is_authenticated=True,
                assert_status_code=[204, 404],
            )

        for item in items:
            await make_request(
                "DELETE",
                f"/entity/{item['ns']}/{item['pk']}",
                is_authenticated=True,
                assert_status_code=[204, 404],
            )

        await make_request(
            "DELETE",
            f"/entity/{list_ns}/{list_pk}",
            is_authenticated=True,
            assert_status_code=[204, 404],
        )


def _contains_entity(collection, target):
    return any(e["ns"] == target["ns"] and e["pk"] == target["pk"] for e in collection)


@pytest.mark.asyncio
async def test_deny_and_reset_flow(list_context):
    list_ns = list_context["list_ns"]
    list_pk = list_context["list_pk"]
    target = list_context["items"][0]

    # Ensure default state includes the target entity
    state = (
        await make_request(
            "GET",
            f"/list-actions/{list_ns}/{list_pk}",
            is_authenticated=True,
        )
    ).json()
    assert _contains_entity(state["included"], target)

    # Deny the target entity
    deny_payload = {
        "list_ns": list_ns,
        "list_pk": list_pk,
        "entity_ns": target["ns"],
        "entity_pk": target["pk"],
        "action": "deny",
    }
    await make_request(
        "POST",
        "/list-actions",
        json_payload=deny_payload,
        is_authenticated=True,
        assert_status_code=201,
    )

    state = (
        await make_request(
            "GET",
            f"/list-actions/{list_ns}/{list_pk}",
            is_authenticated=True,
        )
    ).json()
    assert not _contains_entity(state["included"], target)
    assert _contains_entity(state["excluded"], target)

    # Pair request pinned to denied entity should fail (entity treated as OUT)
    await make_request(
        "GET",
        "/pair",
        params={
            "ns": list_ns,
            "pk": list_pk,
            "left_pin_ns": target["ns"],
            "left_pin_pk": target["pk"],
        },
        is_authenticated=True,
        assert_status_code=400,
    )

    # Reset the entity back to default state
    reset_payload = {
        "list_ns": list_ns,
        "list_pk": list_pk,
        "entity_ns": target["ns"],
        "entity_pk": target["pk"],
        "action": "reset",
    }
    await make_request(
        "POST",
        "/list-actions",
        json_payload=reset_payload,
        is_authenticated=True,
        assert_status_code=201,
    )

    state = (
        await make_request(
            "GET",
            f"/list-actions/{list_ns}/{list_pk}",
            is_authenticated=True,
        )
    ).json()
    assert _contains_entity(state["included"], target)

    # Pair request with pin now succeeds and includes the target entity again
    pair_response = (
        await make_request(
            "GET",
            "/pair",
            params={
                "ns": list_ns,
                "pk": list_pk,
                "left_pin_ns": target["ns"],
                "left_pin_pk": target["pk"],
            },
            is_authenticated=True,
        )
    ).json()
    assert pair_response["left_entity"]["pk"] == target["pk"]


@pytest.mark.asyncio
async def test_allowlist_flow(list_context):
    list_ns = list_context["list_ns"]
    list_pk = list_context["list_pk"]
    items = list_context["items"]

    # Switch list to exclude-by-default behavior
    await make_request(
        "PUT",
        f"/list-actions/{list_ns}/{list_pk}/behavior",
        json_payload={"include_by_default": False},
        is_authenticated=True,
        assert_status_code=200,
    )

    state = (
        await make_request(
            "GET",
            f"/list-actions/{list_ns}/{list_pk}",
            is_authenticated=True,
        )
    ).json()
    assert state["include_by_default"] is False
    assert not state["included"]
    assert len(state["excluded"]) == len(items)

    # With no allowed entities, pair selection should fail
    await make_request(
        "GET",
        "/pair",
        params={"ns": list_ns, "pk": list_pk},
        is_authenticated=True,
        assert_status_code=400,
    )

    allow_targets = items[:2]
    for target in allow_targets:
        await make_request(
            "POST",
            "/list-actions",
            json_payload={
                "list_ns": list_ns,
                "list_pk": list_pk,
                "entity_ns": target["ns"],
                "entity_pk": target["pk"],
                "action": "allow",
            },
            is_authenticated=True,
            assert_status_code=201,
        )

    state = (
        await make_request(
            "GET",
            f"/list-actions/{list_ns}/{list_pk}",
            is_authenticated=True,
        )
    ).json()
    assert sorted(e["pk"] for e in state["included"]) == sorted(
        target["pk"] for target in allow_targets
    )

    pair = (
        await make_request(
            "GET",
            "/pair",
            params={"ns": list_ns, "pk": list_pk},
            is_authenticated=True,
        )
    ).json()
    returned_ids = {pair["left_entity"]["pk"], pair["right_entity"]["pk"]}
    assert returned_ids.issubset({target["pk"] for target in allow_targets})

    # Reset one of the allowed entities and verify it exits the IN panel
    reset_target = allow_targets[0]
    await make_request(
        "POST",
        "/list-actions",
        json_payload={
            "list_ns": list_ns,
            "list_pk": list_pk,
            "entity_ns": reset_target["ns"],
            "entity_pk": reset_target["pk"],
            "action": "reset",
        },
        is_authenticated=True,
        assert_status_code=201,
    )

    state = (
        await make_request(
            "GET",
            f"/list-actions/{list_ns}/{list_pk}",
            is_authenticated=True,
        )
    ).json()
    assert not _contains_entity(state["included"], reset_target)
    assert _contains_entity(state["excluded"], reset_target)


@pytest.mark.asyncio
async def test_temporary_block_semantics(list_context):
    list_ns = list_context["list_ns"]
    list_pk = list_context["list_pk"]
    target = list_context["items"][1]

    # Expired temporary block should have no effect
    expired_payload = {
        "list_ns": list_ns,
        "list_pk": list_pk,
        "entity_ns": target["ns"],
        "entity_pk": target["pk"],
        "action": "temporary_block",
        "expires_at": (datetime.utcnow() - timedelta(hours=1)).isoformat(),
    }
    await make_request(
        "POST",
        "/list-actions",
        json_payload=expired_payload,
        is_authenticated=True,
        assert_status_code=201,
    )

    state = (
        await make_request(
            "GET",
            f"/list-actions/{list_ns}/{list_pk}",
            is_authenticated=True,
        )
    ).json()
    assert _contains_entity(state["included"], target)

    # Active temporary block should exclude the entity
    active_payload = {
        "list_ns": list_ns,
        "list_pk": list_pk,
        "entity_ns": target["ns"],
        "entity_pk": target["pk"],
        "action": "temporary_block",
        "expires_at": (datetime.utcnow() + timedelta(hours=2)).isoformat(),
    }
    await make_request(
        "POST",
        "/list-actions",
        json_payload=active_payload,
        is_authenticated=True,
        assert_status_code=201,
    )

    state = (
        await make_request(
            "GET",
            f"/list-actions/{list_ns}/{list_pk}",
            is_authenticated=True,
        )
    ).json()
    assert not _contains_entity(state["included"], target)

    await make_request(
        "GET",
        "/pair",
        params={
            "ns": list_ns,
            "pk": list_pk,
            "left_pin_ns": target["ns"],
            "left_pin_pk": target["pk"],
        },
        is_authenticated=True,
        assert_status_code=400,
    )

    # Reset brings the entity back into the IN panel
    await make_request(
        "POST",
        "/list-actions",
        json_payload={
            "list_ns": list_ns,
            "list_pk": list_pk,
            "entity_ns": target["ns"],
            "entity_pk": target["pk"],
            "action": "reset",
        },
        is_authenticated=True,
        assert_status_code=201,
    )

    state = (
        await make_request(
            "GET",
            f"/list-actions/{list_ns}/{list_pk}",
            is_authenticated=True,
        )
    ).json()
    assert _contains_entity(state["included"], target)
