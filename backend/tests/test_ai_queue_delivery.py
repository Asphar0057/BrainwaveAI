"""Exercise real Redis atomic delivery/recovery using an isolated Unix socket."""
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import pytest
import redis
from redis.backoff import NoBackoff
from redis.retry import Retry

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from services import ai_job_queue as queue


@pytest.fixture()
def client(tmp_path, monkeypatch):
    binary = shutil.which("redis-server") or "/opt/homebrew/bin/redis-server"
    if not Path(binary).exists():
        pytest.skip("redis-server is required for queue integration tests")
    # macOS Unix socket paths are limited; pytest's default temp root is long.
    short_dir = tempfile.TemporaryDirectory(prefix="bwredis-", dir="/tmp")
    socket = str(Path(short_dir.name) / "redis.sock")
    process = subprocess.Popen([
        binary, "--port", "0", "--unixsocket", socket,
        "--save", "", "--appendonly", "no", "--dir", str(tmp_path),
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    connection = redis.Redis(
        unix_socket_path=socket, decode_responses=True,
        socket_connect_timeout=0.2, socket_timeout=0.2,
        retry=Retry(NoBackoff(), 0),
    )
    try:
        for _ in range(100):
            try:
                connection.ping()
                break
            except redis.ConnectionError:
                time.sleep(0.02)
        else:
            pytest.fail("Isolated Redis did not start")
        monkeypatch.setattr(queue, "get_redis_client", lambda: connection)
        yield connection
    finally:
        connection.close()
        process.terminate()
        process.wait(timeout=5)
        short_dir.cleanup()


def test_dequeue_keeps_unacknowledged_work_recoverable(client):
    queue.enqueue_ai_job(123)
    message = queue.dequeue_ai_job(timeout=0)
    assert message.job_id == 123
    assert queue.queue_depth() == 0
    processing = f"{queue.get_queue_name()}:processing"
    assert client.zcard(processing) == 1
    # Simulate a dead consumer whose delivery lease expired.
    client.zadd(processing, {message.receipt: time.time() - 1})
    assert queue.recover_queue_deliveries() == 1
    redelivered = queue.dequeue_ai_job(timeout=0)
    assert redelivered.job_id == 123
    queue.acknowledge_ai_job(redelivered)
    assert client.zcard(processing) == 0
    assert queue.recover_queue_deliveries() == 0


def test_retry_promotion_moves_only_due_jobs_once(client):
    queue.schedule_retry_ai_job(1, run_at=time.time() - 1)
    queue.schedule_retry_ai_job(2, run_at=time.time() + 1000)
    assert queue.promote_due_retry_jobs() == 1
    assert queue.promote_due_retry_jobs() == 0
    assert queue.retry_queue_depth() == 1
    message = queue.dequeue_ai_job(timeout=0)
    assert message.job_id == 1
    queue.acknowledge_ai_job(message)


def test_delivery_is_fifo_and_malformed_payload_does_not_stick(client):
    client.rpush(queue.get_queue_name(), "not json")
    queue.enqueue_ai_job(1)
    queue.enqueue_ai_job(2)
    assert queue.dequeue_ai_job(timeout=0) is None
    assert client.zcard(f"{queue.get_queue_name()}:processing") == 0
    assert queue.dequeue_ai_job(timeout=0).job_id == 1
    assert queue.dequeue_ai_job(timeout=0).job_id == 2
