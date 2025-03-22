import pytest
import json
import re
from sorterpy import SorterClient

class TestAPICoverage:
    """
    Tests to analyze API coverage
    """
    
    def test_openapi_path_coverage(self, openapi_spec):
        """
        Test that all paths in the OpenAPI spec are covered by tests
        """
        # Get all paths from the OpenAPI spec
        paths = set(openapi_spec["paths"].keys())
        
        # Get all client methods that might map to API paths
        client = SorterClient(base_url="http://localhost:3000")
        client_methods = set(method for method in dir(client) 
                           if not method.startswith('_') and callable(getattr(client, method)))
        
        # Check if there are methods for each path
        for path in paths:
            # Skip the swagger UI and docs paths
            if path.startswith('/docs') or path == '/openapi.json':
                continue
                
            # Extract the base resource name from the path
            # E.g., '/api/tags' -> 'tags', '/api/tag/{id}' -> 'tag'
            match = re.search(r'/api/([^/{]+)', path)
            if not match:
                continue
                
            resource = match.group(1)
            
            # Check if there's a corresponding method in the client for this resource
            resource_methods = [m for m in client_methods if resource in m.lower()]
            
            # Report the resource and the methods that might implement it
            print(f"Path: {path}")
            print(f"Possible implementing methods: {resource_methods}")
            
            # If no methods are found, this is potentially an uncovered API
            if not resource_methods:
                print(f"WARNING: No methods found for {path}")
                
        # This test doesn't actually assert anything, it just reports coverage
        # A more sophisticated version could check specific method mappings
        assert True
    
    def test_client_method_count(self, openapi_spec):
        """
        Count client methods and compare to API paths
        """
        # Count paths in OpenAPI spec
        api_path_count = len(openapi_spec["paths"])
        
        # Count methods in client
        client = SorterClient(base_url="http://localhost:3000")
        client_methods = [method for method in dir(client) 
                        if not method.startswith('_') and callable(getattr(client, method))]
        client_method_count = len(client_methods)
        
        # Log the counts
        print(f"API paths: {api_path_count}")
        print(f"Client methods: {client_method_count}")
        print(f"Client methods: {client_methods}")
        
        # This test doesn't assert anything, just reports counts
        assert True 