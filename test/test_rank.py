import uuid

import pytest
from util import USER_ID, make_request

# --- Configuration ---
NAMESPACE = "test.rank_namespace"


# --- Helper Functions ---


async def setup_entities():
    await delete_entities()
    await create_entities()
    entities = await get_entities()

    for entity_left in entities:
        for entity_right in entities:
            if entity_left["pk"] == entity_right["pk"]:
                continue

            await vote_pair(entity_left["pk"], entity_left["title"], entity_right["pk"], entity_right["title"])
    
    return entities


async def get_entities():
    entity_list = (await make_request("GET", "/entity")).json()

    return [
        entity
        for entity in entity_list
        if entity["ns"] == NAMESPACE
    ]


async def create_entities():
    for title in range(1, 21):
        payload = {
            "ns": NAMESPACE,
            "pk": f"test_rank_pk_{uuid.uuid4()}",
            "title": str(title),
            "metadata": None,
            "profile_picture_url": None,
        }

        await make_request("POST", "/entity", json_payload=payload, is_authenticated=True, assert_status_code=201)


async def delete_entities():
    entity_list = (await make_request("GET", "/entity")).json()
    entities = [
        entity
        for entity in entity_list
        if entity["ns"] == NAMESPACE
    ]

    for entity in entities:
        await make_request(
            "DELETE",
            f"/entity/{entity['ns']}/{entity['pk']}",
            is_authenticated=True,
            assert_status_code=204,
        )


async def vote_pair(left_pk, left_title, right_pk, right_title):
    a = int(left_title)
    b = int(right_title)
    max_dist = 20
    dist = abs(a - b)

    base_weight = 50
    adjustment = (dist / max_dist) * 50

    if a < b:
        magnitude = base_weight - adjustment
    else:
        magnitude = base_weight + adjustment
    magnitude = round(magnitude)

    payload = {
        "left_entity_ns": NAMESPACE,
        "left_entity_pk": left_pk,
        "right_entity_ns": NAMESPACE,
        "right_entity_pk": right_pk,
        "voter_user_id": USER_ID,
        "magnitude": magnitude,
        "attribute_id": 1,
    }

    await make_request("POST", "/vote", json_payload=payload, is_authenticated=True, assert_status_code=201)


# --- Test Suite Marker ---
# Use a class to group related tests and manage state if needed
@pytest.mark.asyncio
@pytest.mark.dependency()
class TestRank:
    @pytest.mark.dependency()
    async def test_rank_correct(self):
        """Tests correctness of the ranking algorithm."""
        entities = await setup_entities()

        payload = [
            {
                "ns": entity["ns"],
                "pk": entity["pk"],
            }
            for entity in entities
        ]

        data = (await make_request("POST", "/rank", json_payload=payload, is_authenticated=True, assert_status_code=200)).json()
        assert len(data["unsorted"]) == 0
        assert len(data["sorted"]) == 20

        data["sorted"].sort(key=lambda entity: entity["score"])

        expected_next_entity = 20
        for entity in data["sorted"]:
            entity = (await make_request("GET", f"/entity/{NAMESPACE}/{entity['identifier']['pk']}", is_authenticated=True)).json()
            assert int(entity["entity"]["title"]) == expected_next_entity
            expected_next_entity -= 1
