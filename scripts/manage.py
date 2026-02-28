#!/usr/bin/env python3
"""
AI Code Builder — cross-platform service management script.

Works on Windows, macOS, and Linux without external dependencies.

Usage (run from the project root, or let the shell wrappers handle the cwd):
  python scripts/manage.py start   [--env ENV] [--port PORT] [--frontend] [--foreground]
  python scripts/manage.py stop    [--backend-only] [--port PORT] [--force] [--purge-cache]
  python scripts/manage.py health  [--port PORT] [--url URL]
  python scripts/manage.py status

Examples:
  python scripts/manage.py start --env development
  python scripts/manage.py start --env production --port 8080
  python scripts/manage.py stop  --backend-only
  python scripts/manage.py health
  python scripts/manage.py status
"""

import argparse
import json
import os
import platform
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

# ── Project layout ─────────────────────────────────────────────────────────────
ROOT        = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT / "backend"
FRONTEND_DIR = ROOT / "frontend"
PIDS_DIR    = ROOT / ".pids"

BACKEND_PID_FILE  = PIDS_DIR / "backend.pid"
FRONTEND_PID_FILE = PIDS_DIR / "frontend.pid"

IS_WINDOWS = platform.system() == "Windows"

# Force UTF-8 output on Windows so box-drawing / tick / cross characters
# (━  ✔  ✖  →) don't cause UnicodeEncodeError on cp1252 consoles.
if IS_WINDOWS and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# ── Terminal colours ───────────────────────────────────────────────────────────
# Enabled on any TTY; on Windows only when running inside Windows Terminal or
# ConEmu (which set WT_SESSION / ANSICON).
_USE_COLOR = sys.stdout.isatty() and (
    not IS_WINDOWS
    or bool(os.environ.get("WT_SESSION") or os.environ.get("ANSICON"))
)


def _c(code: str, text: str) -> str:
    return f"\033[{code}m{text}\033[0m" if _USE_COLOR else text


def _header(msg: str) -> None:
    print(f"\n{_c('1;35', '━━ ' + msg + ' ━━')}")


def _info(msg: str) -> None:
    print(f"  {_c('36', '→')} {msg}")


def _ok(msg: str) -> None:
    print(f"  {_c('32', '✔')} {msg}")


def _warn(msg: str) -> None:
    print(f"  {_c('33', '!')} {msg}")


def _err(msg: str) -> None:
    print(f"  {_c('31', '✖')} {msg}", file=sys.stderr)


# ── Python / venv detection ────────────────────────────────────────────────────

def _venv_python() -> Path:
    """Return the Python interpreter inside .venv, falling back to sys.executable."""
    venv = ROOT / ".venv"
    candidates = (
        [venv / "Scripts" / "python.exe"]
        if IS_WINDOWS
        else [venv / "bin" / "python3", venv / "bin" / "python"]
    )
    for p in candidates:
        if p.exists():
            return p
    return Path(sys.executable)


def _venv_pip() -> Path:
    """Return the pip executable inside .venv, falling back to system pip."""
    venv = ROOT / ".venv"
    candidates = (
        [venv / "Scripts" / "pip.exe"]
        if IS_WINDOWS
        else [venv / "bin" / "pip3", venv / "bin" / "pip"]
    )
    for p in candidates:
        if p.exists():
            return p
    fallback = shutil.which("pip3") or shutil.which("pip") or "pip"
    return Path(fallback)


# ── Dependency installation ────────────────────────────────────────────────────

def _ensure_venv() -> None:
    """Create a virtual environment at ROOT/.venv if one does not already exist."""
    venv = ROOT / ".venv"
    if venv.exists():
        return
    _info("Virtual environment not found — creating .venv …")
    result = subprocess.run(
        [sys.executable, "-m", "venv", str(venv)],
        cwd=str(ROOT),
    )
    if result.returncode != 0:
        raise RuntimeError("Failed to create virtual environment. Check that 'python -m venv' works.")
    _ok("Virtual environment created at .venv")


def _ensure_backend_deps() -> None:
    """Ensure .venv exists and all Python dependencies are installed."""
    req_file = BACKEND_DIR / "requirements.txt"
    if not req_file.exists():
        _warn("backend/requirements.txt not found — skipping Python dependency install.")
        return

    _ensure_venv()
    pip = _venv_pip()
    _info(f"Installing Python dependencies  (pip install -r requirements.txt) …")
    result = subprocess.run(
        [str(pip), "install", "-r", str(req_file), "-q", "--disable-pip-version-check"],
        cwd=str(ROOT),
    )
    if result.returncode != 0:
        raise RuntimeError(
            "pip install failed. Check requirements.txt and your network connection."
        )
    _ok("Python dependencies up to date.")


def _ensure_frontend_deps() -> None:
    """Run 'npm install' in the frontend directory if package.json is present."""
    pkg_json = FRONTEND_DIR / "package.json"
    if not pkg_json.exists():
        _warn("frontend/package.json not found — skipping npm install.")
        return

    npm = shutil.which("npm") or "npm"
    _info("Installing frontend dependencies  (npm install) …")
    result = subprocess.run(
        [npm, "install"],
        cwd=str(FRONTEND_DIR),
    )
    if result.returncode != 0:
        raise RuntimeError(
            "npm install failed. Check frontend/package.json and your network connection."
        )
    _ok("Frontend dependencies up to date.")


# ── PID file helpers ───────────────────────────────────────────────────────────

def _write_pid(pid_file: Path, pid: int) -> None:
    PIDS_DIR.mkdir(parents=True, exist_ok=True)
    pid_file.write_text(str(pid), encoding="utf-8")


def _read_pid(pid_file: Path) -> int | None:
    if not pid_file.exists():
        return None
    try:
        return int(pid_file.read_text(encoding="utf-8").strip())
    except (ValueError, OSError):
        return None


def _process_running(pid: int) -> bool:
    """Return True if a process with *pid* is alive."""
    if IS_WINDOWS:
        result = subprocess.run(
            ["tasklist", "/FI", f"PID eq {pid}", "/NH", "/FO", "CSV"],
            capture_output=True, text=True,
        )
        return str(pid) in result.stdout
    else:
        try:
            os.kill(pid, 0)
            return True
        except (ProcessLookupError, PermissionError):
            return False


def _terminate(pid: int, *, force: bool = False) -> bool:
    """Send SIGTERM (or SIGKILL / /F on Windows) to *pid*. Returns True if signal was sent."""
    if IS_WINDOWS:
        cmd = ["taskkill", "/F", "/PID", str(pid)] if force else ["taskkill", "/PID", str(pid)]
        return subprocess.run(cmd, capture_output=True).returncode == 0
    else:
        import signal as _sig
        sig = _sig.SIGKILL if force else _sig.SIGTERM
        try:
            os.kill(pid, sig)
            return True
        except ProcessLookupError:
            return False


def _find_uvicorn_orphans() -> set[int]:
    """
    Find orphaned uvicorn multiprocessing-fork server processes on Windows.

    When uvicorn uses --reload, it spawns server workers via multiprocessing.spawn.
    If the reloader (parent) is killed, these children become orphans and keep
    listening on the backend port with stale code.  This finds them by looking
    for python.exe processes whose command line contains '--multiprocessing-fork'
    and whose *parent* process is no longer alive.
    """
    orphans: set[int] = set()
    if not IS_WINDOWS:
        return orphans
    try:
        out = subprocess.check_output(
            ["wmic", "process", "where", "name='python.exe'",
             "get", "ProcessId,ParentProcessId,CommandLine"],
            text=True, stderr=subprocess.DEVNULL,
        )
        for line in out.splitlines():
            if "--multiprocessing-fork" not in line:
                continue
            parts = line.split()
            if len(parts) < 2:
                continue
            try:
                pid    = int(parts[-1])
                parent = int(parts[-2])
            except ValueError:
                continue
            if not _process_running(parent):
                orphans.add(pid)
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass
    return orphans


def _find_pids_on_port(port: int) -> set[int]:
    """Return the set of PIDs currently listening on *port* (cross-platform)."""
    pids: set[int] = set()
    try:
        if IS_WINDOWS:
            out = subprocess.check_output(
                ["netstat", "-ano"], text=True, stderr=subprocess.DEVNULL
            )
            for line in out.splitlines():
                parts = line.split()
                # netstat -ano line: Proto  LocalAddr  ForeignAddr  State  PID
                if len(parts) == 5 and f":{port}" in parts[1] and parts[3] == "LISTENING":
                    try:
                        pids.add(int(parts[4]))
                    except ValueError:
                        pass
        else:
            # lsof is available on macOS by default; on Linux if installed
            out = subprocess.check_output(
                ["lsof", "-ti", f":{port}", "-sTCP:LISTEN"],
                text=True, stderr=subprocess.DEVNULL,
            )
            for token in out.split():
                try:
                    pids.add(int(token.strip()))
                except ValueError:
                    pass
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass
    return pids


def _clear_pycache(root_dir: Path) -> int:
    """Remove all __pycache__ directories under *root_dir*. Returns count removed."""
    removed = 0
    # Sort reversed so deepest dirs are removed before their parents
    for cache_dir in sorted(root_dir.rglob("__pycache__"), reverse=True):
        try:
            shutil.rmtree(cache_dir)
            removed += 1
        except OSError:
            pass
    return removed


# ── Log directory resolution ───────────────────────────────────────────────────

def _log_dir(app_env: str) -> Path:
    """
    Resolve the log directory.
    Priority: LOG_DIR env-var → backend/.env LOG_DIR entry → OS temp fallback.
    """
    # 1. OS environment variable (set by the caller or export in the shell)
    from_env = os.environ.get("LOG_DIR", "").strip()
    if from_env:
        return Path(from_env)

    # 2. Parse LOG_DIR from backend/.env (simple key=value scan, no Python deps)
    env_file = BACKEND_DIR / ".env"
    if env_file.exists():
        raw_bytes = env_file.read_bytes()
        for enc in ("utf-8-sig", "utf-16", "latin-1"):
            try:
                text = raw_bytes.decode(enc)
                break
            except (UnicodeDecodeError, ValueError):
                continue
        else:
            text = ""
        for raw in text.splitlines():
            line = raw.strip()
            if line.startswith("LOG_DIR=") and not line.startswith("#"):
                val = line.split("=", 1)[1].strip().split("#")[0].strip()
                if val:
                    return Path(val)

    # 3. Default — same logic as settings.py default_factory
    return Path(tempfile.gettempdir()) / "code_builder_logs"


# ── Generic .env reader ────────────────────────────────────────────────────────

def _env_int(key: str, default: int) -> int:
    """
    Read an integer value from OS env or backend/.env file.
    Priority: OS env-var → backend/.env → default.
    """
    from_env = os.environ.get(key, "").strip()
    if from_env:
        try:
            return int(from_env)
        except ValueError:
            pass

    env_file = BACKEND_DIR / ".env"
    if env_file.exists():
        raw_bytes = env_file.read_bytes()
        for enc in ("utf-8-sig", "utf-16", "latin-1"):
            try:
                text = raw_bytes.decode(enc)
                break
            except (UnicodeDecodeError, ValueError):
                continue
        else:
            text = ""
        for raw in text.splitlines():
            line = raw.strip()
            if line.startswith(f"{key}=") and not line.startswith("#"):
                val = line.split("=", 1)[1].strip().split("#")[0].strip()
                try:
                    return int(val)
                except ValueError:
                    pass

    return default


# ── Uvicorn command builder ────────────────────────────────────────────────────

def _uvicorn_cmd(python: Path, port: int, app_env: str) -> list[str]:
    """Return the uvicorn argv list appropriate for *app_env*."""
    base = [str(python), "-m", "uvicorn", "app.main:app",
            "--host", "0.0.0.0", "--port", str(port)]
    if app_env == "development":
        return base + ["--reload", "--log-level", "debug"]
    if app_env == "staging":
        return base + ["--workers", "2", "--log-level", "info", "--access-log"]
    # production
    return base + ["--workers", "4", "--log-level", "warning", "--access-log"]


# ── start ──────────────────────────────────────────────────────────────────────

def cmd_start(args: argparse.Namespace) -> int:
    app_env  = args.env
    port     = args.port
    fg       = args.foreground

    _header(f"Start  [{app_env.upper()}]")

    # ── Install / sync dependencies ───────────────────────────────────────────
    if args.skip_deps:
        _info("Skipping dependency installation (--skip-deps).")
    else:
        try:
            _ensure_backend_deps()
            if not args.backend_only:
                _ensure_frontend_deps()
        except RuntimeError as exc:
            _err(str(exc))
            return 3

    # ── Guard: already running? ───────────────────────────────────────────────
    pid = _read_pid(BACKEND_PID_FILE)
    if pid and _process_running(pid):
        _warn(f"Backend is already running (PID {pid}). Run 'stop' first.")
        return 1

    python = _venv_python()
    _info(f"Python  : {python}")
    _info(f"Root    : {ROOT}")

    # Always purge bytecode cache before starting — prevents stale .pyc from
    # shadowing source edits even when mtime resolution is coarse (Windows FAT).
    n = _clear_pycache(BACKEND_DIR)
    if n:
        _info(f"Cleared {n} __pycache__ director{'y' if n == 1 else 'ies'} from backend/.")

    uvicorn = _uvicorn_cmd(python, port, app_env)
    env     = {**os.environ, "APP_ENV": app_env}

    workers = 1 if app_env == "development" else (2 if app_env == "staging" else 4)
    _info(f"Command : {' '.join(uvicorn[:6])} … (workers={'--reload' if app_env == 'development' else workers})")

    # ── Foreground mode ───────────────────────────────────────────────────────
    if fg:
        _info("Running in foreground — press Ctrl+C to stop.")
        try:
            proc = subprocess.Popen(uvicorn, cwd=str(BACKEND_DIR), env=env)
            _write_pid(BACKEND_PID_FILE, proc.pid)
            proc.wait()
        except KeyboardInterrupt:
            _warn("Interrupted.")
        finally:
            BACKEND_PID_FILE.unlink(missing_ok=True)
        return 0

    # ── Background mode: redirect stdout/stderr to log file ───────────────────
    log_path = _log_dir(app_env)
    log_path.mkdir(parents=True, exist_ok=True)
    log_file = log_path / f"app.{app_env}.log"
    _info(f"Log file: {log_file}")

    with open(log_file, "ab") as lf:
        if IS_WINDOWS:
            proc = subprocess.Popen(
                uvicorn,
                cwd=str(BACKEND_DIR),
                env=env,
                stdout=lf,
                stderr=lf,
                creationflags=(
                    subprocess.CREATE_NEW_PROCESS_GROUP  # type: ignore[attr-defined]
                    | subprocess.DETACHED_PROCESS        # type: ignore[attr-defined]
                ),
                close_fds=True,
            )
        else:
            proc = subprocess.Popen(
                uvicorn,
                cwd=str(BACKEND_DIR),
                env=env,
                stdout=lf,
                stderr=lf,
                start_new_session=True,   # detach from parent's process group
                close_fds=True,
            )

    _write_pid(BACKEND_PID_FILE, proc.pid)
    _info(f"Backend spawned (PID {proc.pid}). Waiting for health check…")

    health_url = f"http://localhost:{port}/health"
    retries  = _env_int("HEALTH_CHECK_RETRIES", 20)
    interval = _env_int("HEALTH_CHECK_INTERVAL_SECONDS", 1)
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(health_url, timeout=2) as resp:
                if resp.status == 200:
                    _ok(f"Backend is up → {health_url}  (PID {proc.pid})")
                    _ok(f"Logs → {log_file}")
                    break
        except (urllib.error.URLError, OSError):
            print(f"    [{attempt + 1:02d}/{retries}] Waiting…", end="\r", flush=True)
            time.sleep(interval)
    else:
        print()
        _err("Backend did not respond to health checks. Check the log file:")
        _err(f"  {log_file}")
        return 2

    # ── Optionally start frontend dev server ──────────────────────────────────
    if not args.backend_only:
        _start_frontend(app_env, skip_deps=True)  # already installed above

    return 0


def _start_frontend(app_env: str, *, skip_deps: bool = False) -> None:
    _info("Starting frontend dev server…")
    pid = _read_pid(FRONTEND_PID_FILE)
    if pid and _process_running(pid):
        _warn(f"Frontend is already running (PID {pid}).")
        return

    if not skip_deps:
        try:
            _ensure_frontend_deps()
        except RuntimeError as exc:
            _err(str(exc))
            return

    npm = shutil.which("npm") or "npm"
    cmd = [npm, "run", "dev"]

    log_path = _log_dir(app_env)
    log_path.mkdir(parents=True, exist_ok=True)
    log_file = log_path / f"frontend.{app_env}.log"

    with open(log_file, "ab") as lf:
        kwargs: dict = dict(cwd=str(FRONTEND_DIR), stdout=lf, stderr=lf, close_fds=True)
        if IS_WINDOWS:
            proc = subprocess.Popen(
                cmd,
                creationflags=(
                    subprocess.CREATE_NEW_PROCESS_GROUP  # type: ignore[attr-defined]
                    | subprocess.DETACHED_PROCESS        # type: ignore[attr-defined]
                ),
                **kwargs,
            )
        else:
            proc = subprocess.Popen(cmd, start_new_session=True, **kwargs)

    _write_pid(FRONTEND_PID_FILE, proc.pid)
    _ok(f"Frontend started (PID {proc.pid}) → {log_file}")


# ── stop ───────────────────────────────────────────────────────────────────────

def cmd_stop(args: argparse.Namespace) -> int:
    _header("Stop")

    # Map service name → port so we can hunt for stragglers after the PID kill
    backend_port = getattr(args, "port", 8000)
    port_map: dict[str, int] = {"Backend": backend_port}
    if not args.backend_only:
        port_map["Frontend"] = 5173  # Vite default

    targets = [("Backend", BACKEND_PID_FILE)]
    if not args.backend_only:
        targets.append(("Frontend", FRONTEND_PID_FILE))

    stopped_any = False
    for name, pid_file in targets:
        pid = _read_pid(pid_file)
        known_pid: int | None = pid

        if pid is None:
            _info(f"{name}: no PID file found.")
        elif not _process_running(pid):
            _warn(f"{name}: PID {pid} is stale (process gone). Cleaning up.")
            pid_file.unlink(missing_ok=True)
            known_pid = None
        else:
            _info(f"Stopping {name} (PID {pid})…")
            _terminate(pid, force=args.force)

            # Wait up to 10 s for graceful exit, then force-kill
            for _ in range(10):
                time.sleep(1)
                if not _process_running(pid):
                    break
            else:
                if not args.force:
                    _warn(f"{name} did not exit gracefully — force killing…")
                    _terminate(pid, force=True)
                    time.sleep(1)

            if not _process_running(pid):
                pid_file.unlink(missing_ok=True)
                _ok(f"{name} stopped.")
                stopped_any = True
            else:
                _err(f"Could not stop {name} (PID {pid}). Try --force.")

        # ── Kill any stray processes still listening on the same port ─────────
        port = port_map.get(name)
        if port:
            stragglers = _find_pids_on_port(port) - ({known_pid} if known_pid else set())
            if stragglers:
                _warn(
                    f"{name}: {len(stragglers)} stray process(es) still on port {port} "
                    f"(PIDs: {', '.join(str(p) for p in sorted(stragglers))}) — force-killing…"
                )
                for stale_pid in stragglers:
                    if _terminate(stale_pid, force=True):
                        _ok(f"  Killed stray PID {stale_pid}.")
                        stopped_any = True
                    else:
                        _warn(f"  Could not kill stray PID {stale_pid}.")

    # ── Kill orphaned multiprocessing-fork server children ────────────────────
    orphans = _find_uvicorn_orphans()
    if orphans:
        _warn(
            f"Found {len(orphans)} orphaned uvicorn worker(s) "
            f"(PIDs: {', '.join(str(p) for p in sorted(orphans))}) — force-killing…"
        )
        for opid in orphans:
            if _terminate(opid, force=True):
                _ok(f"  Killed orphan PID {opid}.")
                stopped_any = True
            else:
                _warn(f"  Could not kill orphan PID {opid}.")

    # ── Optionally purge bytecode cache ───────────────────────────────────────
    if getattr(args, "purge_cache", False):
        n = _clear_pycache(BACKEND_DIR)
        _ok(f"Cleared {n} __pycache__ director{'y' if n == 1 else 'ies'} from backend/.")

    if not stopped_any:
        _info("No services were running.")
    return 0


# ── restart ────────────────────────────────────────────────────────────────────

def cmd_restart(args: argparse.Namespace) -> int:
    _header("Restart")

    # Build a stop-args namespace reusing compatible fields from args
    stop_args = argparse.Namespace(
        backend_only=args.backend_only,
        port=args.port,
        force=False,
        purge_cache=False,
    )
    rc = cmd_stop(stop_args)
    if rc not in (0, None):
        _err("Stop failed — aborting restart.")
        return rc

    return cmd_start(args)


# ── health ─────────────────────────────────────────────────────────────────────

def cmd_health(args: argparse.Namespace) -> int:
    _header("Health Check")
    url = args.url or f"http://localhost:{args.port}/health"
    _info(f"GET {url}")

    try:
        with urllib.request.urlopen(url, timeout=5) as resp:
            body = json.loads(resp.read())
            _ok(f"status  : {body.get('status', '?').upper()}")
            _ok(f"env     : {body.get('env', '?')}")
            _ok(f"version : {body.get('version', '?')}")
            _ok(f"inbound : {body.get('inbound_dir', '?')}")
            _ok(f"temp    : {body.get('temp_dir', '?')}")
            _ok(f"logs    : {body.get('log_dir', '?')}")
            return 0
    except urllib.error.HTTPError as exc:
        _err(f"HTTP {exc.code}: {exc.reason}")
        return 1
    except (urllib.error.URLError, OSError) as exc:
        reason = getattr(exc, "reason", exc)
        _err(f"Could not reach {url}: {reason}")
        _warn("Is the backend running? Try:  python scripts/manage.py status")
        return 2


# ── status ─────────────────────────────────────────────────────────────────────

def cmd_status(_args: argparse.Namespace) -> int:
    _header("Service Status")
    for name, pid_file in [("Backend", BACKEND_PID_FILE), ("Frontend", FRONTEND_PID_FILE)]:
        pid = _read_pid(pid_file)
        if pid and _process_running(pid):
            _ok(f"{name:12s} running   PID {pid}")
        elif pid:
            _warn(f"{name:12s} stale PID {pid}  (process not found — run 'stop' to clean up)")
        else:
            _info(f"{name:12s} stopped")
    return 0


# ── main ───────────────────────────────────────────────────────────────────────

def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="manage.py",
        description="AI Code Builder — service management",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = p.add_subparsers(dest="command", required=True)

    # start
    ps = sub.add_parser("start", help="Start the backend (and optionally the frontend)")
    ps.add_argument(
        "--env",
        default=os.environ.get("APP_ENV", "development"),
        choices=["development", "staging", "production"],
        help="APP_ENV to use (default: development, or $APP_ENV)",
    )
    ps.add_argument("--port", type=int, default=8000, metavar="PORT",
                    help="Backend port (default: 8000)")
    ps.add_argument("--backend-only", action="store_true",
                    help="Start only the backend, skip the Vite frontend dev server")
    ps.add_argument("--foreground", action="store_true",
                    help="Run in foreground (blocking — useful for debugging)")
    ps.add_argument("--skip-deps", action="store_true",
                    help="Skip pip/npm dependency installation (faster restart when deps haven't changed)")

    # restart
    pr = sub.add_parser("restart", help="Stop then start services (accepts same flags as start)")
    pr.add_argument(
        "--env",
        default=os.environ.get("APP_ENV", "development"),
        choices=["development", "staging", "production"],
        help="APP_ENV to use (default: development, or $APP_ENV)",
    )
    pr.add_argument("--port", type=int, default=8000, metavar="PORT",
                    help="Backend port (default: 8000)")
    pr.add_argument("--backend-only", action="store_true",
                    help="Restart only the backend, skip the Vite frontend dev server")
    pr.add_argument("--foreground", action="store_true",
                    help="Run in foreground after restart")
    pr.add_argument("--skip-deps", action="store_true",
                    help="Skip pip/npm dependency installation (faster restart)")

    # stop
    pp = sub.add_parser("stop", help="Stop running services (backend + frontend by default)")
    pp.add_argument("--backend-only", action="store_true",
                    help="Stop only the backend, leave the frontend running")
    pp.add_argument("--port", type=int, default=8000, metavar="PORT",
                    help="Backend port to scan for stray processes (default: 8000)")
    pp.add_argument("--force", action="store_true",
                    help="Skip graceful shutdown and force-kill immediately")
    pp.add_argument("--purge-cache", action="store_true",
                    help="Also delete all backend __pycache__ dirs after stopping")

    # health
    ph = sub.add_parser("health", help="Check the backend /health endpoint")
    ph.add_argument("--port", type=int, default=8000, metavar="PORT",
                    help="Backend port (default: 8000)")
    ph.add_argument("--url", metavar="URL",
                    help="Override the full health check URL")

    # status
    sub.add_parser("status", help="Show running/stopped status of all services")

    return p


def main() -> None:
    parser = _build_parser()
    args   = parser.parse_args()
    handlers = {
        "start":   cmd_start,
        "stop":    cmd_stop,
        "restart": cmd_restart,
        "health":  cmd_health,
        "status":  cmd_status,
    }
    sys.exit(handlers[args.command](args) or 0)


if __name__ == "__main__":
    main()
