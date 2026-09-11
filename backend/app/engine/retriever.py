import os
from typing import List, Dict, Any
from qdrant_client import QdrantClient, models
from qdrant_client.http.models import SparseVector
from sentence_transformers import CrossEncoder
from fastembed import SparseTextEmbedding

class CodeRetriever:
    def __init__(self, embedder: Any):
        self.qdrant = QdrantClient(
            url=os.getenv("QDRANT_URL"),
            api_key=os.getenv("QDRANT_API_KEY"),
        )
        self.embedder = embedder
        self._reranker = None
        self._sparse_model = None
        self.collection_name = "code_sage"

    @property
    def reranker(self):
        if self._reranker is None:
            self._reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")
        return self._reranker

    @property
    def sparse_model(self):
        if self._sparse_model is None:
            self._sparse_model = SparseTextEmbedding(model_name="Qdrant/bm25")
        return self._sparse_model

    def hybrid_search(self, query: str, repo_url: str, limit: int = 5) -> List[Dict[str, Any]]:
        dense_vector = self.embedder.embed_query(query)

        sparse_result = list(self.sparse_model.embed([query]))[0]
        sparse_vector = SparseVector(
            indices=sparse_result.indices.tolist(),
            values=sparse_result.values.tolist()
        )

        repo_filter = models.Filter(
            must=[models.FieldCondition(
                key="repo_url",
                match=models.MatchValue(value=repo_url)
            )]
        )

        dense_hits = self.qdrant.query_points(
            collection_name=self.collection_name,
            query=dense_vector,
            using="dense",
            query_filter=repo_filter,
            limit=20,
            with_payload=True
        ).points

        sparse_hits = self.qdrant.query_points(
            collection_name=self.collection_name,
            query=sparse_vector,
            using="sparse",
            query_filter=repo_filter,
            limit=20,
            with_payload=True
        ).points

        query_lower = query.lower()

        def matches_filename(hit):
            fp = (hit.payload.get('file_path') or '').lower()
            fname = fp.split('\\')[-1].split('/')[-1]
            return fname in query_lower

        # Check if any chunk's filename is directly named in the query
        filename_match_hit = None
        for h in dense_hits:
            if matches_filename(h):
                filename_match_hit = h
                break
        if filename_match_hit is None:
            for h in sparse_hits:
                if matches_filename(h):
                    filename_match_hit = h
                    break

        merged = self._rrf_merge(dense_hits, sparse_hits)

        if not merged:
            return []

        pairs = [[query, hit["content"]] for hit in merged]
        scores = self.reranker.predict(pairs)

        for i, hit in enumerate(merged):
            hit["rerank_score"] = float(scores[i])

        merged = sorted(merged, key=lambda x: x["rerank_score"], reverse=True)

        # If the user explicitly named a file in their query, force it to the top
        # of the final results regardless of embedding/reranker scoring, since
        # exact filename mentions are a strong deterministic signal.
        if filename_match_hit is not None:
            fp = filename_match_hit.payload.get('file_path')
            already_included = any(m['file_path'] == fp for m in merged[:limit])
            if not already_included:
                forced_entry = {
                    "content": filename_match_hit.payload.get("content"),
                    "file_path": filename_match_hit.payload.get("file_path"),
                    "start_line": filename_match_hit.payload.get("start_line"),
                    "end_line": filename_match_hit.payload.get("end_line"),
                    "chunk_type": filename_match_hit.payload.get("chunk_type"),
                    "score": 1.0
                }
                merged = [forced_entry] + [m for m in merged if m['file_path'] != fp]

        return merged[:limit]

    def _rrf_merge(self, dense_hits, sparse_hits, k: int = 60) -> List[Dict[str, Any]]:
        scores = {}
        payloads = {}

        def add_hits(hits):
            for rank, hit in enumerate(hits):
                pid = hit.id
                scores[pid] = scores.get(pid, 0) + 1.0 / (k + rank + 1)
                payloads[pid] = hit.payload

        add_hits(dense_hits)
        add_hits(sparse_hits)

        sorted_ids = sorted(scores.keys(), key=lambda x: scores[x], reverse=True)

        results = []
        for pid in sorted_ids:
            p = payloads[pid]
            results.append({
                "content": p.get("content"),
                "file_path": p.get("file_path"),
                "start_line": p.get("start_line"),
                "end_line": p.get("end_line"),
                "chunk_type": p.get("chunk_type"),
                "score": scores[pid]
            })

        return results