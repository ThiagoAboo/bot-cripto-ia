FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1

WORKDIR /workspace/bots

COPY bots/python ./python

RUN python -m pip install --no-cache-dir -r python/requirements.runtime.txt \
  && python -m pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu torch==2.10.0

CMD ["python", "python/service.py"]
