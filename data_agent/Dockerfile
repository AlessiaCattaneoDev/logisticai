# Data agent Python per Railway. Contesto di build: la root del repository.
FROM python:3.12-slim
WORKDIR /app
COPY data_agent/requirements.txt data_agent/requirements.txt
RUN pip install --no-cache-dir -r data_agent/requirements.txt
COPY data_agent data_agent
COPY data/spedizioni.csv data/spedizioni.csv
WORKDIR /app/data_agent
# Le reti private di Railway risolvono i nomi anche in IPv4 (uvicorn su "::" accetterebbe solo IPv6).
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8001}"]
