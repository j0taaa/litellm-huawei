FROM ghcr.io/berriai/litellm-database:main-latest

RUN python -m ensurepip --upgrade \
  && python -m pip install --no-cache-dir asyncpg==0.30.0
