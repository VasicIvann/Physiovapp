## Physiovapp

Stack mise en place :
- `web/` contient l'app Next.js 16 + Tailwind CSS pensee mobile-first.
- Firebase est pret a etre branche : dependance `firebase`, helper `src/lib/firebase.ts`, fichier `.env.example`.
- Deploiement : `firebase.json` + `.firebaserc` (modifie l'ID du projet).

### Demarrage rapide
```bash
cd web
npm install
cp .env.example .env.local   # remplir avec tes cles Firebase
npm run dev
```

### Deploiement Firebase Hosting
```bash
firebase login
firebase use <ton-project-id>
cd web && npm run build
cd .. && firebase deploy --only hosting
```

Consulte `web/README.md` pour les details (config Firebase, scripts, prochaines etapes).
