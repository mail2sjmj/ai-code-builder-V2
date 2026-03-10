"""
Sandbox code runner — executes user-generated Python in an isolated subprocess.
Security layers: restricted env vars, temp working dir, process timeout.
"""

import logging
import subprocess
import sys
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Wrapper script stored as a plain .py file next to this module.
# Reading from disk (not an in-memory string) eliminates any
# possibility of pyc-cache or string-escaping corrupting the content.
_WRAPPER_SCRIPT_PATH = Path(__file__).parent / "_wrapper_script.py"


@dataclass
class SandboxResult:
    success: bool
    stdout: str
    stderr: str
    exit_code: int
    timed_out: bool
    output_csv_path: Optional[str]
    execution_time_ms: int


def execute_code_in_sandbox(
    code: str,
    session_dir: str,
    input_parquet_path: str,
    timeout_seconds: int,
    max_output_rows: int,
) -> SandboxResult:
    """
    Execute user Python code in an isolated subprocess.

    Args:
        code: Validated Python source code.
        session_dir: The session's temp directory.
        input_parquet_path: Path to the parquet file the code should read.
        timeout_seconds: Hard kill timeout.
        max_output_rows: Row cap for output CSV (safety limit).

    Returns:
        SandboxResult with execution outcome.
    """
    import time

    exec_id = uuid.uuid4().hex[:8]
    exec_dir = Path(session_dir) / f"exec_{exec_id}"
    exec_dir.mkdir(parents=True, exist_ok=True)

    output_csv_path = exec_dir / "output.csv"

    # Write user code
    transform_file = exec_dir / "transform.py"
    transform_file.write_text(code, encoding="utf-8")

    # Copy wrapper script from disk (read fresh each call — never from pyc cache).
    wrapper_file = exec_dir / "sandbox_wrapper.py"
    _wrapper_content = (Path(__file__).parent / "_wrapper_script.py").read_text(encoding="utf-8")
    wrapper_file.write_text(_wrapper_content, encoding="utf-8")

    # Minimal environment — no home, no user, no secrets
    import os
    if sys.platform == "win32":
        python_dir = str(Path(sys.executable).parent)
        system_root = os.environ.get("SystemRoot", "C:\\Windows")
        win_path = os.pathsep.join([python_dir, os.path.join(system_root, "System32")])
    else:
        win_path = ""

    sandbox_env = {
        "INPUT_FILE_PATH": str(input_parquet_path),
        "OUTPUT_FILE_PATH": str(output_csv_path),
        "PATH": "/usr/bin:/bin" if sys.platform != "win32" else win_path,
        "PYTHONPATH": "",
        "PYTHONDONTWRITEBYTECODE": "1",
        # Force UTF-8 for all I/O — prevents charmap errors on Windows when
        # generated code prints Unicode characters (e.g. ✓, →, accented text).
        "PYTHONUTF8": "1",
        "PYTHONIOENCODING": "utf-8",
    }

    start_time = time.monotonic()
    try:
        proc = subprocess.run(
            [sys.executable, str(wrapper_file)],
            env=sandbox_env,
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=timeout_seconds,
            cwd=str(exec_dir),
        )
        elapsed_ms = int((time.monotonic() - start_time) * 1000)

        stdout = proc.stdout[:4000]  # truncate large output
        stderr = proc.stderr[:2000]

        if proc.returncode != 0:
            logger.warning(
                "Sandbox exec failed (exit=%d): %s", proc.returncode, stderr[:200]
            )
            return SandboxResult(
                success=False,
                stdout=stdout,
                stderr=stderr,
                exit_code=proc.returncode,
                timed_out=False,
                output_csv_path=None,
                execution_time_ms=elapsed_ms,
            )

        # Verify output CSV was produced
        if not output_csv_path.exists():
            return SandboxResult(
                success=False,
                stdout=stdout,
                stderr="No output file was generated. "
                       "Ensure your code writes to os.environ['OUTPUT_FILE_PATH'].",
                exit_code=0,
                timed_out=False,
                output_csv_path=None,
                execution_time_ms=elapsed_ms,
            )

        logger.info(
            "Sandbox exec succeeded: exec_id=%s elapsed=%dms", exec_id, elapsed_ms
        )
        return SandboxResult(
            success=True,
            stdout=stdout,
            stderr=stderr,
            exit_code=0,
            timed_out=False,
            output_csv_path=str(output_csv_path),
            execution_time_ms=elapsed_ms,
        )

    except subprocess.TimeoutExpired:
        elapsed_ms = int((time.monotonic() - start_time) * 1000)
        logger.warning("Sandbox timeout after %ds: exec_id=%s", timeout_seconds, exec_id)
        return SandboxResult(
            success=False,
            stdout="",
            stderr=f"Execution timed out after {timeout_seconds} seconds.",
            exit_code=-1,
            timed_out=True,
            output_csv_path=None,
            execution_time_ms=elapsed_ms,
        )
