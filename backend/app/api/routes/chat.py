from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from app.models.schemas import ChatRequest, ChatResponse, ReasoningTrace
from app.engine.generator import CodeGenerator
from app.engine.retriever import CodeRetriever
from app.engine.embedder import CodeEmbedder
from langchain_core.messages import HumanMessage, AIMessage
import json

router = APIRouter()
embedder = CodeEmbedder()
retriever = CodeRetriever(embedder)
generator = CodeGenerator(retriever)

@router.post("/")
async def chat(request: ChatRequest):
    try:
        messages = []
        for m in request.history:
            if m["role"] == "user":
                messages.append(HumanMessage(content=m["content"]))
            else:
                messages.append(AIMessage(content=m["content"]))
        messages.append(HumanMessage(content=request.message))

        answer_tokens = []
        context = []

        async for event in generator.stream_chat(messages, request.repo_url):
            if event["type"] == "context":
                context = event["data"]
            elif event["type"] == "token":
                answer_tokens.append(event["data"])
            elif event["type"] == "error":
                # Previously silently ignored, which returned a fake HTTP 200
                # with an empty answer instead of surfacing the real failure.
                raise Exception(event["data"])

        answer = "".join(answer_tokens)

        reasoning_trace = [
            ReasoningTrace(
                file_path=c["file_path"],
                start_line=c["start_line"],
                end_line=c["end_line"],
                chunk_type=c["chunk_type"],
                content=c["content"]
            )
            for c in context
        ]

        return ChatResponse(answer=answer, reasoning_trace=reasoning_trace)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/stream")
async def chat_stream(request: ChatRequest):
    async def event_generator():
        try:
            messages = []
            for m in request.history:
                if m["role"] == "user":
                    messages.append(HumanMessage(content=m["content"]))
                else:
                    messages.append(AIMessage(content=m["content"]))
            messages.append(HumanMessage(content=request.message))

            async for event in generator.stream_chat(messages, request.repo_url):
                yield f"data: {json.dumps(event)}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'data': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")