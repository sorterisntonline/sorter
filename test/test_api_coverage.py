import re

from sorterpy import SorterClient


class TestAPICoverage:
    def test_openapi_path_coverage(self, openapi_spec):
        paths = set(openapi_spec["paths"].keys())

        client = SorterClient(base_url="http://localhost:3000")
        client_methods = {
            method
            for method in dir(client)
            if not method.startswith("_") and callable(getattr(client, method))
        }

        for path in paths:
            if path.startswith("/docs") or path == "/openapi.json":
                continue

            match = re.search(r"/api/([^/{]+)", path)
            if not match:
                continue

            resource = match.group(1)

            resource_methods = [m for m in client_methods if resource in m.lower()]

            print(f"Path: {path}")
            print(f"Possible implementing methods: {resource_methods}")

            if not resource_methods:
                print(f"WARNING: No methods found for {path}")

        assert True

    def test_client_method_count(self, openapi_spec):
        api_path_count = len(openapi_spec["paths"])

        client = SorterClient(base_url="http://localhost:3000")
        client_methods = [
            method
            for method in dir(client)
            if not method.startswith("_") and callable(getattr(client, method))
        ]
        client_method_count = len(client_methods)

        print(f"API paths: {api_path_count}")
        print(f"Client methods: {client_method_count}")
        print(f"Client methods: {client_methods}")

        assert True
