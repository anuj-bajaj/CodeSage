from asyncio import base_events
import os
from typing import TypedDict, List, Dict, Any, Annotated
from langgraph.graph import StateGraph, END
from langchain_groq import ChatGroq
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableConfig

class AgentState(TypedDict):
    messages: List[BaseMessage]
    context: List[Dict]
    repo_url: str
    session_id: str

class CodeGenerator:
    def __init__(self, retriever: Any):
        self.llm = ChatGroq(
            model_name="openai/gpt-oss-120b",
            streaming=True,
            reasoning_format="hidden",   # suppress chain-of-thought, stream only the final answer
            reasoning_effort="low",      # keep latency close to the old non-reasoning model
        )
        self.retriever = retriever
        self.workflow = self._create_workflow()

    def _create_workflow(self):
        builder = StateGraph(AgentState)
        builder.add_node("retrieve", self._retrieve)
        builder.add_node("generate", self._generate)
        builder.set_entry_point("retrieve")
        builder.add_edge("retrieve", "generate")
        builder.add_edge("generate", END)
        return builder.compile()

    def _retrieve(self, state: AgentState):
        query = state["messages"][-1].content
        context = self.retriever.hybrid_search(query, state["repo_url"])
        return {"context": context}

    async def _generate(self, state: AgentState):
        # Implementation for token yielding handled in chat_stream endpoint
        return {}

    async def stream_chat(self, messages: List[BaseMessage], repo_url: str):
        messages = messages[-6:]  # only last 6 messages (3 exchanges)
        try:
            context = self.retriever.hybrid_search(
                messages[-1].content, repo_url
            )
        
            def truncate(text, max_chars=800):
                return text[:max_chars] + "..." if len(text) > max_chars else text

            context_str = "\n\n".join([
                f"File: {c['file_path']} (Lines {c['start_line']}-{c['end_line']})\n{truncate(c['content'])}"
                for c in context
            ]).replace("{", "{{").replace("}", "}}")
        
            system_message = (
                "You are CodeSage, an expert code assistant.\n"
                "Answer ONLY from the provided context. Always cite the exact file path and line numbers.\n"
                "If the context doesn't contain enough information, say so clearly.\n\n"
                "Context:\n" + context_str
            )
        
            prompt = ChatPromptTemplate.from_messages([
                ("system", system_message),
                ("placeholder", "{messages}")
            ])
        
            chain = prompt | self.llm
        
            yield {"type": "context", "data": context}
        
            async for chunk in chain.astream({"messages": messages}):
                if chunk.content:
                    yield {"type": "token", "data": chunk.content}
        
            yield {"type": "done", "data": ""}
    
        except Exception as e:
            print(f"Stream error: {str(e)}")
            yield {"type": "error", "data": str(e)}