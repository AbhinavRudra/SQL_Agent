from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any

_WRITE_LOCK = Lock()
_DEFAULT_LOG_PATH = Path(__file__).resolve().parent / "reports" / "query_runs.jsonl"


def append_run_record(
    record: dict[str, Any], log_path: str | Path | None = None
) -> None:
    """Append a single structured run record to a JSONL file."""
    destination = Path(log_path) if log_path is not None else _DEFAULT_LOG_PATH
    destination.parent.mkdir(parents=True, exist_ok=True)

    payload = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **record,
    }

    line = json.dumps(payload, default=str, ensure_ascii=False)
    with _WRITE_LOCK:
        with destination.open("a", encoding="utf-8") as handle:
            handle.write(line + "\n")
