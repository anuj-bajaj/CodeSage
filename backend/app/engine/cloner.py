import os
import shutil
import tempfile
import re
from pathlib import Path
import git

class CodeCloner:
    def clone_repo(self, repo_url: str) -> str:
        """
        Clones a GitHub repository shallowly and returns the path to the cloned directory.
        """
        # Validate URL
        if not re.match(r"^https://github\.com/[\w.-]+/[\w.-]+/?$", repo_url):
            raise ValueError("Invalid GitHub URL. Must be public https://github.com/user/repo")

        temp_dir = tempfile.mkdtemp()
        print(f"Cloning {repo_url} into {temp_dir}...")
        
        try:
            repo = git.Repo.clone_from(repo_url, temp_dir, depth=1)

            # Remove .git folder immediately — not needed and causes Windows permission issues
            git_dir = os.path.join(temp_dir, ".git")
            if os.path.exists(git_dir):
                import stat
                def handle_readonly(func, fpath, exc):
                    os.chmod(fpath, stat.S_IWRITE)
                    func(fpath)
                shutil.rmtree(git_dir, onerror=handle_readonly)

            # Check file count
            file_count = sum([len(files) for r, d, files in os.walk(temp_dir)])
            if file_count > 5000:
                shutil.rmtree(temp_dir)
                raise Exception(f"Repository exceeds 5000 files limit (Found {file_count}).")

            return temp_dir
        except Exception as e:
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir)
            raise e

    def cleanup(self, path: str):
        import stat

        def handle_remove_readonly(func, fpath, exc):
            os.chmod(fpath, stat.S_IWRITE)
            func(fpath)

        shutil.rmtree(path, onerror=handle_remove_readonly)