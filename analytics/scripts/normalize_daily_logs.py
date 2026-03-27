from __future__ import annotations

import argparse
import json
import os
import re
from typing import Any

import firebase_admin
from firebase_admin import credentials, firestore

DATE_PATTERN = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")
VALID_DONE_VALUES = {"done", "not done"}


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


def normalize_date(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    if DATE_PATTERN.match(text):
        return text
    if "T" in text and len(text) >= 10:
        maybe = text[:10]
        if DATE_PATTERN.match(maybe):
            return maybe
    return None


def normalize_sleep_time(value: Any) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        return None
    text = value.strip()
    if ":" not in text:
        return None
    hh, mm = text.split(":", 1)
    if not (hh.isdigit() and mm.isdigit()):
        return None
    h_num = int(hh)
    m_num = int(mm)
    if not (0 <= h_num <= 24 and 0 <= m_num <= 59):
        return None
    return f"{h_num:02d}:{m_num:02d}"


def normalize_done_value(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return "done" if value else "not done"
    if not isinstance(value, str):
        return None
    text = value.strip().lower().replace("_", " ").replace("-", " ")
    text = " ".join(text.split())
    if text in {"done", "fait", "yes", "true", "ok"}:
        return "done"
    if text in {"not done", "notdone", "non fait", "no", "false"}:
        return "not done"
    return None


def normalize_numeric(value: Any) -> float | int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, str):
        text = value.strip().replace(",", ".")
        if text == "":
            return None
        try:
            num = float(text)
        except ValueError:
            return None
        return int(num) if num.is_integer() else num
    return None


def normalize_exercises(value: Any) -> list[str] | None:
    if value is None:
        return None
    if isinstance(value, list):
        cleaned = [str(item).strip() for item in value if str(item).strip()]
        deduped: list[str] = []
        seen = set()
        for item in cleaned:
            if item not in seen:
                deduped.append(item)
                seen.add(item)
        return deduped
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return None


def build_patch(data: dict[str, Any]) -> dict[str, Any]:
    patch: dict[str, Any] = {}

    normalized_date = normalize_date(data.get("date"))
    if normalized_date and normalized_date != data.get("date"):
        patch["date"] = normalized_date

    normalized_sleep = normalize_sleep_time(data.get("sleepTime"))
    if normalized_sleep and normalized_sleep != data.get("sleepTime"):
        patch["sleepTime"] = normalized_sleep

    for field in ["skinCare", "shower", "supplement", "anki"]:
        normalized_done = normalize_done_value(data.get(field))
        if normalized_done and normalized_done != data.get(field):
            patch[field] = normalized_done

    for field in ["weight", "nutritionCalorieScore", "nutritionProteinScore", "nutritionQualityScore"]:
        normalized_num = normalize_numeric(data.get(field))
        if normalized_num is not None and normalized_num != data.get(field):
            patch[field] = normalized_num

    normalized_exercises = normalize_exercises(data.get("exercises"))
    if normalized_exercises is not None and normalized_exercises != data.get("exercises"):
        patch["exercises"] = normalized_exercises

    nutrition_values = [
        normalize_numeric(data.get("nutritionCalorieScore")),
        normalize_numeric(data.get("nutritionProteinScore")),
        normalize_numeric(data.get("nutritionQualityScore")),
    ]
    nutrition_present = sum(1 for value in nutrition_values if value is not None)
    if nutrition_present not in {0, 3}:
        patch["nutritionCalorieScore"] = None
        patch["nutritionProteinScore"] = None
        patch["nutritionQualityScore"] = None

    return patch


def main() -> None:
    parser = argparse.ArgumentParser(description="Normalize dailyLogs schema for Physiovapp")
    parser.add_argument("--apply", action="store_true", help="Write fixes to Firestore")
    args = parser.parse_args()

    db = init_firebase()
    stream = db.collection("dailyLogs").stream()

    scanned = 0
    changed = 0

    for item in stream:
        scanned += 1
        data = item.to_dict() or {}
        patch = build_patch(data)
        if not patch:
            continue

        changed += 1
        print(f"{item.id}: {patch}")
        if args.apply:
            item.reference.set(patch, merge=True)

    mode = "APPLY" if args.apply else "DRY-RUN"
    print("----------------------")
    print(f"Mode: {mode}")
    print(f"Docs scanned: {scanned}")
    print(f"Docs with proposed changes: {changed}")


if __name__ == "__main__":
    main()
