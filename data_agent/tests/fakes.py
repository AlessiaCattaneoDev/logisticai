"""LLM finto per i test: restituisce messaggi preimpostati, supporta bind_tools e registra cosa riceve."""
from typing import Any

from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage
from pydantic import Field


class FakeToolChatModel(FakeMessagesListChatModel):
    ricevuti: list[list[Any]] = Field(default_factory=list)
    tools: list[dict] = Field(default_factory=list)

    def bind_tools(self, tools: Any, **kwargs: Any):
        self.tools = list(tools)
        return self

    def _generate(self, messages, *args, **kwargs):
        self.ricevuti.append(list(messages))
        return super()._generate(messages, *args, **kwargs)


def call_tools(*calls: tuple[str, dict]) -> AIMessage:
    return AIMessage(
        content="",
        tool_calls=[{"name": name, "args": args, "id": f"call_{i}"} for i, (name, args) in enumerate(calls)],
        usage_metadata={"input_tokens": 100, "output_tokens": 20, "total_tokens": 120},
        response_metadata={"model_name": "fake-model"},
    )


def final(text: str) -> AIMessage:
    return AIMessage(
        content=text,
        usage_metadata={"input_tokens": 150, "output_tokens": 60, "total_tokens": 210},
        response_metadata={"model_name": "fake-model"},
    )
