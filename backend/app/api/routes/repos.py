from fastapi import APIRouter, HTTPException, Query, Header, Depends
from app.db.postgres import PostgresDB
from qdrant_client import QdrantClient
from qdrant_client.http import models
import os

def verify_admin_key(x_admin_key: str = Header(None)):
    expected = os.getenv("ADMIN_API_KEY")
    if not expected or x_admin_key != expected:
        raise HTTPException(status_code=403, detail="Not authorized to perform this action.")

router = APIRouter()
db = PostgresDB()

def get_qdrant_client():
    return QdrantClient(
        url=os.getenv("QDRANT_URL"),
        api_key=os.getenv("QDRANT_API_KEY")
    )

@router.get("/repos")
async def get_all_repos():
    """Import lists of workspaces and stats from DB."""
    conn = await db.get_connection()
    try:
        rows = await conn.fetch(
            "SELECT repo_url, file_count, chunk_count, languages, indexed_at FROM repos ORDER BY indexed_at DESC"
        )
        repos = []
        for r in rows:
            # Extract repository name from URL
            url = r["repo_url"]
            clean_url = url[:-1] if url.endswith('/') else url
            parts = clean_url.split('/')
            name = parts[-1] if parts else url
            
            repos.append({
                "repo_url": r["repo_url"],
                "repo_name": name,
                "file_count": r["file_count"],
                "chunk_count": r["chunk_count"],
                "languages": r["languages"] or [],
                "indexed_at": r["indexed_at"].isoformat() if r["indexed_at"] else None
            })
        return repos
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database query failed: {str(e)}")
    finally:
        await conn.close()

@router.get("/repos/{repo_url:path}/chunks")
async def get_repo_chunks(repo_url: str, page: int = Query(1, ge=1), paginate: bool = True):
    """Fetch paginated codebase chunks with code tokens from Qdrant payloads."""
    qdrant = get_qdrant_client()
    try:
        # Fetch matching records from vector space
        scroll_results = qdrant.scroll(
            collection_name="code_sage",
            scroll_filter=models.Filter(
                must=[
                    models.FieldCondition(
                        key="repo_url",
                        match=models.MatchValue(value=repo_url),
                    )
                ]
            ),
            limit=1000,
            with_payload=True,
            with_vectors=False
        )
        
        points = scroll_results[0]
        chunks = [p.payload for p in points]
        
        # Sort chunks logically by filepath and line order
        chunks = sorted(chunks, key=lambda c: (c.get("file_path", ""), c.get("start_line", 0)))
        
        if not paginate:
            return {
                "chunks": chunks,
                "total": len(chunks),
                "page": 1
            }

        pageSize = 50
        start = (page - 1) * pageSize
        end = start + pageSize
        
        return {
            "chunks": chunks[start:end],
            "total": len(chunks),
            "page": page
        }
    except Exception as e:
        print(f"Chunks fetch error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed retrieving collection points: {str(e)}")


@router.delete("/repos/all")
async def clear_all_repositories(_: None = Depends(verify_admin_key)):
    """DANGER: Drop all DB records and recreate clean Qdrant collection scopes."""
    conn = await db.get_connection()
    qdrant = get_qdrant_client()
    try:
        # 1. Truncate PostgreSQL
        await conn.execute("DELETE FROM chunks")
        await conn.execute("DELETE FROM repos")
        
        # 2. Reset Qdrant Space
        qdrant.delete_collection("code_sage")
        qdrant.create_collection(
            collection_name="code_sage",
            vectors_config={
                "dense": models.VectorParams(size=384, distance=models.Distance.COSINE)
            },
            sparse_vectors_config={
                "sparse": models.SparseVectorParams(
                    index=models.SparseIndexParams(on_disk=False)
                )
            }
        )
        return {"status": "cleared"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database truncation failed: {str(e)}")
    finally:
        await conn.close()

@router.delete("/repos/{repo_url:path}")
async def delete_repository(repo_url: str, _: None = Depends(verify_admin_key)):
    """Delete a repository from PostgreSQL database and trace vector points in Qdrant."""
    conn = await db.get_connection()
    qdrant = get_qdrant_client()
    try:
        # 1. Postgres delete (cascading)
        await conn.execute("DELETE FROM chunks WHERE repo_url = $1", repo_url)
        await conn.execute("DELETE FROM repos WHERE repo_url = $1", repo_url)
        
        # 2. Qdrant points delete
        qdrant.delete(
            collection_name="code_sage",
            points_selector=models.FilterSelector(
                filter=models.Filter(
                    must=[
                        models.FieldCondition(
                            key="repo_url",
                            match=models.MatchValue(value=repo_url),
                        )
                    ]
                )
            )
        )
        return {"status": "deleted", "repo_url": repo_url}
    except Exception as e:
        print(f"Delete error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Deletions transaction failed: {str(e)}")
    finally:
        await conn.close()

@router.get("/stats")
async def get_collection_stats():
    """Retrieve vectors count inside collection from Qdrant."""
    qdrant = get_qdrant_client()
    try:
        info = qdrant.get_collection("code_sage")
        return {
            "total_vectors": info.points_count,
            "collection_name": "code_sage"
        }
    except Exception as e:
        # Default placeholder if collection doesn't exist yet
        return {
            "total_vectors": 0,
            "collection_name": "code_sage",
            "warning": str(e)
        }

