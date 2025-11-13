"""Lightweight client for the D-BIAS backend API.

This module exposes simple, reusable functions for each public endpoint in
`backend/app.py`. Each function uses sensible defaults, offers common
customization knobs, and performs basic error handling.

Typical usage:

    from backend.api_client import (
        ping_backend, get_latest_analysis, upload_dataset,
        analyze_dataset, get_plot_png,
    )

    base = "http://localhost:5000"
    print(ping_backend(base))

    analysis = get_latest_analysis(base)
    result = analyze_dataset("/path/to/data.csv", base_url=base, return_plots="json")

Notes
- All functions accept `base_url` with default coming from the environment
  variable `DBIAS_BACKEND_URL` or falling back to "http://localhost:5000".
- Set `raise_on_error=False` to receive structured error dicts instead of
  exceptions on HTTP or connection errors.
"""

from __future__ import annotations

import os
from typing import Any, Dict, Iterable, Optional

import requests

# Default base URL can be overridden via environment variable for convenience
DEFAULT_BASE_URL = os.getenv("DBIAS_BACKEND_URL", "http://localhost:5000")


def _join_url(base_url: str, path: str) -> str:
    base = base_url.rstrip("/")
    suffix = path if path.startswith("/") else "/" + path
    return base + suffix


def _handle_json_response(
    resp: requests.Response,
    *,
    raise_on_error: bool,
) -> Dict[str, Any]:
    """Parse a JSON response and handle common HTTP errors.

    Parameters
    - resp: The `requests.Response` object.
    - raise_on_error: If True, raise for HTTP >= 400; else return error dict.

    Returns
    - Parsed JSON dict on success, or an error dict if `raise_on_error=False`.
    """
    content_type = resp.headers.get("Content-Type", "").lower()
    is_json = "application/json" in content_type or ";+json" in content_type

    if 200 <= resp.status_code < 300:
        if is_json:
            return resp.json()
        # Non-JSON success; surface raw text for visibility
        return {"status": "ok", "content": resp.text}

    # Error path
    if raise_on_error:
        try:
            resp.raise_for_status()
        except requests.HTTPError as e:
            # Attach server-provided error body (if any) for better debuggability
            try:
                details = resp.json()
            except Exception:
                details = resp.text
            e.args = (*e.args, {"status_code": resp.status_code, "details": details})
            raise
    # Structured error return
    try:
        details = resp.json() if is_json else resp.text
    except Exception:
        details = resp.text
    return {"error": "http_error", "status_code": resp.status_code, "details": details}


def ping_backend(
    base_url: str = DEFAULT_BASE_URL,
    *,
    timeout: float = 10.0,
    raise_on_error: bool = True,
) -> Dict[str, Any]:
    """Ping the backend root endpoint.

    Parameters
    - base_url: Backend base URL (default from `DBIAS_BACKEND_URL` or localhost).
    - timeout: Request timeout in seconds.
    - raise_on_error: Raise on HTTP/connection errors if True.

    Returns
    - Dict with backend message or an error dict when `raise_on_error=False`.
    """
    url = _join_url(base_url, "/")
    try:
        resp = requests.get(url, timeout=timeout)
        return _handle_json_response(resp, raise_on_error=raise_on_error)
    except requests.RequestException as e:
        if raise_on_error:
            raise
        return {"error": "connection_error", "details": str(e)}


def get_latest_analysis(
    base_url: str = DEFAULT_BASE_URL,
    *,
    timeout: float = 15.0,
    raise_on_error: bool = True,
) -> Dict[str, Any]:
    """Fetch the most recently cached analysis from `/api/analysis/latest`.

    Parameters
    - base_url: Backend base URL.
    - timeout: Request timeout in seconds.
    - raise_on_error: Raise on HTTP/connection errors if True.

    Returns
    - Parsed analysis JSON dict or error dict when `raise_on_error=False`.
    """
    url = _join_url(base_url, "/api/analysis/latest")
    try:
        resp = requests.get(url, timeout=timeout)
        return _handle_json_response(resp, raise_on_error=raise_on_error)
    except requests.RequestException as e:
        if raise_on_error:
            raise
        return {"error": "connection_error", "details": str(e)}


def upload_dataset(
    file_path: str,
    *,
    base_url: str = DEFAULT_BASE_URL,
    timeout: float = 30.0,
    raise_on_error: bool = True,
) -> Dict[str, Any]:
    """Upload a dataset to `/api/upload` to validate and inspect columns.

    Parameters
    - file_path: Path to the CSV file to upload.
    - base_url: Backend base URL.
    - timeout: Request timeout in seconds.
    - raise_on_error: Raise on HTTP/connection errors if True.

    Returns
    - Dict with dataset info (rows, cols, columns, warnings) or error dict.
    """
    url = _join_url(base_url, "/api/upload")
    try:
        with open(file_path, "rb") as fh:
            files = {"file": (os.path.basename(file_path), fh, "text/csv")}
            resp = requests.post(url, files=files, timeout=timeout)
        return _handle_json_response(resp, raise_on_error=raise_on_error)
    except FileNotFoundError as e:
        if raise_on_error:
            raise
        return {"error": "file_not_found", "details": str(e)}
    except requests.RequestException as e:
        if raise_on_error:
            raise
        return {"error": "connection_error", "details": str(e)}


def analyze_dataset(
    file_path: str,
    *,
    base_url: str = DEFAULT_BASE_URL,
    excluded: Optional[Iterable[str]] = None,
    run_gemini: bool = False,
    return_plots: str = "none",
    timeout: float = 120.0,
    raise_on_error: bool = True,
) -> Dict[str, Any]:
    """Run a full analysis via `/api/analyze`.

    Parameters
    - file_path: Path to the CSV/Excel file to analyze.
    - base_url: Backend base URL.
    - excluded: Iterable of columns to exclude; if None, server defaults apply.
    - run_gemini: Whether to request the Gemini summary (requires server key).
    - return_plots: One of {"none", "json", "png", "both"}.
    - timeout: Request timeout in seconds.
    - raise_on_error: Raise on HTTP/connection errors if True.

    Returns
    - Analysis JSON dict on success, or error dict when `raise_on_error=False`.
    """
    allowed = {"none", "json", "png", "both"}
    if return_plots not in allowed:
        if raise_on_error:
            raise ValueError(f"return_plots must be one of {allowed}")
        return {"error": "invalid_parameter", "details": f"return_plots must be one of {allowed}"}

    url = _join_url(base_url, "/api/analyze")
    data = {
        "run_gemini": "true" if run_gemini else "false",
        "return_plots": return_plots,
    }
    if excluded is not None:
        data["excluded"] = ",".join(str(c).strip() for c in excluded if str(c).strip())

    try:
        with open(file_path, "rb") as fh:
            files = {"file": (os.path.basename(file_path), fh)}
            resp = requests.post(url, data=data, files=files, timeout=timeout)
        return _handle_json_response(resp, raise_on_error=raise_on_error)
    except FileNotFoundError as e:
        if raise_on_error:
            raise
        return {"error": "file_not_found", "details": str(e)}
    except requests.RequestException as e:
        if raise_on_error:
            raise
        return {"error": "connection_error", "details": str(e)}


def get_plot_png(
    file_path: str,
    *,
    fig_id: str = "fig1",
    base_url: str = DEFAULT_BASE_URL,
    excluded: Optional[Iterable[str]] = None,
    timeout: float = 45.0,
    save_path: Optional[str] = None,
    raise_on_error: bool = True,
) -> bytes | Dict[str, Any]:
    """Generate and download a single PNG plot via `/api/plot/<fig_id>.png`.

    Parameters
    - file_path: Path to the CSV/Excel file to analyze for the plot.
    - fig_id: One of {"fig1", "fig2", "fig3"}.
    - base_url: Backend base URL.
    - excluded: Iterable of columns to exclude; if None, server defaults apply.
    - timeout: Request timeout in seconds.
    - save_path: If provided, write the PNG bytes to this path.
    - raise_on_error: Raise on HTTP/connection errors if True.

    Returns
    - Raw PNG bytes on success. If `save_path` is provided, also writes the
      file to disk and returns the same bytes.
    - Error dict when `raise_on_error=False` and a problem occurs.
    """
    fig_id = str(fig_id).lower().strip()
    if fig_id not in {"fig1", "fig2", "fig3"}:
        if raise_on_error:
            raise ValueError('fig_id must be one of {"fig1", "fig2", "fig3"}')
        return {"error": "invalid_parameter", "details": 'fig_id must be one of {"fig1", "fig2", "fig3"}'}

    url = _join_url(base_url, f"/api/plot/{fig_id}.png")
    data = {}
    if excluded is not None:
        data["excluded"] = ",".join(str(c).strip() for c in excluded if str(c).strip())

    try:
        with open(file_path, "rb") as fh:
            files = {"file": (os.path.basename(file_path), fh)}
            resp = requests.post(url, data=data, files=files, timeout=timeout)

        # Success path: content-type should be image/png
        if 200 <= resp.status_code < 300 and resp.headers.get("Content-Type", "").lower().startswith("image/png"):
            content = resp.content
            if save_path:
                with open(save_path, "wb") as out:
                    out.write(content)
            return content

        # Otherwise attempt to surface JSON/text error via common handler
        if raise_on_error:
            try:
                resp.raise_for_status()
            except requests.HTTPError as e:
                try:
                    details = resp.json()
                except Exception:
                    details = resp.text
                e.args = (*e.args, {"status_code": resp.status_code, "details": details})
                raise
        # Structured error return
        try:
            details = resp.json()
        except Exception:
            details = resp.text
        return {"error": "http_error", "status_code": resp.status_code, "details": details}

    except FileNotFoundError as e:
        if raise_on_error:
            raise
        return {"error": "file_not_found", "details": str(e)}
    except requests.RequestException as e:
        if raise_on_error:
            raise
        return {"error": "connection_error", "details": str(e)}


__all__ = [
    "DEFAULT_BASE_URL",
    "ping_backend",
    "get_latest_analysis",
    "upload_dataset",
    "analyze_dataset",
    "get_plot_png",
]
