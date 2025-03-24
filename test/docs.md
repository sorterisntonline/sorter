# sorter API Testing

this document explains the structure and purpose of the test suite.

## test structure

- **test_api_schema.py**: validates that the API schema matches the OpenAPI spec
- **test_authentication.py**: tests authentication-related endpoints
- **test_client.py**: tests the SorterClient class itself
- **test_health.py**: tests the health endpoint
- **test_items.py**: tests item-related endpoints
- **test_tags.py**: tests tag-related endpoints
- **test_users.py**: tests user-related endpoints
- **test_votes.py**: tests vote-related endpoints
- **test_integration.py**: integration tests for tag and item creation
- **test_api_coverage.py**: analyzes API coverage by comparing client methods to OpenAPI paths

## prerequisites

1. sorter must be running and accessible at the URL specified in `.env.test`
2. sorter must NOT have `AUTO_LOGIN=true` set in its .env file
3. the OpenAPI spec must be available at `../openapi.json` or from the running sorter instance

## running specific tests

to run a specific test file:

```bash
python -m pytest test_health.py
```

to run a specific test class:

```bash
python -m pytest test_health.py::TestHealth
```

to run a specific test method:

```bash
python -m pytest test_health.py::TestHealth::test_health_endpoint
```

## test markers

- **integration**: integration tests that require a running sorter instance

to run only integration tests:

```bash
python -m pytest -m integration
```

to run all tests except integration tests:

```bash
python -m pytest -m "not integration"
```

## test fixtures

the following fixtures are available:

- **sorter_client**: a SorterClient instance for testing
- **openapi_spec**: the loaded OpenAPI specification
- **test_username**: a username for testing
- **test_password**: a password for testing
- **check_borter_config**: an automatic fixture that checks if borter is running correctly

these are defined in `conftest.py`
