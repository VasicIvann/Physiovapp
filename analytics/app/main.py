from __future__ import annotations

import io
import json
import os
import time
from datetime import date, datetime, timedelta
from typing import Any, Literal

import firebase_admin
import matplotlib
import numpy as np
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from firebase_admin import auth as admin_auth
from firebase_admin import credentials, firestore

matplotlib.use("Agg")
import matplotlib.pyplot as plt


TimeRangeKey = Literal["7d", "30d", "365d"]
ChartStyleKey = Literal["auto", "bar", "line", "area"]
MetricKey = Literal[
    "weight",
    "activities",
    "sleepTime",
    "skinCare",
    "shower",
    "supplement",
    "nutritionCalorieScore",
    "nutritionProteinScore",
    "nutritionQualityScore",
    "foodHealthScore",
]

TIME_RANGE_DAYS: dict[TimeRangeKey, int] = {
    "7d": 7,
    "30d": 30,
    "365d": 365,
}

METRIC_LABELS: dict[MetricKey, str] = {
    "weight": "Poids",
    "activities": "Nb activites",
    "sleepTime": "Sommeil (h)",
    "skinCare": "Skin care",
    "shower": "Douche",
    "supplement": "Supplements",
    "nutritionCalorieScore": "Nutrition calories",
    "nutritionProteinScore": "Nutrition proteines",
    "nutritionQualityScore": "Nutrition qualite",
    "foodHealthScore": "Food health score",
}

BINARY_METRICS: set[MetricKey] = {"skinCare", "shower", "supplement"}

CHART_DEFAULTS: dict[MetricKey, dict[str, Any]] = {
    "weight": {"label": "Poids", "defaultStyle": "line", "color": "#2563EB", "recommendedSmoothing": False},
    "activities": {"label": "Nb activites", "defaultStyle": "bar", "color": "#0EA5E9", "recommendedSmoothing": False},
    "sleepTime": {"label": "Sommeil (h)", "defaultStyle": "line", "color": "#7C3AED", "recommendedSmoothing": True},
    "skinCare": {"label": "Skin care", "defaultStyle": "bar", "color": "#059669", "recommendedSmoothing": False},
    "shower": {"label": "Douche", "defaultStyle": "bar", "color": "#06B6D4", "recommendedSmoothing": False},
    "supplement": {"label": "Supplements", "defaultStyle": "bar", "color": "#22C55E", "recommendedSmoothing": False},
    "nutritionCalorieScore": {
        "label": "Nutrition calories",
        "defaultStyle": "line",
        "color": "#F59E0B",
        "recommendedSmoothing": True,
    },
    "nutritionProteinScore": {
        "label": "Nutrition proteines",
        "defaultStyle": "line",
        "color": "#F97316",
        "recommendedSmoothing": True,
    },
    "nutritionQualityScore": {
        "label": "Nutrition qualite",
        "defaultStyle": "line",
        "color": "#EF4444",
        "recommendedSmoothing": True,
    },
    "foodHealthScore": {
        "label": "Food health score",
        "defaultStyle": "area",
        "color": "#4F46E5",
        "recommendedSmoothing": True,
    },
}


app = FastAPI(title="Physiovapp Analytics API", version="0.1.0")

cors_origins = os.getenv("CORS_ALLOW_ORIGINS", "*")
_allow_origins = [origin.strip() for origin in cors_origins.split(",") if origin.strip()]
_allow_credentials = "*" not in _allow_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    allow_credentials=_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


_firestore_client: firestore.Client | None = None
_series_cache: dict[tuple[str, MetricKey, TimeRangeKey], tuple[float, dict[str, Any]]] = {}
_cache_ttl_seconds = int(os.getenv("STATS_CACHE_TTL_SECONDS", "60"))
_cache_max_entries = int(os.getenv("STATS_CACHE_MAX_ENTRIES", "500"))


def _init_firebase() -> None:
    if firebase_admin._apps:
        return

    service_account_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
    service_account_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH", "").strip()
    firebase_project_id = os.getenv("FIREBASE_PROJECT_ID", "").strip()

    options = {"projectId": firebase_project_id} if firebase_project_id else None

    if service_account_json:
        cert_data = json.loads(service_account_json)
        cred = credentials.Certificate(cert_data)
        if options:
            firebase_admin.initialize_app(cred, options)
        else:
            firebase_admin.initialize_app(cred)
        return

    if service_account_path:
        cred = credentials.Certificate(service_account_path)
        if options:
            firebase_admin.initialize_app(cred, options)
        else:
            firebase_admin.initialize_app(cred)
        return

    if options:
        firebase_admin.initialize_app(options=options)
    else:
        firebase_admin.initialize_app()


@app.on_event("startup")
def _startup_init() -> None:
    # Ensure the default Firebase app exists before any authenticated request.
    _init_firebase()


def get_firestore() -> firestore.Client:
    global _firestore_client
    if _firestore_client is None:
        _init_firebase()
        _firestore_client = firestore.client()
    return _firestore_client


def _extract_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Invalid Authorization header")
    return token


def get_current_user_uid(authorization: str | None = Header(default=None)) -> str:
    _init_firebase()
    token = _extract_token(authorization)
    try:
        decoded = admin_auth.verify_id_token(token)
    except Exception as exc:  # pragma: no cover
        error_detail = f"Invalid or expired token: {type(exc).__name__}: {exc}"
        print(f"[auth] verify_id_token failed -> {error_detail}")
        raise HTTPException(status_code=401, detail=error_detail) from exc

    uid = decoded.get("uid")
    if not uid:
        raise HTTPException(status_code=401, detail="Missing uid in token")
    return uid


def _date_range_keys(time_range: TimeRangeKey) -> list[str]:
    days = TIME_RANGE_DAYS[time_range]
    today = date.today()
    return [(today - timedelta(days=i)).isoformat() for i in range(days - 1, -1, -1)]


def _parse_sleep_hours(value: Any) -> float | None:
    if not isinstance(value, str) or ":" not in value:
        return None
    hh, mm = value.split(":", 1)
    try:
        h_num = int(hh)
        m_num = int(mm)
    except ValueError:
        return None
    if h_num < 0 or m_num < 0 or m_num > 59:
        return None
    return h_num + (m_num / 60)


def _food_health_score(doc: dict[str, Any]) -> float | None:
    fields = [
        doc.get("nutritionCalorieScore"),
        doc.get("nutritionProteinScore"),
        doc.get("nutritionQualityScore"),
    ]
    if not all(isinstance(v, (int, float)) for v in fields):
        return None
    return float(sum(fields)) / 3.0


def _metric_value(metric: MetricKey, doc: dict[str, Any]) -> float | None:
    if metric == "weight":
        value = doc.get("weight")
        return float(value) if isinstance(value, (int, float)) else None

    if metric == "activities":
        ex = doc.get("exercises")
        if not isinstance(ex, list):
            return None
        return float(len(ex))

    if metric == "sleepTime":
        return _parse_sleep_hours(doc.get("sleepTime"))

    if metric in {"skinCare", "shower", "supplement"}:
        value = doc.get(metric)
        if value not in {"done", "not done"}:
            return None
        return 1.0 if value == "done" else 0.0

    if metric in {"nutritionCalorieScore", "nutritionProteinScore", "nutritionQualityScore"}:
        value = doc.get(metric)
        return float(value) if isinstance(value, (int, float)) else None

    if metric == "foodHealthScore":
        return _food_health_score(doc)

    return None


def _load_daily_logs(db: firestore.Client, uid: str) -> dict[str, dict[str, Any]]:
    docs_by_date: dict[str, dict[str, Any]] = {}
    stream = db.collection("dailyLogs").where("userId", "==", uid).stream()

    for item in stream:
        raw = item.to_dict() or {}
        date_key = raw.get("date")
        if not isinstance(date_key, str):
            continue
        docs_by_date[date_key] = raw

    return docs_by_date


def _build_series(
    docs_by_date: dict[str, dict[str, Any]], metric: MetricKey, time_range: TimeRangeKey
) -> dict[str, Any]:
    labels = _date_range_keys(time_range)
    values: list[float | None] = []

    for key in labels:
        values.append(_metric_value(metric, docs_by_date.get(key, {})))

    numeric_values = [v for v in values if isinstance(v, (float, int))]
    has_data = len(numeric_values) > 0

    stats = None
    if has_data:
        array = np.array(numeric_values, dtype=float)
        stats = {
            "count": int(array.size),
            "min": float(array.min()),
            "max": float(array.max()),
            "avg": float(array.mean()),
        }

    return {
        "metric": metric,
        "metricLabel": METRIC_LABELS[metric],
        "timeRange": time_range,
        "labels": labels,
        "values": values,
        "hasData": has_data,
        "stats": stats,
        "generatedAt": datetime.utcnow().isoformat() + "Z",
    }


def _build_series_cached(db: firestore.Client, uid: str, metric: MetricKey, time_range: TimeRangeKey) -> dict[str, Any]:
    key = (uid, metric, time_range)
    now = time.time()
    cached = _series_cache.get(key)

    if cached:
        expires_at, payload = cached
        if now < expires_at:
            return payload

    docs_by_date = _load_daily_logs(db, uid)
    payload = _build_series(docs_by_date, metric, time_range)

    if len(_series_cache) >= _cache_max_entries:
        # Lightweight eviction of expired keys first, then fallback to oldest key.
        expired_keys = [cache_key for cache_key, (expires_at, _) in _series_cache.items() if now >= expires_at]
        for expired_key in expired_keys:
            _series_cache.pop(expired_key, None)

        if len(_series_cache) >= _cache_max_entries:
            oldest_key = min(_series_cache.items(), key=lambda item: item[1][0])[0]
            _series_cache.pop(oldest_key, None)

    _series_cache[key] = (now + _cache_ttl_seconds, payload)
    return payload


def _resolve_chart_style(metric: MetricKey, requested_style: ChartStyleKey) -> ChartStyleKey:
    if requested_style != "auto":
        return requested_style
    default_style = CHART_DEFAULTS[metric]["defaultStyle"]
    return default_style if default_style in {"bar", "line", "area"} else "bar"


def _format_sleep(hours_value: float) -> str:
    total_minutes = max(0, round(hours_value * 60))
    hours = total_minutes // 60
    minutes = total_minutes % 60
    return f"{hours}:{minutes:02d}"


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/v1/stats/metrics")
def metrics() -> dict[str, Any]:
    return {
        "metrics": [
            {
                "key": key,
                "label": label,
                "binary": key in BINARY_METRICS,
                "chart": CHART_DEFAULTS[key],
            }
            for key, label in METRIC_LABELS.items()
        ],
        "timeRanges": [{"key": key, "days": value} for key, value in TIME_RANGE_DAYS.items()],
    }


@app.get("/v1/stats/chart-config")
def chart_config() -> dict[str, Any]:
    return {
        "styles": ["auto", "bar", "line", "area"],
        "defaultsByMetric": CHART_DEFAULTS,
    }


@app.get("/v1/stats/series")
def stats_series(
    metric: MetricKey = Query(...),
    timeRange: TimeRangeKey = Query("7d"),
    uid: str = Depends(get_current_user_uid),
) -> dict[str, Any]:
    db = get_firestore()
    payload = _build_series_cached(db, uid, metric, timeRange)
    payload["chart"] = CHART_DEFAULTS[metric]
    return payload


@app.get("/v1/stats/chart.png")
def stats_chart_png(
    metric: MetricKey = Query(...),
    timeRange: TimeRangeKey = Query("7d"),
    chartStyle: ChartStyleKey = Query("auto"),
    uid: str = Depends(get_current_user_uid),
) -> StreamingResponse:
    db = get_firestore()
    payload = _build_series_cached(db, uid, metric, timeRange)
    resolved_style = _resolve_chart_style(metric, chartStyle)

    labels: list[str] = payload["labels"]
    values: list[float | None] = payload["values"]
    has_data: bool = payload["hasData"]

    fig, ax = plt.subplots(figsize=(10, 4), dpi=160)
    fig.patch.set_facecolor("#FFFFFF")
    ax.set_facecolor("#F8FAFC")

    x = np.arange(len(labels))
    y = np.array([v if isinstance(v, (int, float)) else np.nan for v in values], dtype=float)

    if has_data:
        color = str(CHART_DEFAULTS[metric]["color"])

        if resolved_style == "line":
            ax.plot(x, y, color=color, linewidth=2.25, marker="o", markersize=3.5)
        elif resolved_style == "area":
            ax.plot(x, y, color=color, linewidth=2)
            ax.fill_between(x, y, alpha=0.2, color=color)
        else:
            ax.bar(x, y, color=color, width=0.82)

        finite_vals = y[np.isfinite(y)]

        if metric in BINARY_METRICS:
            ax.set_ylim(0, 1.0)
            ax.set_yticks([0, 0.25, 0.5, 0.75, 1.0])
        else:
            min_v = float(np.min(finite_vals))
            max_v = float(np.max(finite_vals))
            padding = max((max_v - min_v) * 0.1, 1.0)
            ax.set_ylim(min_v - padding, max_v + padding)

        if metric == "sleepTime":
            ticks = ax.get_yticks().tolist()
            ax.set_yticklabels([_format_sleep(float(tick)) for tick in ticks])
    else:
        ax.text(0.5, 0.5, "Aucune donnee sur la periode", ha="center", va="center", transform=ax.transAxes)
        ax.set_xticks([])

    ax.set_title(
        f"{METRIC_LABELS[metric]} - {timeRange} ({resolved_style})",
        fontsize=11,
        fontweight="bold",
        color="#0F172A",
    )

    if len(labels) <= 14:
        tick_positions = x
    elif len(labels) <= 60:
        tick_positions = x[::5]
    else:
        tick_positions = x[::30]

    def _format_label(iso_date: str) -> str:
        dt = datetime.strptime(iso_date, "%Y-%m-%d")
        return dt.strftime("%d/%m")

    if len(tick_positions) > 0:
        ax.set_xticks(tick_positions)
        ax.set_xticklabels([_format_label(labels[idx]) for idx in tick_positions], fontsize=8)

    ax.grid(axis="y", linestyle="--", linewidth=0.7, color="#CBD5E1", alpha=0.6)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_color("#CBD5E1")
    ax.spines["bottom"].set_color("#CBD5E1")

    plt.tight_layout()

    buffer = io.BytesIO()
    fig.savefig(buffer, format="png")
    plt.close(fig)
    buffer.seek(0)

    return StreamingResponse(buffer, media_type="image/png")
