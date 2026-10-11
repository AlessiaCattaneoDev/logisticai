"""LLM finto per i test: restituisce messaggi preimpostati e supporta bind_tools."""
from typing import Any

from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage


class FakeToolChatModel(FakeMessagesListChatModel):
    def bind_tools(self, tools: Any, **kwargs: Any):
        return self


def run_code(code: str, call_id: str = "call_1") -> AIMessage:
    return AIMessage(
        content="",
        tool_calls=[{"name": "python_repl_ast", "args": {"query": code}, "id": call_id}],
        usage_metadata={"input_tokens": 100, "output_tokens": 20, "total_tokens": 120},
        response_metadata={"model_name": "fake-model"},
    )


def final(text: str) -> AIMessage:
    return AIMessage(
        content=text,
        usage_metadata={"input_tokens": 150, "output_tokens": 60, "total_tokens": 210},
        response_metadata={"model_name": "fake-model"},
    )
