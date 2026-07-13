# Cockpit SEO Global Icons

Dashboard interne pour visualiser les rankings SEO par verticale (CGP, Family Office, Banque privée, Club deal, Fiscalité, etc.) via l'API Google Search Console.

## Setup en 5 étapes

### 1. Créer un service account Google Cloud

1. https://console.cloud.google.com/ → sélectionner ou créer un projet
2. **APIs & Services > Bibliothèque** → chercher "Google Search Console API" → **Activer**
3. **IAM & Admin > Comptes de service** → **Créer un compte de service**
   - Nom : `tracker-globalicons`
   - Rôle : aucun (on donne les droits directement sur GSC)
4. Ouvrir le service account → **Clés** → **Ajouter une clé > Créer > JSON** → télécharger le fichier JSON

### 2. Autoriser le service account dans Google Search Console

1. https://search.google.com/search-console → sélectionner la propriété `globalicons.io`
2. **Paramètres > Utilisateurs et autorisations** → **Ajouter un utilisateur**
3. Coller l'email `tracker-globalicons@xxx.iam.gserviceaccount.com` (visible dans le JSON téléchargé, champ `client_email`)
4. Autorisation : **Restreinte** suffit

### 3. Config locale (test)

```bash
cd tracker
cp .env.example .env
```

Éditer `.env` :
- `GSC_SERVICE_ACCOUNT_JSON` : coller le contenu du JSON téléchargé (une seule ligne)
- `AUTH_PASS` : laisser vide en local pour bypasser l'auth

```bash
npm install
npm start
```

Ouvrir http://localhost:3000, cliquer **Re-scan**, vérifier que les mots-clés remontent groupés par verticale.

### 4. Deploy Railway

Depuis le dossier `tracker/` :

```bash
railway login
railway link          # sélectionner le projet Global Icons existant
railway service       # créer un NOUVEAU service dédié tracker
railway variables --set "GSC_SERVICE_ACCOUNT_JSON=$(cat /chemin/vers/service-account.json)"
railway variables --set "GSC_SITE_URL=sc-domain:globalicons.io"
railway variables --set "AUTH_USER=admin"
railway variables --set "AUTH_PASS=<mot-de-passe-solide>"
railway up --detach
```

### 5. Sous-domaine tracker.globalicons.io

Dans Railway :
- Service **tracker** > **Settings > Networking** > **Generate Domain** puis **Custom Domain** → `tracker.globalicons.io`
- Copier le CNAME fourni par Railway

Chez ton registrar DNS de `globalicons.io` :
- Ajouter un CNAME `tracker` → valeur fournie par Railway
- Attendre 5-15 min propagation

Ouvrir https://tracker.globalicons.io → basic auth (admin / ton mot de passe) → dashboard.

## Architecture

- `server.js` — Express + basic auth + routes API
- `gsc.js` — client Google Search Console API (fetch queries + positions)
- `verticalize.js` — classement des mots-clés dans les verticales via `verticals.json`
- `store.js` — persistance JSON simple (60 derniers scans max)
- `public/` — dashboard vanilla JS + design cohérent site principal
- `data/scans.json` — historique local (⚠️ non versionné, propre à chaque déploiement)

## Ajouter / modifier une verticale

Éditer `verticals.json` :

```json
{
  "id": "nouvelle-verticale",
  "label": "Nouvelle verticale",
  "description": "Description humaine",
  "matchers": ["motclé1", "motclé2 en début"]
}
```

Les matchers sont testés en `.includes()` (case + accents insensible). Ordre important : le premier matcher qui correspond gagne, ordre de définition des verticales dans le fichier.

## Notes

- Les données GSC sont **décalées de ~2 jours** — normal, c'est la limite de l'API.
- Le champ `position` est la **position moyenne** sur la période sélectionnée.
- Δ = différence entre le scan actuel et le scan précédent en base locale (pas la variation dans le temps GSC).
- Le storage est **local au conteneur Railway** : si tu redéploies, l'historique local repart de zéro (les 2 scans les plus récents deviennent inaccessibles jusqu'à re-scan). Pour persistance longue, brancher un volume Railway ou une base externe.
