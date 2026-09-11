from pydantic import BaseModel, field_validator
from typing import List, Optional, Dict

class IngestRequest(BaseModel):
    repo_url: str

    @field_validator("repo_url")
    @classmethod
    def normalize_repo_url(cls, v: str) -> str:
        # Strip trailing slash so "…/repo" and "…/repo/" are always
        # treated as the same repository everywhere downstream.
        return v.rstrip("/")

class IngestResponse(BaseModel):
    status: str = "completed"
    repo_url: str = ""
    files_processed: int
    chunks_indexed: int
    languages_detected: List[str]

class ChatRequest(BaseModel):
    message: str
    repo_url: str
    history: Optional[List[Dict[str, str]]] = []

    @field_validator("repo_url")
    @classmethod
    def normalize_repo_url(cls, v: str) -> str:
        return v.rstrip("/")

class ReasoningTrace(BaseModel):
    file_path: str
    start_line: int
    end_line: int
    chunk_type: str
    content: str

class ChatResponse(BaseModel):
    answer: str
    reasoning_trace: List[ReasoningTrace]

class SourceReference(BaseModel):
    file_path: str
    start_line: int
    end_line: int
    chunk_type: str
    content: str

class ChatStreamChunk(BaseModel):
    token: Optional[str] = None
    sources: Optional[List[SourceReference]] = None

class CodeChunk(BaseModel):
    content: str
    file_path: str
    language: str
    chunk_type: str
    start_line: int
    end_line: int
    repo_url: str