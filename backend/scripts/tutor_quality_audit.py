"""Opt-in local real-provider tutor audit. Never writes credentials to results."""
import argparse
import json
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlencode

CASES = [
    ("beginner", "beginner", "I am new to probability. A bag has three blue counters and one gold. Each counter is equally likely to be chosen. Help me find the probability of gold, one small step at a time. Do not give me the answer yet."),
    ("misconception", "beginner", "I think P(gold) is 1/3 because there are three blue counters and one gold. Each counter is equally likely. Is my reasoning correct? Explain simply and ask one question to help me fix it."),
    ("advanced", "advanced", "I understand basic probability. Explain why favourable outcomes divided by total outcomes fails when outcomes are not equally likely. Give one short numerical counterexample and a question to check my understanding."),
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--credentials", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--rounds", type=int, default=3)
    parser.add_argument("--pause-seconds", type=float, default=0, help="Pause between requests for a paced quality audit; leave at zero to test burst capacity")
    args = parser.parse_args()
    for attempt in range(30):
        try:
            with urllib.request.urlopen("http://localhost:8000/openapi.json", timeout=2):
                break
        except (urllib.error.URLError, TimeoutError):
            if attempt == 29:
                raise SystemExit("Local backend did not become ready within 60 seconds")
            time.sleep(2)
    user = next(row for row in json.loads(args.credentials.read_text()) if row["username"] == "northstar.student")
    token = None

    def request(path, data=None, as_json=False):
        headers = {"Authorization": "Bearer " + token} if token else {}
        body = None
        if data is not None:
            headers["Content-Type"] = "application/json" if as_json else "application/x-www-form-urlencoded"
            body = (json.dumps(data) if as_json else urlencode(data)).encode()
        req = urllib.request.Request("http://localhost:8000/api" + path, data=body, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=90) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as error:
            return error.code, json.load(error)

    status, auth = request("/token", {"username": user["username"], "password": user["password"]})
    if status != 200:
        raise SystemExit("Demo login failed")
    token = auth["access_token"]
    results = []

    def ask(name, level, question, chat_id=None):
        if results and args.pause_seconds > 0:
            time.sleep(args.pause_seconds)
        started = time.monotonic()
        data = {"user_id": user["username"], "question": question, "tutor_mode": "true",
                "tutor_reply_style": "guided", "use_hs_context": "false"}
        if chat_id:
            data["chat_id"] = chat_id
        try:
            status, body = request("/ask_simple/", data)
        except Exception as error:
            status, body = 0, {"error": type(error).__name__}
        row = {"case": name, "expected_level": level, "prompt": question, "http_status": status,
               "elapsed_seconds": round(time.monotonic() - started, 2), "chat_id": chat_id, "response": body}
        results.append(row)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(results, indent=2))
        print(name, status, row["elapsed_seconds"], body.get("tutor_state", {}).get("level"), flush=True)
        if status == 429:
            raise SystemExit("Usage limit reached; audit stopped without issuing more AI calls")

    for iteration in range(1, args.rounds + 1):
        for name, level, question in CASES:
            ask(f"{name}-{iteration}", level, question)
    status, chat = request("/create_chat_session", {"user_id": user["username"],
        "title": "QA — Tutor difficulty and progression"}, as_json=True)
    if status != 200:
        raise SystemExit("Could not create QA conversation")
    chat_id = chat["id"]
    ask("conversation-start", "beginner", CASES[0][2], chat_id)
    ask("conversation-correct-answer", "beginner", "There are 4 counters in total, and P(gold)=1/4.", chat_id)
    ask("conversation-increase-level", "advanced", "Please make it advanced: give one short counterexample using unequal probabilities, then one new check question.", chat_id)
    ask("conversation-help", "beginner", "I am stuck; explain simply and give me a small hint.", chat_id)
    failed = [row["case"] for row in results if row["http_status"] != 200 or row["response"].get("tutor_state", {}).get("level") != row["expected_level"]]
    if failed:
        raise SystemExit("Failed HTTP/difficulty checks: " + ", ".join(failed))
    print("HTTP and difficulty checks passed. Inspect the saved answers for correctness, repetition and clarity.")


if __name__ == "__main__":
    main()
