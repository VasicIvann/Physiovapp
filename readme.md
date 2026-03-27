## Physiovapp

Architecture actuelle :
- web/ : frontend Next.js 16 (UI, auth Firebase client)
- analytics/ : API Python FastAPI (stats, graphiques matplotlib, verification token Firebase Admin)
- Firestore : source de donnees des statistiques

Prerequis (une seule fois sur la machine)
- Node.js et npm installes
- Python 3.12 disponible (recommande pour analytics)
- Firebase CLI installe si je deployes le frontend sur Firebase Hosting
- gcloud CLI installe si je deployes l API sur Cloud Run

## Run en local (step by step)

### 1) Lancer l API analytics (Terminal 1)
Depuis la racine du repo C:\VSCode\Physiovapp, lance :

$env:FIREBASE_PROJECT_ID='physiovapp'
$env:FIREBASE_SERVICE_ACCOUNT_PATH='C:\VSCode\Physiovapp\secrets\physiovapp-admin.json'
Remove-Item Env:GOOGLE_APPLICATION_CREDENTIALS -ErrorAction SilentlyContinue
c:/Users/ivann/.PYENV/PYENV-WIN/versions/3.12.10/python.exe -m uvicorn app.main:app --app-dir c:/VSCode/Physiovapp/analytics --host 127.0.0.1 --port 8080

Verification rapide dans un autre terminal :
- curl.exe -i http://127.0.0.1:8080/health
Reponse attendue : HTTP 200 et {"status":"ok"}

### 2) Lancer le frontend (Terminal 2)
Depuis C:\VSCode\Physiovapp\web :

npm install
npm run dev

Ouvre ensuite :
- http://localhost:3000

## Deploiement (steps by steps)
Le deploiement se fait en 2 parties :
- Backend API Python sur Cloud Run
- Frontend Next.js (Firebase Hosting dans ce repo)

### A) Deployer l API analytics sur Cloud Run

1. Selectionner le projet :
- gcloud config set project physiovapp

2. Builder l image depuis analytics/ :
- gcloud builds submit c:/VSCode/Physiovapp/analytics --tag gcr.io/physiovapp/physiovapp-analytics

3. Deployer le service :
- gcloud run deploy physiovapp-analytics --image gcr.io/physiovapp/physiovapp-analytics --region europe-west1 --allow-unauthenticated --set-env-vars FIREBASE_PROJECT_ID=physiovapp,CORS_ALLOW_ORIGINS=https://<ton-domaine-frontend>

4. Recuperer l URL Cloud Run (exemple) :
- https://physiovapp-analytics-xxxxx-ew.a.run.app

Conseil production : stocke la cle Firebase Admin dans Secret Manager, puis injecte-la dans Cloud Run (au lieu d un fichier local).

### B) Deployer le frontend

1. Dans web/.env.local (ou variables CI), pointe l API de prod :
- NEXT_PUBLIC_STATS_API_BASE_URL=https://physiovapp-analytics-xxxxx-ew.a.run.app

2. Build du frontend :
- cd web
- npm install
- npm run build

3. Deploy Firebase Hosting :
- cd ..
- firebase login
- firebase use physiovapp
- firebase deploy --only hosting

