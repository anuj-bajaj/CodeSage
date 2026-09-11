import os
import time
import pytest
import requests
from ragas import evaluate
from ragas.metrics import faithfulness, AnswerRelevancy, context_precision
from ragas.llms import LangchainLLMWrapper
from ragas.embeddings import LangchainEmbeddingsWrapper
from ragas.run_config import RunConfig
from langchain_groq import ChatGroq
from langchain_huggingface import HuggingFaceEmbeddings
from datasets import Dataset
from dotenv import load_dotenv
import langchain_groq.chat_models as groq_chat_models

load_dotenv()

# Patch both sync and async ChatGroq generate methods to strip 'n' for Groq compatibility
_original_generate = groq_chat_models.ChatGroq._generate
_original_agenerate = groq_chat_models.ChatGroq._agenerate

def _patched_generate(self, messages, stop=None, run_manager=None, **kwargs):
    kwargs.pop('n', None)
    return _original_generate(self, messages, stop=stop, run_manager=run_manager, **kwargs)

async def _patched_agenerate(self, messages, stop=None, run_manager=None, **kwargs):
    kwargs.pop('n', None)
    return await _original_agenerate(self, messages, stop=stop, run_manager=run_manager, **kwargs)

groq_chat_models.ChatGroq._generate = _patched_generate
groq_chat_models.ChatGroq._agenerate = _patched_agenerate

# The 5 questions to ask and evaluate
QUESTIONS = [
    "What does the Field function do?",
    "How are relationships defined between models?",
    "What is the purpose of the Session class?",
    "How does SQLModel handle database migrations?",
    "What are the key dependencies of this project?"
]

# Ground truths for the SQLModel codebase (since ground truth requires human judgment)
GROUND_TRUTH = [
    "The Field function in SQLModel is used to define metadata, database column properties (such as primary keys, indexes, and nullability), and validation rules for model fields.",
    "Relationships between models are defined using the Relationship function, establishing linkages similar to SQLAlchemy relationships.",
    "The Session class in SQLModel is a subclass of SQLAlchemy's Session used to group database operations and manage transactions.",
    "SQLModel does not have a built-in migration tool and instead relies on Alembic for handling database migrations.",
    "The key dependencies of SQLModel are SQLAlchemy and Pydantic."
]

# This test hits a live, deployed backend and will auto-ingest a repository
# into it if not already present. That's appropriate for a deliberate live
# evaluation run, but not something that should happen silently every time
# someone runs `pytest`. Require an explicit opt-in.
RUN_LIVE_EVAL = os.getenv("RUN_LIVE_EVAL") == "1"

# Defaults to the deployed Space, but can be pointed at localhost or a
# different deployment without editing this file.
BACKEND_URL = os.getenv("CODESAGE_EVAL_BACKEND_URL", "https://codificador-23-codesage-backend.hf.space")
EVAL_REPO_URL = os.getenv("CODESAGE_EVAL_REPO_URL", "https://github.com/tiangolo/sqlmodel")


def setup_evaluation_data():
    """
    Checks health of the backend server.
    Ensures the SQLModel repository is ingested.
    Pipes the 5 questions through the live chat endpoint and extracts real answers and reasoning traces.
    """
    backend_url = BACKEND_URL
    repo_url = EVAL_REPO_URL

    # 1. Ping /health or /api/health to ensure the backend is running
    print("Checking backend health status...")
    try:
        health_resp = requests.get(f"{backend_url}/health", timeout=5)
        if health_resp.status_code != 200:
            pytest.skip("Backend /health endpoint did not return a successful status.")
    except requests.exceptions.RequestException as e:
        pytest.skip(f"Backend server is not reachable at {backend_url}. Error: {e}")

    # 2. Check if the repo is already indexed
    print("Checking if repository is already indexed...")
    try:
        repos_resp = requests.get(f"{backend_url}/api/repos")
        repos_resp.raise_for_status()
        repos = repos_resp.json()
    except Exception as e:
        pytest.fail(f"Failed to query indexed repositories: {e}")

    is_indexed = any(repo.get("repo_url") == repo_url for repo in repos)

    if not is_indexed:
        print(f"Repository {repo_url} is not indexed. Triggering ingestion...")
        try:
            ingest_resp = requests.post(f"{backend_url}/api/ingest/", json={"repo_url": repo_url})
            ingest_resp.raise_for_status()
        except Exception as e:
            pytest.fail(f"Failed to start ingestion process: {e}")

        # Poll ingestion status until complete
        print("Waiting for ingestion to complete...")
        max_attempts = 120  # 10 minutes max with 5s polling
        attempt = 0
        while attempt < max_attempts:
            time.sleep(5)
            try:
                status_resp = requests.get(f"{backend_url}/api/ingest/status/{repo_url}")
                status_resp.raise_for_status()
                status_data = status_resp.json()
                status = status_data.get("status")
                message = status_data.get("message", "")
                progress = status_data.get("progress", 0)
                print(f"[{progress}%] Status: {status} - {message}")

                if status == "done":
                    print("Ingestion completed successfully.")
                    break
                elif status == "error":
                    pytest.fail(f"Ingestion failed with error: {message}")
            except Exception as e:
                print(f"Error checking ingestion status: {e}")
            attempt += 1
        else:
            pytest.fail("Ingestion process timed out.")
    else:
        print(f"Repository {repo_url} is already indexed.")

    # 3. Query the live chat API for each question
    answers = []
    contexts_list = []

    print("Generating answers and contexts from the running CodeSage pipeline...")
    for q in QUESTIONS:
        print(f"Querying: '{q}'")
        try:
            chat_resp = requests.post(
                f"{backend_url}/api/chat/",
                json={
                    "message": q,
                    "repo_url": repo_url,
                    "history": []
                }
            )
            chat_resp.raise_for_status()
            chat_data = chat_resp.json()

            answer = chat_data.get("answer", "")
            reasoning_trace = chat_data.get("reasoning_trace", [])
            contexts = [trace.get("content", "") for trace in reasoning_trace]

            answers.append(answer)
            contexts_list.append(contexts)
        except Exception as e:
            pytest.fail(f"Failed to get response for question '{q}': {e}")

    # Build the eval_data dict dynamically
    eval_data = {
        "question": QUESTIONS,
        "answer": answers,
        "contexts": contexts_list,
        "ground_truth": GROUND_TRUTH
    }
    return eval_data


@pytest.mark.skipif(
    not RUN_LIVE_EVAL,
    reason="Live evaluation against a deployed backend is opt-in. Set RUN_LIVE_EVAL=1 to run it."
)
def test_rag_pipeline_ragas_scores():
    """
    Runs RAGAS evaluation (faithfulness, answer relevancy, context precision)
    using Groq as the judge LLM and a local HuggingFace model for embeddings.
    Uses dynamically generated data from the live running backend.

    This test calls a real, deployed backend (BACKEND_URL) and may ingest
    a repository into it if not already indexed (EVAL_REPO_URL). It is
    gated behind RUN_LIVE_EVAL=1 so it never runs accidentally as part of
    a normal `pytest` invocation.
    """
    assert os.getenv("GROQ_API_KEY"), (
        "GROQ_API_KEY not found in environment. Check your .env file."
    )

    # Set up evaluation data dynamically from the running pipeline
    eval_data = setup_evaluation_data()

    dataset = Dataset.from_dict(eval_data)

    judge_llm = LangchainLLMWrapper(ChatGroq(
        model="openai/gpt-oss-120b",
        api_key=os.getenv("GROQ_API_KEY"),
        temperature=0,
        n=1,
        reasoning_format="hidden",  # judge must see only the final verdict, not chain-of-thought
        reasoning_effort="low",
    ))

    judge_embeddings = LangchainEmbeddingsWrapper(HuggingFaceEmbeddings(
        model_name="sentence-transformers/all-MiniLM-L6-v2"
    ))

    print("Running RAGAS evaluation with Groq judge...")

    # strictness=1 keeps this metric to a single LLM generation per answer
    # instead of its default of 3. The default sends n=3 to the judge LLM,
    # which Groq's current reasoning models (gpt-oss-120b, qwen3.6-27b, etc.)
    # reject with "'n' : number must be at most 1".
    answer_relevancy_metric = AnswerRelevancy(strictness=1)

    results = evaluate(
        dataset,
        metrics=[faithfulness, answer_relevancy_metric, context_precision],
        llm=judge_llm,
        embeddings=judge_embeddings,
        run_config=RunConfig(timeout=180, max_retries=5, max_workers=2),
    )

    scores = results.to_pandas()
    print("\n--- RAGAS Evaluation Scores ---")
    q_col = "question" if "question" in scores.columns else ("user_input" if "user_input" in scores.columns else None)
    cols_to_print = []
    if q_col:
        cols_to_print.append(q_col)
    for m in ["faithfulness", "answer_relevancy", "context_precision"]:
        if m in scores.columns:
            cols_to_print.append(m)
    print(scores[cols_to_print].to_string(index=False))
    print("--------------------------------\n")

    # Lower assertion thresholds to > 0.3 as requested
    assert scores["faithfulness"].mean() > 0.3, f"Faithfulness score {scores['faithfulness'].mean()} was <= 0.3"
    assert scores["answer_relevancy"].mean() > 0.3, f"Answer Relevancy score {scores['answer_relevancy'].mean()} was <= 0.3"
    assert scores["context_precision"].mean() > 0.3, f"Context Precision score {scores['context_precision'].mean()} was <= 0.3"


if __name__ == "__main__":
    test_rag_pipeline_ragas_scores()