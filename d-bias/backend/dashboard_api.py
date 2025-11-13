"""Dashboard-oriented API access helpers for D-BIAS.

This module centralizes API access and local cache loading for easy reuse in
CLI tools, notebooks, and the main dashboard script.

Features
- Simple, function-based interface with sensible defaults
- Customizable parameters (base URL, timeouts, etc.)
- Graceful handling of network and file errors
- Utilities to load the most recent analysis JSON from the program_generated_files

Quick usage
    from backend.dashboard_api import (
        ping, upload, analyze, latest_analysis,
        load_cached_analysis, load_latest_json,
    )

    # Hitting the backend
    base = "http://localhost:5000"
    print(ping(base_url=base))
    info = upload(r"path/to/data.csv", base_url=base)
    result = analyze(r"path/to/data.csv", base_url=base, run_gemini=False, return_plots="json")
    cached = latest_analysis(base_url=base)

    # Loading from disk (no server needed)
    cached_file = load_cached_analysis()  # defaults to d-bias/_data/program_generated_files/analysis_response.json
    newest = load_latest_json()           # picks the newest .json in program_generated_files

Environment overrides
- Set DBIAS_BACKEND_URL to change default backend base URL.
- Set ANALYSIS_CACHE_PATH to point to a specific JSON file to read/write.
- Set ANALYSIS_CACHE_DIR to point to a directory for JSON discovery.
"""

from __future__ import annotations

import glob
import json
import os
from typing import Any, Dict, Iterable, Optional

from . import api_client as _api


# -----------------------------
# Paths for generated artifacts
# -----------------------------

def _default_generated_dir() -> str:
    """Return the default directory for generated program files.

    By default: <repo>/d-bias/_data/program_generated_files
    Respects optional env var ANALYSIS_CACHE_DIR.
    """
    override = os.getenv("ANALYSIS_CACHE_DIR")
    if override:
        return os.path.abspath(override)
    here = os.path.dirname(os.path.abspath(__file__))
    dbias_dir = os.path.abspath(os.path.join(here, ".."))
    return os.path.join(dbias_dir, "_data", "program_generated_files")


def _default_cache_file() -> str:
    """Return default cache file path (analysis_response.json).

    Respects optional env var ANALYSIS_CACHE_PATH.
    """
    override = os.getenv("ANALYSIS_CACHE_PATH")
    if override:
        return os.path.abspath(override)
    return os.path.join(_default_generated_dir(), "analysis_response.json")


# -----------------------------
# Local JSON loaders
# -----------------------------

def load_cached_analysis(
    *,
    path: Optional[str] = None,
    encoding: str = "utf-8",
    raise_on_error: bool = False,
) -> Optional[Dict[str, Any]]:
    """Load the dashboard analysis JSON from disk.

    Parameters
    - path: Optional specific file path. Defaults to the standard cache file
      under program_generated_files (analysis_response.json).
    - encoding: File encoding to use.
    - raise_on_error: If True, raise IOError/JSONDecodeError on failure; otherwise
      return None and include context in logs via the return structure.

    Returns
    - Parsed JSON dict on success, or None on failure when raise_on_error=False.

    Usage
        data = load_cached_analysis()
        if data:
            print(data.get("dataset_summary"))
    """
    target = os.path.abspath(path) if path else _default_cache_file()
    try:
        with open(target, "r", encoding=encoding) as fh:
            return json.load(fh)
    except Exception:
        if raise_on_error:
            raise
        return None


def load_latest_json(
    *,
    dir_path: Optional[str] = None,
    pattern: str = "*.json",
    encoding: str = "utf-8",
    raise_on_error: bool = False,
) -> Optional[Dict[str, Any]]:
    """Find and load the most recently modified JSON in a directory.

    Parameters
    - dir_path: Directory to search. Defaults to the standard program_generated_files.
    - pattern: Glob pattern for candidate files (default "*.json").
    - encoding: File encoding.
    - raise_on_error: When True, unexpected errors are raised instead of returning None.

    Returns
    - Parsed JSON dict of the newest file, or None if no files found/failed to read.

    Usage
        latest = load_latest_json()
        if latest:
            print(latest.get("fairness_score"))
    """
    folder = os.path.abspath(dir_path) if dir_path else _default_generated_dir()
    try:
        candidates = glob.glob(os.path.join(folder, pattern))
        if not candidates:
            return None
        newest = max(candidates, key=os.path.getmtime)
        with open(newest, "r", encoding=encoding) as fh:
            return json.load(fh)
    except FileNotFoundError:
        return None if not raise_on_error else (_ for _ in ()).throw(FileNotFoundError(folder))
    except Exception:
        if raise_on_error:
            raise
        return None


# -----------------------------
# Backend API wrappers (re-export)
# -----------------------------

def ping(
    *,
    base_url: str = _api.DEFAULT_BASE_URL,
    timeout: float = 10.0,
    raise_on_error: bool = True,
) -> Dict[str, Any]:
    """Ping the backend root endpoint.

    Parameters
    - base_url: Backend base URL (default from env `DBIAS_BACKEND_URL` or localhost).
    - timeout: Request timeout in seconds.
    - raise_on_error: Raise on HTTP/connection errors if True; else return error dict.

    Returns
    - Dict with backend message or structured error.

    Usage
        print(ping(base_url="http://localhost:5000"))
    """
    return _api.ping_backend(base_url=base_url, timeout=timeout, raise_on_error=raise_on_error)


def latest_analysis(
    *,
    base_url: str = _api.DEFAULT_BASE_URL,
    timeout: float = 15.0,
    raise_on_error: bool = True,
) -> Dict[str, Any]:
    """Fetch the most recently cached analysis via the backend.

    Parameters
    - base_url: Backend base URL.
    - timeout: Request timeout in seconds.
    - raise_on_error: Raise on HTTP/connection errors if True; else return error dict.

    Returns
    - Parsed analysis dict or structured error.
    """
    return _api.get_latest_analysis(base_url=base_url, timeout=timeout, raise_on_error=raise_on_error)


def upload(
    file_path: str,
    *,
    base_url: str = _api.DEFAULT_BASE_URL,
    timeout: float = 30.0,
    raise_on_error: bool = True,
) -> Dict[str, Any]:
    """Upload a dataset for validation/metadata without full analysis.

    Parameters
    - file_path: Path to CSV (or Excel if supported server-side).
    - base_url: Backend base URL.
    - timeout: Request timeout in seconds.
    - raise_on_error: Raise on HTTP/connection errors if True; else return error dict.

    Returns
    - Dict with rows, cols, columns, warnings, or structured error.

    Usage
        info = upload(r"path/to/data.csv", base_url="http://localhost:5000")
    """
    return _api.upload_dataset(file_path, base_url=base_url, timeout=timeout, raise_on_error=raise_on_error)


def analyze(
    file_path: str,
    *,
    base_url: str = _api.DEFAULT_BASE_URL,
    excluded: Optional[Iterable[str]] = None,
    run_gemini: bool = False,
    return_plots: str = "none",
    timeout: float = 120.0,
    raise_on_error: bool = True,
) -> Dict[str, Any]:
    """Run a full dataset analysis via the backend.

    Parameters
    - file_path: Path to the dataset.
    - base_url: Backend base URL.
    - excluded: Iterable of columns to exclude; None uses server defaults.
    - run_gemini: Whether to request Gemini summary (server must be configured).
    - return_plots: One of {"none", "json", "png", "both"}.
    - timeout: Request timeout in seconds.
    - raise_on_error: Raise on HTTP/connection errors if True; else return error dict.

    Returns
    - Analysis result dict or structured error.

    Usage
        res = analyze(r"path/to/data.csv", base_url="http://localhost:5000",
                      run_gemini=False, return_plots="json")
    """
    return _api.analyze_dataset(
        file_path,
        base_url=base_url,
        excluded=excluded,
        run_gemini=run_gemini,
        return_plots=return_plots,
        timeout=timeout,
        raise_on_error=raise_on_error,
    )


def plot_png(
    file_path: str,
    *,
    fig_id: str = "fig1",
    base_url: str = _api.DEFAULT_BASE_URL,
    excluded: Optional[Iterable[str]] = None,
    timeout: float = 45.0,
    save_path: Optional[str] = None,
    raise_on_error: bool = True,
) -> bytes | Dict[str, Any]:
    """Generate and return a single PNG plot via the backend.

    Parameters
    - file_path: Path to dataset used for plotting.
    - fig_id: One of {"fig1", "fig2", "fig3"}.
    - base_url: Backend base URL.
    - excluded: Columns to exclude.
    - timeout: Request timeout in seconds.
    - save_path: If provided, write PNG bytes to this path.
    - raise_on_error: Raise on HTTP/connection errors if True; else return error dict.

    Returns
    - PNG bytes or structured error dict.
    """
    return _api.get_plot_png(
        file_path,
        fig_id=fig_id,
        base_url=base_url,
        excluded=excluded,
        timeout=timeout,
        save_path=save_path,
        raise_on_error=raise_on_error,
    )


__all__ = [
    # Local JSON helpers
    "load_cached_analysis",
    "load_latest_json",
    # Backend wrappers
    "ping",
    "latest_analysis",
    "upload",
    "analyze",
    "plot_png",
]
