# sorter API Testing

this directory contains pytest tests for the sorter api using the sorterpy client.

## setup

```bash
pip install -r requirements.txt
```

## configuration

copy the example environment file and modify if needed:

```bash
cp .env.test.example .env.test
```

make sure that borter does not have `AUTO_LOGIN=true` set in its .env file, as this will interfere with the authentication tests.

## running tests

```bash
./run_tests.sh
```

or

```bash
python -m pytest
```

## running tests with coverage

```bash
pytest --cov=. --cov-report=term-missing
```

## test documentation

see [docs.md](docs.md) for more information on the test structure and available fixtures. 