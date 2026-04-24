import json
import os
import signal
import socket
import sys
import time
import traceback
import urllib.parse
from datetime import datetime, timezone
from typing import Any, Dict, List

from runtime import request_json, run_cycle


DEFAULT_SERVICE_NAME = "bots_runtime"
DEFAULT_LOOP_INTERVAL_MS = 15000
DEFAULT_TIMEOUT_SECONDS = 30.0

RUNNING = True


def env_string(name: str, default: str = "") -> str:
    value = os.environ.get(name)
    return value.strip() if isinstance(value, str) else default


def env_float(name: str, default: float) -> float:
    try:
        value = float(os.environ.get(name, default))
        if value > 0:
            return value
    except Exception:
        pass
    return default


def env_int(name: str, default: int) -> int:
    try:
        value = int(float(os.environ.get(name, default)))
        if value >= 0:
            return value
    except Exception:
        pass
    return default


def env_bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def log(level: str, message: str, **payload: Any) -> None:
    entry = {
        "timestamp": utc_now_iso(),
        "level": level,
        "service": SERVICE_NAME,
        "instanceId": INSTANCE_ID,
        "message": message,
    }
    if payload:
        entry["context"] = payload
    print(json.dumps(entry, ensure_ascii=False), flush=True)


def handle_signal(signum: int, _frame: Any) -> None:
    global RUNNING
    RUNNING = False
    log("info", "shutdown signal received", signal=signum)


def backend_request(
    path: str,
    method: str = "GET",
    body: Dict[str, Any] | None = None,
    retries: int = 0,
) -> Any:
    return request_json(
        BACKEND_BASE_URL,
        BACKEND_SHARED_SECRET,
        path,
        method=method,
        body=body,
        timeout=BACKEND_TIMEOUT_SECONDS,
        retries=retries,
    )


def post_heartbeat() -> Dict[str, Any]:
    response = backend_request(
        "/api/bot-runtime/heartbeat",
        method="POST",
        body={
            "serviceName": SERVICE_NAME,
            "instanceId": INSTANCE_ID,
            "metadata": {
                "hostname": socket.gethostname(),
                "pid": os.getpid(),
                "version": env_string("BOT_RUNTIME_VERSION", "python-service-v1"),
            },
        },
        retries=0,
    )
    if not isinstance(response, dict):
        return {}
    return response


def post_maintenance() -> None:
    backend_request(
        "/api/bot-runtime/maintenance",
        method="POST",
        body={"requestedAt": utc_now_iso()},
        retries=0,
    )


def fetch_queue_items() -> List[Dict[str, Any]]:
    response = backend_request("/api/bot-runtime/queue", retries=0)

    if isinstance(response, dict):
        items = response.get("items")
        if isinstance(items, list):
            return [item for item in items if isinstance(item, dict)]

    if isinstance(response, list):
        return [item for item in response if isinstance(item, dict)]

    return []


def fetch_cycle_context(bot_id: str) -> Dict[str, Any]:
    return backend_request(
        f"/api/bot-runtime/bots/{urllib.parse.quote(bot_id, safe='')}/cycle-context",
        retries=0,
    )


def apply_cycle_result(bot_id: str, user_id: str, generated_at: str | None, cycle_result: Dict[str, Any]) -> None:
    body = {
        "userId": user_id,
        "cycleResult": cycle_result,
    }
    if generated_at:
        body["generatedAt"] = generated_at

    backend_request(
        f"/api/bot-runtime/bots/{urllib.parse.quote(bot_id, safe='')}/apply-cycle",
        method="POST",
        body=body,
        retries=0,
    )


def process_queue() -> int:
    items = fetch_queue_items()
    if MAX_BOTS_PER_LOOP > 0:
        items = items[:MAX_BOTS_PER_LOOP]

    if not items:
        log("debug", "queue empty")
        return 0

    processed = 0

    for item in items:
        bot_id = str(item.get("botId") or "").strip()
        user_id = str(item.get("userId") or "").strip()

        if not bot_id or not user_id:
            continue

        try:
            context = fetch_cycle_context(bot_id)
            if not isinstance(context, dict) or not isinstance(context.get("payload"), dict):
                log("warning", "cycle context missing payload", botId=bot_id)
                continue

            cycle_result = run_cycle(context["payload"])
            if not isinstance(cycle_result, dict):
                raise RuntimeError("runtime.py returned invalid cycle payload")

            apply_cycle_result(
                bot_id=bot_id,
                user_id=str(context.get("userId") or user_id),
                generated_at=str(context.get("generatedAt") or "") or None,
                cycle_result=cycle_result,
            )
            processed += 1

            log(
                "info",
                "bot cycle processed",
                botId=bot_id,
                userId=user_id,
                executionStatus=((cycle_result.get("plan") or {}).get("status")),
                pair=((cycle_result.get("plan") or {}).get("pair")),
                action=((cycle_result.get("plan") or {}).get("action")),
            )
        except Exception as error:
            log(
                "error",
                "bot cycle failed",
                botId=bot_id,
                userId=user_id,
                error=str(error),
                traceback=traceback.format_exc(limit=8),
            )

    return processed


def sleep_until_next_iteration(elapsed_ms: float) -> None:
    remaining_ms = max(250.0, float(LOOP_INTERVAL_MS) - elapsed_ms)
    deadline = time.monotonic() + (remaining_ms / 1000.0)

    while RUNNING and time.monotonic() < deadline:
        time.sleep(min(1.0, max(0.05, deadline - time.monotonic())))


def main() -> int:
    if not BACKEND_SHARED_SECRET:
        print("BOT_RUNTIME_SHARED_SECRET is required", file=sys.stderr)
        return 1

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    log(
        "info",
        "external bots runtime started",
        backendBaseUrl=BACKEND_BASE_URL,
        loopIntervalMs=LOOP_INTERVAL_MS,
        maxBotsPerLoop=MAX_BOTS_PER_LOOP,
        maintenanceEnabled=MAINTENANCE_ENABLED,
    )

    while RUNNING:
        started_at = time.monotonic()

        try:
            heartbeat = post_heartbeat()
            log("debug", "heartbeat acknowledged", heartbeatAt=heartbeat.get("heartbeatAt"))

            if MAINTENANCE_ENABLED:
                post_maintenance()

            processed = process_queue()

            if MAINTENANCE_ENABLED and processed > 0:
                post_maintenance()
        except Exception as error:
            log(
                "error",
                "runtime loop failed",
                error=str(error),
                traceback=traceback.format_exc(limit=8),
            )

        elapsed_ms = (time.monotonic() - started_at) * 1000.0
        sleep_until_next_iteration(elapsed_ms)

    log("info", "external bots runtime stopped")
    return 0


BACKEND_BASE_URL = env_string("BOT_RUNTIME_BACKEND_BASE_URL", "http://localhost:3001")
BACKEND_SHARED_SECRET = env_string("BOT_RUNTIME_SHARED_SECRET")
BACKEND_TIMEOUT_SECONDS = env_float("BOT_RUNTIME_TIMEOUT_SECONDS", DEFAULT_TIMEOUT_SECONDS)
SERVICE_NAME = env_string("BOT_RUNTIME_SERVICE_NAME", DEFAULT_SERVICE_NAME)
INSTANCE_ID = env_string("BOT_RUNTIME_INSTANCE_ID", f"{socket.gethostname()}-{os.getpid()}")
LOOP_INTERVAL_MS = env_int("BOT_RUNTIME_LOOP_INTERVAL_MS", DEFAULT_LOOP_INTERVAL_MS)
MAX_BOTS_PER_LOOP = env_int("BOT_RUNTIME_MAX_BOTS_PER_LOOP", 0)
MAINTENANCE_ENABLED = env_bool("BOT_RUNTIME_ENABLE_MAINTENANCE", True)


if __name__ == "__main__":
    raise SystemExit(main())
