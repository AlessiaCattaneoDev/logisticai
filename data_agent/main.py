"""Data agent LogisticAI: microservizio FastAPI per l'analisi dello storico spedizioni."""
from fastapi import FastAPI


def create_app() -> FastAPI:
    app = FastAPI(title="LogisticAI Data Agent", version="0.1.0")

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    return app


app = create_app()
