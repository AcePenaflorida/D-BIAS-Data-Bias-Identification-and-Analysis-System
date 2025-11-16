import os
import time
import random
import logging
import redis
from rq import Queue, Worker
from contextlib import contextmanager
from gemini_connector import GeminiKeyManager, GeminiConnector

# --- Supabase client for monitoring logs ---
from supabase import create_client, Client
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
supabase_monitor: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

def log_monitor_event(event_type, key_id=None, request_id=None, details=None, instance_id=None):
    payload = {
        "event_type": event_type,
        "key_id": key_id,
        "request_id": request_id,
        "details": details or {},
        "instance_id": instance_id,
        # timestamp is defaulted in DB
    }
    try:
        supabase_monitor.table("gemini_api_monitor").insert(payload).execute()
    except Exception as e:
        logger.warning(f"[monitor] Failed to log event: {event_type}, error: {e}")

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
GEMINI_CONCURRENCY_LIMIT = int(os.getenv("GEMINI_CONCURRENCY_LIMIT", "3"))
GEMINI_QUEUE_NAME = os.getenv("GEMINI_QUEUE_NAME", "gemini_requests")

redis_client = redis.Redis.from_url(REDIS_URL)
gemini_queue = Queue(GEMINI_QUEUE_NAME, connection=redis_client)

logger = logging.getLogger("distributed_gemini")
logger.setLevel(logging.INFO)

@contextmanager
def distributed_semaphore(name, limit, timeout=60):
    """
    Distributed semaphore using Redis.
    Acquires a slot before entering, releases after.
    """
    key = f"semaphore:{name}"
    start = time.time()
    acquired = False
    while not acquired:
        current = redis_client.incr(key)
        if current <= limit:
            acquired = True
            logger.info(f"[semaphore] Acquired slot ({current}/{limit}) after {round(time.time()-start,2)}s wait")
            log_monitor_event(
                event_type="semaphore_acquired",
                request_id=None,
                details={"slot": current, "limit": limit, "wait_time": round(time.time()-start,2)},
            )
            break
        else:
            redis_client.decr(key)
            logger.info(f"[semaphore] Waiting for slot ({current-1}/{limit}), sleeping...")
            log_monitor_event(
                event_type="semaphore_wait",
                request_id=None,
                details={"slot": current-1, "limit": limit},
            )
            time.sleep(0.5)
    try:
        yield
    finally:
        redis_client.decr(key)
        slot = int(redis_client.get(key) or 0)
        logger.info(f"[semaphore] Released slot ({slot}/{limit})")
        log_monitor_event(
            event_type="semaphore_released",
            request_id=None,
            details={"slot": slot, "limit": limit},
        )

def process_gemini_request(request_id, bias_report, dataset_name, shape, excluded_columns, use_multi_key=True, max_retries=3):
    """
    Worker function to process Gemini requests with distributed semaphore and key rotation.
    """
    log = lambda msg: logger.info(f"[request:{request_id}] {msg}")
    key_manager = GeminiKeyManager(log=log)
    gemini_connector = GeminiConnector(key_manager=key_manager, log=log)
    cache_key = f"{dataset_name}|{shape}|{excluded_columns}|{str(bias_report)[:200000]}"
    # Implement your caching logic here (e.g., Redis or in-memory)
    # If cache hit:
    #   log("Cache hit")
    #   return cached_result

    with distributed_semaphore("gemini", GEMINI_CONCURRENCY_LIMIT):
        log("Semaphore acquired, starting Gemini call")
        log_monitor_event(
            event_type="gemini_call_start",
            request_id=request_id,
            details={"dataset": dataset_name, "shape": shape, "excluded": excluded_columns},
        )
        result = gemini_connector.summarize_biases(
            bias_report,
            dataset_name=dataset_name,
            shape=shape,
            excluded_columns=excluded_columns,
            use_multi_key=use_multi_key,
            max_retries=max_retries
        )
        log("Gemini call finished")
        log_monitor_event(
            event_type="gemini_call_finished",
            request_id=request_id,
            details={"dataset": dataset_name, "shape": shape, "excluded": excluded_columns},
        )
        # Save to cache if needed
        return result

def enqueue_gemini_request(bias_report, dataset_name, shape, excluded_columns):
    """
    Enqueue a Gemini request if all keys are on cooldown.
    """
    request_id = f"{int(time.time()*1000)}_{random.randint(1000,9999)}"
    logger.info(f"[queue] Enqueuing request {request_id}")
    job = gemini_queue.enqueue(
        process_gemini_request,
        request_id,
        bias_report,
        dataset_name,
        shape,
        excluded_columns,
        use_multi_key=True,
        max_retries=3
    )
    logger.info(f"[queue] Request {request_id} enqueued, job id: {job.id}")
    log_monitor_event(
        event_type="request_enqueued",
        request_id=request_id,
        details={"job_id": job.id, "dataset": dataset_name, "shape": shape, "excluded": excluded_columns},
    )
    return job.id

def handle_gemini_request(bias_report, dataset_name, shape, excluded_columns):
    """
    Main entry point for backend Gemini requests.
    If all keys are on cooldown, enqueue the request.
    Otherwise, process immediately.
    """
    key_manager = GeminiKeyManager(log=logger.info)
    available_key = key_manager.get_next_key()
    if not available_key:
        logger.info("[queue] All keys on cooldown, enqueuing request")
        log_monitor_event(
            event_type="all_keys_on_cooldown",
            request_id=None,
            details={"dataset": dataset_name, "shape": shape, "excluded": excluded_columns},
        )
        job_id = enqueue_gemini_request(bias_report, dataset_name, shape, excluded_columns)
        return {"status": "queued", "job_id": job_id}
    else:
        logger.info("[direct] Key available, processing immediately")
        log_monitor_event(
            event_type="key_available",
            key_id=available_key.get("id"),
            details={"dataset": dataset_name, "shape": shape, "excluded": excluded_columns},
        )
        return process_gemini_request(
            f"direct_{int(time.time()*1000)}",
            bias_report,
            dataset_name,
            shape,
            excluded_columns,
            use_multi_key=True,
            max_retries=3
        )

# Example usage in Flask endpoint:
# result = handle_gemini_request(bias_report, f.filename, df.shape, excluded_cols)
# if isinstance(result, dict) and result.get("status") == "queued":
#     return jsonify({"message": "Request queued, will be processed soon.", "job_id": result["job_id"]}), 202
# else:
#     return jsonify({"summary": result}), 200

# To run workers (e.g., on Render, as a separate process):
# python -m rq worker gemini_requests --url redis://...