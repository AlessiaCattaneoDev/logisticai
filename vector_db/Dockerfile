# ChromaDB per Railway: i dati stanno nel volume montato su /data.
FROM python:3.12-slim
COPY vector_db/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt
CMD ["sh", "-c", "exec chroma run --path /data --host :: --port ${PORT:-8000}"]
