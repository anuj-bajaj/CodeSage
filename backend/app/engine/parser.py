import os
from typing import List, Dict, Any
from pathlib import Path
import tree_sitter_python as tspython
import tree_sitter_javascript as tsjavascript
import tree_sitter_typescript as tstypescript
import tree_sitter_go as tsgo
import tree_sitter_java as tsjava
import tree_sitter_rust as tsrust
import tree_sitter_cpp as tscpp
from tree_sitter import Language, Parser


class CodeParser:
    def __init__(self):
        self.language_map = {
            ".py": ("python", Language(tspython.language())),
            ".js": ("javascript", Language(tsjavascript.language())),
            ".ts": ("typescript", Language(tstypescript.language_typescript())),
            ".tsx": ("tsx", Language(tstypescript.language_tsx())),
            ".go": ("go", Language(tsgo.language())),
            ".java": ("java", Language(tsjava.language())),
            ".rs": ("rust", Language(tsrust.language())),
            ".cpp": ("cpp", Language(tscpp.language())),
            ".c": ("c", Language(tscpp.language())),
        }

        self.semantic_types = {
            "python": ["function_definition", "class_definition"],
            "javascript": ["function_declaration", "class_declaration",
                          "arrow_function", "function_expression"],
            "typescript": ["function_declaration", "class_declaration",
                          "method_definition", "arrow_function"],
            "tsx": ["function_declaration", "class_declaration",
                   "method_definition", "arrow_function"],
            "go": ["function_declaration", "method_declaration",
                  "type_declaration"],
            "java": ["method_declaration", "class_declaration",
                    "constructor_declaration"],
            "rust": ["function_item", "impl_item", "struct_item",
                    "trait_item", "enum_item"],
            "cpp": ["function_definition", "class_specifier"],
            "c": ["function_definition"],
        }

    def get_file_language(self, file_path: str):
        ext = Path(file_path).suffix.lower()
        return self.language_map.get(ext)

    def chunk_file(self, file_path: str) -> List[Dict[str, Any]]:
        lang_info = self.get_file_language(file_path)
        if not lang_info:
            return self._sliding_window_chunk(file_path)

        language_name, language = lang_info

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                code = f.read()
        except Exception:
            return []

        parser = Parser(language)
        tree = parser.parse(bytes(code, "utf8"))

        chunks = []
        self._traverse_tree(
            tree.root_node, code, file_path,
            language_name, chunks
        )

        if not chunks:
            chunks.append({
                "content": code,
                "file_path": file_path,
                "language": language_name,
                "start_line": 1,
                "end_line": len(code.splitlines()),
                "chunk_type": "module",
                "repo_url": ""
            })

        return chunks

    def _traverse_tree(
        self, node: Any, code: str,
        file_path: str, lang: str,
        chunks: List[Dict[str, Any]]
    ):
        target_types = self.semantic_types.get(lang, [])

        if node.type in target_types:
            start_line = node.start_point[0] + 1
            end_line = node.end_point[0] + 1
            content = code[node.start_byte:node.end_byte]

            chunk_type = "class" if "class" in node.type else "function"

            chunks.append({
                "content": content,
                "file_path": file_path,
                "language": lang,
                "start_line": start_line,
                "end_line": end_line,
                "chunk_type": chunk_type,
                "repo_url": ""
            })
            return

        for child in node.children:
            self._traverse_tree(child, code, file_path, lang, chunks)

    def _sliding_window_chunk(
        self, file_path: str,
        repo_url: str = ""
    ) -> List[Dict[str, Any]]:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                text = f.read()
        except Exception:
            return []

        words = text.split()
        chunks = []
        window, overlap = 512, 50
        i = 0

        while i < len(words):
            chunk_words = words[i:i + window]
            content = " ".join(chunk_words)
            chunks.append({
                "content": content,
                "file_path": file_path,
                "language": "text",
                "start_line": i + 1,
                "end_line": i + len(chunk_words),
                "chunk_type": "module",
                "repo_url": repo_url
            })
            i += window - overlap

        return chunks

    def parse_directory(
        self, repo_path: str,
        repo_url: str
    ) -> List[Dict[str, Any]]:
        all_chunks = []

        for root, _, files in os.walk(repo_path):
            if ".git" in root:
                continue
            for file in files:
                full_path = os.path.join(root, file)
                relative_path = os.path.relpath(full_path, repo_path).replace(os.sep, "/")
                chunks = self.chunk_file(full_path)
                for chunk in chunks:
                    chunk["file_path"] = relative_path
                    chunk["repo_url"] = repo_url
                all_chunks.extend(chunks)

        return all_chunks