FROM python:3.12-slim

WORKDIR /workspace
COPY huawei_litellm ./huawei_litellm
COPY custom_callbacks.py ./

RUN python -m compileall huawei_litellm custom_callbacks.py

CMD ["python", "-m", "huawei_litellm.sync"]
