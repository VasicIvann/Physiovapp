# Analytics API (Python MVP)

Service Python dedie aux statistiques de Physiovapp.

## Stack
- FastAPI
- Firebase Admin (Auth verification + Firestore read)
- NumPy
- Matplotlib (generation PNG)

## Endpoints
- `GET /health`
- `GET /v1/stats/metrics`
- `GET /v1/stats/chart-config`
- `GET /v1/stats/series?metric=...&timeRange=...`
- `GET /v1/stats/chart.png?metric=...&timeRange=...&chartStyle=auto|bar|line|area`

Les endpoints `series` et `chart.png` exigent un header:
- `Authorization: Bearer <firebase_id_token>`

## Variables d'environnement
- `CORS_ALLOW_ORIGINS` (ex: `http://localhost:3000`)
- `FIREBASE_SERVICE_ACCOUNT_JSON` (JSON brut) ou `FIREBASE_SERVICE_ACCOUNT_PATH` (chemin fichier)
- `STATS_CACHE_TTL_SECONDS` (par defaut `60`)
- `STATS_CACHE_MAX_ENTRIES` (par defaut `500`)

## Lancement local
```bash
cd analytics
python -m venv .venv
. .venv/Scripts/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8080
```

## Test rapide
```bash
curl http://localhost:8080/health
```

## Audit de coherence dailyLogs
Pour verifier la coherence de schema avec la page Info:

```bash
python scripts/audit_daily_logs.py
```

## Normalisation des donnees dailyLogs
Dry-run (recommande d'abord):

```bash
python scripts/normalize_daily_logs.py
```

Application des corrections:

```bash
python scripts/normalize_daily_logs.py --apply
```

La normalisation corrige principalement les dates, formats `sleepTime`, champs `done/not done`, types numeriques et les triplets nutrition incomplets.

## Deploiement Cloud Run (MVP)
```bash
gcloud config set project <PROJECT_ID>
gcloud builds submit --tag gcr.io/<PROJECT_ID>/physiovapp-analytics
gcloud run deploy physiovapp-analytics \
	--image gcr.io/<PROJECT_ID>/physiovapp-analytics \
	--platform managed \
	--region europe-west1 \
	--allow-unauthenticated \
	--set-env-vars CORS_ALLOW_ORIGINS=https://<YOUR_HOSTING_DOMAIN>,STATS_CACHE_TTL_SECONDS=60
```

Ensuite, configure `NEXT_PUBLIC_STATS_API_BASE_URL` dans `web/.env.local` (ou dans ton environnement de build) avec l'URL Cloud Run.
