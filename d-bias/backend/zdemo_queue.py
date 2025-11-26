import os
from dotenv import load_dotenv

load_dotenv()
import redis
from rq import Queue
from distributed_gemini_manager import process_gemini_request

# Use the same Redis URL as your worker
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
redis_client = redis.Redis.from_url(REDIS_URL)
queue = Queue(os.getenv("GEMINI_QUEUE_NAME", "gemini_requests"), connection=redis_client)

# Dummy data for demonstration
request_id = "demo_test_001"
bias_report = [{"bias_id": "bias_0001", "feature": "age", "type": "Numeric Correlation", "severity": "High"}]
dataset_name = "demo_dataset.csv"
shape = (100, 10)
excluded_columns = ["id"]

# Enqueue the job
job = queue.enqueue(
    process_gemini_request,
    request_id,
    bias_report,
    dataset_name,
    shape,
    excluded_columns,
    True,  # use_multi_key
    1      # max_retries
)

print(f"Enqueued job: {job.id}")
print("Waiting for worker to process...")

# Optionally, poll for job status
import time
while True:
    job.refresh()
    print(f"Job status: {job.get_status()}")
    if job.is_finished or job.is_failed:
        print("Job result:", job.result)
        break
    time.sleep(2)