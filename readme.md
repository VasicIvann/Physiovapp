## Physiovapp

Architecture actuelle :
- web/ : frontend Next.js 16 (UI, auth Firebase client)
- web/src/app/stat : stats cote client (Firestore + Recharts)
- analytics/ : scripts Python utilitaires (audit/normalisation), non requis en production
- Firestore : source de donnees (saisie + statistiques)

Prerequis (une seule fois sur la machine)
- Node.js et npm installes
- Firebase CLI installe si tu deployes le frontend sur Firebase Hosting
- Python 3.12 uniquement si tu veux executer les scripts dans analytics/

## Run en local (step by step)

### 1) Configurer le frontend
Dans web/.env.local, renseigne les variables Firebase NEXT_PUBLIC_FIREBASE_*.

Important : la page Stat ne depend plus de NEXT_PUBLIC_STATS_API_BASE_URL.

### 2) Lancer le frontend
Depuis C:\VSCode\Physiovapp\web :

npm install
npm run dev

Ouvre ensuite :
- http://localhost:3000

## Deploiement (sans backend Python)
Le deploiement se fait maintenant en une seule partie : le frontend Firebase Hosting.

### A) Build du frontend

1. Depuis la racine du repo :
- cd web
- npm install
- npm run build

### B) Deploy Firebase Hosting

1. Depuis la racine du repo :
- cd ..
- firebase login
- firebase use physiovapp
- firebase deploy --only hosting

2. URL de production attendue :
- https://physiovapp.web.app

## Scripts Python (optionnel)
Le dossier analytics/ reste utile pour maintenance de donnees :

1. Audit de coherence :
- cd analytics
- python scripts/audit_daily_logs.py

2. Normalisation (dry-run) :
- python scripts/normalize_daily_logs.py

3. Normalisation avec ecriture :
- python scripts/normalize_daily_logs.py --apply

Ces scripts ne sont pas necessaires pour faire tourner le site deploye.

