import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_LOG_PATH = Path(__file__).resolve().parent / "run_records.jsonl"


def append_run_record(record: dict[str, Any]) -> None:
    """Append a single run record to a local JSONL file."""
    try:
        with _LOG_PATH.open("a", encoding="utf-8") as f:
            f.write(json.dumps(record, default=str) + "\n")
    except Exception as exc:
        logger.error("Failed to append run record: %s", exc)
