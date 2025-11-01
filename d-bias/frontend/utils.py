import json


def pretty_json(obj: object, indent: int = 2) -> str:
    """Return a pretty-printed JSON string for display.

    Falls back to str(obj) if not JSON serializable.
    """
    try:
        return json.dumps(obj, indent=indent, default=str)
    except Exception:
        return str(obj)
