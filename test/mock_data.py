"""
Mock data for tests
"""

# Sample tag data
SAMPLE_TAG = {
    "id": 1,
    "title": "Test Tag",
    "slug": "test-tag",
    "description": "A test tag for unit testing",
    "owner": "test_user",
    "created_at": "2023-01-01T00:00:00Z",
    "edited_at": "2023-01-01T00:00:00Z"
}

# Sample item data
SAMPLE_ITEM = {
    "id": 1,
    "title": "Test Item",
    "slug": "test-item",
    "body": "This is a test item for unit testing",
    "owner": "test_user",
    "created_at": "2023-01-01T00:00:00Z",
    "edited_at": "2023-01-01T00:00:00Z"
}

# Sample vote data
SAMPLE_VOTE = {
    "id": 1,
    "left_item_id": 1,
    "right_item_id": 2,
    "tag_id": 1,
    "owner": "test_user",
    "created_at": "2023-01-01T00:00:00Z",
    "value": 0.75  # 0.5 is neutral, higher favors left item
}

# Sample user data
SAMPLE_USER = {
    "id": 1,
    "user_name": "test_user",
    "email": "test@example.com",
    "pfp_url": "https://example.com/avatar.png",
    "created_at": "2023-01-01T00:00:00Z"
} 