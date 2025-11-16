#!/usr/bin/env python3
# TEST
"""
Run D-BIAS backend (Flask) and frontend (Vite) together.

Usage:
  python run_dev.py

Notes:
- Make sure you have the Python dependencies installed for the backend (in your venv).
- Make sure Node.js and npm are installed for the frontend.
- Set VITE_BACKEND_URL in frontend .env if your backend isn't on http://localhost:5000.
"""
from __future__ import annotations

import os
import sys
import time
import signal
import shutil
import subprocess
from typing import Optional
from dotenv import load_dotenv

ROOT = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(ROOT, "d-bias", "backend")
FRONTEND_DIR = os.path.join(ROOT, "d-bias", "frontend_dashboard")


def which(cmd: str) -> Optional[str]:
    """shutil.which wrapper returning None when not found."""
    try:
        return shutil.which(cmd)
    except Exception:
        return None


def start_backend() -> subprocess.Popen:
    # Use the current Python executable to run backend/app.py
    python_exe = sys.executable or "python"
    cmd = [python_exe, "app.py"]
    print(f"[backend] cwd={BACKEND_DIR}")
    print(f"[backend] exec: {' '.join(cmd)}")
    return subprocess.Popen(
        cmd,
        cwd=BACKEND_DIR,
        env=os.environ.copy(),
        stdout=None,
        stderr=None,
        creationflags=(subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0),
    )


def start_frontend() -> subprocess.Popen:
    npm_path = which("npm")
    if not npm_path:
        raise RuntimeError("npm not found in PATH. Please install Node.js and ensure 'npm' is available.")

    cmd = [npm_path, "run", "dev"]
    print(f"[frontend] cwd={FRONTEND_DIR}")
    print(f"[frontend] exec: {' '.join(cmd)}")
    return subprocess.Popen(
        cmd,
        cwd=FRONTEND_DIR,
        env=os.environ.copy(),
        stdout=None,
        stderr=None,
        creationflags=(subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0),
    )


def terminate(proc: Optional[subprocess.Popen], name: str, force_after: float = 3.0) -> None:
    if not proc:
        return
    if proc.poll() is not None:
        return
    print(f"[shutdown] Terminating {name} (pid={proc.pid})...")
    try:
        if os.name == "nt":
            # Send CTRL-BREAK to the process group; fall back to terminate
            try:
                os.kill(proc.pid, signal.CTRL_BREAK_EVENT)  # type: ignore[attr-defined]
            except Exception:
                proc.terminate()
        else:
            proc.terminate()
    except Exception:
        pass

    # Wait a bit, then force kill if needed
    t0 = time.time()
    while proc.poll() is None and (time.time() - t0) < force_after:
        time.sleep(0.1)
    if proc.poll() is None:
        print(f"[shutdown] Forcing kill for {name} (pid={proc.pid})")
        try:
            proc.kill()
        except Exception:
            pass


def main() -> int:
    print("= D-BIAS Dev Runner =")
    print("This will start the Flask backend and Vite frontend.")

    # Validate directories
    if not os.path.isdir(BACKEND_DIR):
        print(f"[error] Backend directory not found: {BACKEND_DIR}")
        return 1
    if not os.path.isdir(FRONTEND_DIR):
        print(f"[error] Frontend directory not found: {FRONTEND_DIR}")
        return 1

    # Load backend environment variables
    load_dotenv(os.path.join(BACKEND_DIR, ".env"))

    backend_proc = None
    frontend_proc = None
    try:
        backend_proc = start_backend()
        # Give the backend a moment to start before the frontend attempts to connect in dev
        time.sleep(1.5)
        frontend_proc = start_frontend()

        print("\n[info] Backend listening (default http://localhost:5000)")
        print("[info] Frontend dev server starting (default http://localhost:5173)\n")
        print("Press Ctrl+C to stop both.")

        # Monitor processes; if one exits, stop the other
        while True:
            be_code = backend_proc.poll() if backend_proc else 0
            fe_code = frontend_proc.poll() if frontend_proc else 0
            if be_code is not None:
                print(f"[backend] exited with code {be_code}")
                if frontend_proc and frontend_proc.poll() is None:
                    terminate(frontend_proc, "frontend")
                return be_code or 0
            if fe_code is not None:
                print(f"[frontend] exited with code {fe_code}")
                if backend_proc and backend_proc.poll() is None:
                    terminate(backend_proc, "backend")
                return fe_code or 0
            time.sleep(0.5)

    except KeyboardInterrupt:
        print("\n[ctrl+c] Shutting down...")
        terminate(frontend_proc, "frontend")
        terminate(backend_proc, "backend")
        return 0
    except Exception as e:
        print(f"[error] {e}")
        terminate(frontend_proc, "frontend")
        terminate(backend_proc, "backend")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
