from __future__ import annotations

import json
import os
import re
from collections import Counter
from dataclasses import dataclass
from typing import Any

import firebase_admin
from firebase_admin import credentials, firestore

DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
VALID_DONE = {"done", "not done"}


@dataclass
class AuditResult:
    total_docs: int
    missing_user_id: int
    invalid_date: int
    invalid_sleep_time: int
    invalid_done_fields: int
    invalid_numeric_fields: int
    missing_nutrition_triplet: int


def init_firebase() -> firestore.Client:
    if not firebase_admin._apps:
        service_account_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
        service_account_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH", "").strip()

        if service_account_json:
            cert_data = json.loads(service_account_json)
            firebase_admin.initialize_app(credentials.Certificate(cert_data))
        elif service_account_path:
            firebase_admin.initialize_app(credentials.Certificate(service_account_path))
        else:
            firebase_admin.initialize_app()

    return firestore.client()


def is_valid_date(value: Any) -> bool:
    return isinstance(value, str) and bool(DATE_PATTERN.match(value))


def is_valid_sleep(value: Any) -> bool:
    if value is None:
        return True
    if not isinstance(value, str) or ":" not in value:
        return False
    hh, mm = value.split(":", 1)
    if not (hh.isdigit() and mm.isdigit()):
        return False
    h_num = int(hh)
    m_num = int(mm)
    return 0 <= h_num <= 24 and 0 <= m_num <= 59


def is_numeric_or_none(value: Any) -> bool:
    return value is None or isinstance(value, (int, float))


def audit_daily_logs(db: firestore.Client) -> tuple[AuditResult, Counter[str]]:
    stream = db.collection("dailyLogs").stream()

    counters = Counter[str]()
    total_docs = 0

    for item in stream:
        total_docs += 1
        data = item.to_dict() or {}

        if not isinstance(data.get("userId"), str) or not data.get("userId"):
            counters["missing_user_id"] += 1

        if not is_valid_date(data.get("date")):
            counters["invalid_date"] += 1

        if not is_valid_sleep(data.get("sleepTime")):
            counters["invalid_sleep_time"] += 1

        for done_field in ["skinCare", "shower", "supplement", "anki"]:
            value = data.get(done_field)
            if value is not None and value not in VALID_DONE:
                counters["invalid_done_fields"] += 1
                break

        numeric_fields = [
            "weight",
            "nutritionCalorieScore",
            "nutritionProteinScore",
            "nutritionQualityScore",
        ]
        if not all(is_numeric_or_none(data.get(field)) for field in numeric_fields):
            counters["invalid_numeric_fields"] += 1

        nutrition = [
            data.get("nutritionCalorieScore"),
            data.get("nutritionProteinScore"),
            data.get("nutritionQualityScore"),
        ]
        present_count = sum(1 for value in nutrition if isinstance(value, (int, float)))
        if present_count not in {0, 3}:
            counters["missing_nutrition_triplet"] += 1

    return (
        AuditResult(
            total_docs=total_docs,
            missing_user_id=counters["missing_user_id"],
            invalid_date=counters["invalid_date"],
            invalid_sleep_time=counters["invalid_sleep_time"],
            invalid_done_fields=counters["invalid_done_fields"],
            invalid_numeric_fields=counters["invalid_numeric_fields"],
            missing_nutrition_triplet=counters["missing_nutrition_triplet"],
        ),
        counters,
    )


def main() -> None:
    db = init_firebase()
    summary, counters = audit_daily_logs(db)

    print("DailyLogs audit summary")
    print("----------------------")
    print(f"Total docs: {summary.total_docs}")
    print(f"Missing userId: {summary.missing_user_id}")
    print(f"Invalid date: {summary.invalid_date}")
    print(f"Invalid sleepTime: {summary.invalid_sleep_time}")
    print(f"Invalid done/not done fields: {summary.invalid_done_fields}")
    print(f"Invalid numeric fields: {summary.invalid_numeric_fields}")
    print(f"Partial nutrition triplet: {summary.missing_nutrition_triplet}")

    issues = sum(
        [
            summary.missing_user_id,
            summary.invalid_date,
            summary.invalid_sleep_time,
            summary.invalid_done_fields,
            summary.invalid_numeric_fields,
            summary.missing_nutrition_triplet,
        ]
    )

    print("----------------------")
    if issues == 0:
        print("OK: no schema consistency issues found.")
    else:
        print(f"WARN: {issues} issue(s) found. Review and migrate before production rollout.")

    if counters:
        print("Raw counters:")
        print(json.dumps(dict(counters), indent=2))


if __name__ == "__main__":
    main()
