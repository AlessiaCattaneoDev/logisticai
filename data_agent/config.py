"""Configurazione del data agent, letta dalle variabili d'ambiente (.env nella root del repo)."""
from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

SERVICE_DIR = Path(__file__).resolve().parent


@dataclass(frozen=True)
class Settings:
    internal_service_secret: str
    csv_path: Path
    llm_provider: str
    llm_model: str
    timeout_s: float = 90.0
    max_iterations: int = 8

    @property
    def model_id(self) -> str:
        return f"{self.llm_provider}:{self.llm_model}"

    @classmethod
    def from_env(cls, env: Mapping[str, str] = os.environ) -> "Settings":
        problems = []
        secret = env.get("INTERNAL_SERVICE_SECRET", "")
        if len(secret) < 32:
            problems.append("INTERNAL_SERVICE_SECRET: obbligatoria, almeno 32 caratteri")
        provider = env.get("DATA_LLM_PROVIDER") or "openai"
        model = env.get("DATA_LLM_MODEL", "")
        if not model:
            problems.append("DATA_LLM_MODEL: obbligatoria")
        if problems:
            raise ValueError("Configurazione non valida (.env):\n- " + "\n- ".join(problems))
        csv = Path(env.get("CSV_PATH") or "../data/spedizioni.csv")
        return cls(
            internal_service_secret=secret,
            csv_path=(csv if csv.is_absolute() else SERVICE_DIR / csv).resolve(),
            llm_provider=provider,
            llm_model=model,
            timeout_s=float(env.get("DATA_AGENT_TIMEOUT_S") or 90),
            max_iterations=int(env.get("DATA_AGENT_MAX_ITERATIONS") or 8),
        )
