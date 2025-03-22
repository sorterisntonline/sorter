import pytest
import json

class TestAPISchema:
    """
    Tests for validating API schema against OpenAPI spec
    """
    
    def test_openapi_spec_loaded(self, openapi_spec):
        """
        Test that OpenAPI spec can be loaded
        """
        assert openapi_spec is not None
        assert "info" in openapi_spec
        assert "paths" in openapi_spec
        assert "components" in openapi_spec
    
    def test_validate_health_endpoint(self, openapi_spec):
        """
        Test that the health endpoint matches the OpenAPI spec
        """
        assert "/api/health" in openapi_spec["paths"]
        health_path = openapi_spec["paths"]["/api/health"]
        assert "get" in health_path
        
        # Verify response schema
        assert "responses" in health_path["get"]
        assert "200" in health_path["get"]["responses"]
    
    def test_validate_tag_endpoints(self, openapi_spec):
        """
        Test that tag endpoints match the OpenAPI spec
        """
        # Check that tag-related endpoints are defined
        assert "/api/tags" in openapi_spec["paths"]
        assert "/api/tag/{id}" in openapi_spec["paths"]
        
        # Verify tag schema
        schema_refs = openapi_spec["components"]["schemas"]
        assert "Tag" in schema_refs
        
        # Verify tag schema properties
        tag_properties = schema_refs["Tag"]["properties"]
        required_properties = ["id", "title", "slug"]
        for prop in required_properties:
            assert prop in tag_properties
    
    def test_validate_item_endpoints(self, openapi_spec):
        """
        Test that item endpoints match the OpenAPI spec
        """
        # Check that item-related endpoints are defined
        assert "/api/items" in openapi_spec["paths"]
        assert "/api/item/{id}" in openapi_spec["paths"]
        
        # Verify item schema
        schema_refs = openapi_spec["components"]["schemas"]
        assert "Item" in schema_refs
        
        # Verify item schema properties
        item_properties = schema_refs["Item"]["properties"]
        required_properties = ["id", "title"]
        for prop in required_properties:
            assert prop in item_properties
    
    def test_validate_vote_endpoints(self, openapi_spec):
        """
        Test that vote endpoints match the OpenAPI spec
        """
        # Check that vote-related endpoints are defined
        assert "/api/votes" in openapi_spec["paths"]
        
        # Verify vote schema
        schema_refs = openapi_spec["components"]["schemas"]
        assert "Vote" in schema_refs
        
        # Verify vote schema properties
        vote_properties = schema_refs["Vote"]["properties"]
        required_properties = ["id", "left_item_id", "right_item_id", "tag_id"]
        for prop in required_properties:
            assert prop in vote_properties 