## Physiovapp - stack Front + Firebase

Application Next.js (App Router) optimisee mobile-first avec Tailwind CSS 4. La persistance est assuree par Firebase (Firestore) et l'hebergement prepare pour Firebase Hosting.

### Stack
- Frontend : Next.js 16, React 19, Tailwind CSS 4, DX rapide avec `next dev`
- Donnees : Firebase App + Firestore
- Auth/Serverless : pret a l'emploi via Firebase (non active par defaut)
- Hosting : Firebase Hosting (config minimale deja ajoutee a la racine)

---

## Demarrage local

```bash
cd web
npm install      # deja execute mais permet de regenerer node_modules
cp .env.example .env.local
npm run dev
```

Ensuite rends-toi sur [http://localhost:3000](http://localhost:3000).

---

## Configuration Firebase

1. Creer un projet depuis [console.firebase.google.com](https://console.firebase.google.com) et ajouter une application Web.
2. Activer Firestore (mode production recommande).
3. Copier les cles Web exposees par Firebase dans `web/.env.local`. Exemple :

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=""
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=""
NEXT_PUBLIC_FIREBASE_PROJECT_ID=""
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=""
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=""
NEXT_PUBLIC_FIREBASE_APP_ID=""
```

4. Installer le CLI Firebase (une fois) : `npm install -g firebase-tools` puis `firebase login`.
5. Mettre a jour `.firebaserc` a la racine du repo avec l'ID reel de ton projet.

La librairie `firebase` est initialisee dans `src/lib/firebase.ts`. Tant que les variables ne sont pas renseignees, l'interface affiche un bloc d'instructions dans `DailyEntryForm`.

---

## Scripts utiles

- `npm run dev` : serveur local (HMR)
- `npm run build` : build Next.js (utilise par Firebase Hosting)
- `npm run start` : previsualisation de la version compilee
- `npm run lint` : verifie les regles Next/TypeScript

---

## Deploiement Firebase Hosting

1. Depuis la racine du repo (la ou se trouve `firebase.json`), lance `firebase use <projectId>`.
2. Build de l'app : `cd web && npm run build`.
3. Retourne a la racine et execute `firebase deploy --only hosting`.

Le fichier `firebase.json` pointe vers le dossier `web`. Le CLI detecte automatiquement Next.js et genere les fonctions SSR necessaires. Pour les futurs deploiements : `npm run build && firebase deploy`.

---

## Prochaines etapes suggerees

- Ajouter Firebase Auth pour separer comptes perso / pro.
- Creer des Cloud Functions pour generer des rapports hebdo.
- Transformer le site en PWA pour un acces hors-ligne.
