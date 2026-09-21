# Data Transformers Registry

Application interne de conception et d’administration de contrats documentaires YAML. React et Fastify, intégralement en TypeScript strict. **Aucune base de données** : les fichiers `.yml` sont la source de vérité. Aucun moteur de transformation, LLM, embedding ou service de graphe n’est exécuté.


## Démarrer en développement

Prérequis : **Node.js 24 LTS**, **pnpm 10.28.2**. Si pnpm est absent : `npm install --global pnpm@10.28.2`.

```bash
pnpm install --frozen-lockfile
```

Copiez `.env.example` en `.env` (`Copy-Item .env.example .env` sous PowerShell ou `cp .env.example .env` sous Linux).

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Renseignez votre mot de passe (16 caractères minimum) dans `DTR_ADMIN_PASSWORD` et la sortie de cette commande dans `DTR_SESSION_SECRET`. Le serveur calcule automatiquement un hash Argon2id au démarrage et utilise ce hash pour les connexions. Les espaces du mot de passe sont conservés.

Vous pouvez aussi fournir un hash pré-calculé avec `pnpm hash-password "votre-mot-de-passe"` dans `DTR_ADMIN_PASSWORD_HASH`. Ne renseignez qu’une seule des deux méthodes ; laissez l’autre vide. Dans `.env`, conservez les quotes simples autour des secrets.

```bash
pnpm dev
```

Interface : **http://localhost:5173**. API : **http://localhost:8080**. Connexion avec `DTR_ADMIN_USERNAME` et votre mot de passe. Vite relaie `/api` au backend ; les cookies restent sur la même origine. Le premier écran propose de terminer la configuration.

Les chemins par défaut sont ancrés au projet, indépendamment du répertoire de travail : `data/registry` pour les données, `data` comme parent autorisé, `runtime` pour le bootstrap. Les exemples ne sont jamais importés automatiquement.

## Variables d’environnement

| Variable                  | Rôle / défaut                                                                |
| ------------------------- | ---------------------------------------------------------------------------- |
| `NODE_ENV`                | `development`, `test` ou `production`                                        |
| `DTR_ADMIN_USERNAME`      | Administrateur, défaut `admin`                                               |
| `DTR_ADMIN_PASSWORD`      | Mot de passe direct, 16 à 1 024 caractères ; haché au démarrage              |
| `DTR_ADMIN_PASSWORD_HASH` | Alternative Argon2id ; renseigner exactement une des deux méthodes           |
| `DTR_SESSION_SECRET`      | **Obligatoire**, secret aléatoire de 32 caractères minimum                   |
| `DTR_SESSION_TTL_SECONDS` | Expiration absolue, défaut `28800` (8 h)                                     |
| `DTR_COOKIE_SECURE`       | `false` en HTTP local ; `true` en HTTPS de production                        |
| `DTR_PORT`                | Port interne, défaut `8080`                                                  |
| `DTR_HOST`                | Adresse d’écoute, défaut `0.0.0.0`                                           |
| `DTR_LOG_LEVEL`           | `silent`, `error`, `warn`, `info`, `debug`                                   |
| `DTR_DATA_ROOT`           | Dossier initial absolu ; Compose : `/data/registry`                          |
| `DTR_ALLOWED_DATA_PARENT` | Parent absolu autorisé pour tous les dossiers de données ; Compose : `/data` |
| `DTR_RUNTIME_DIR`         | Dossier du pointeur de bootstrap ; Compose : `/app/runtime`                  |
| `DTR_PUBLIC_DIR`          | Frontend compilé ; Compose : `/app/public`                                   |
| `DTR_HTTP_PORT`           | Port publié par Compose, défaut `8080`                                       |
| `DTR_BIND_ADDRESS`        | Adresse publiée par Compose, défaut `127.0.0.1`                              |

L’interface ne reçoit jamais les secrets. Modifier la durée de session ou les secrets nécessite un redémarrage. Les chemins Compose internes sont définis dans `environment` et priment sur `.env`.

## Tests et compilation

```bash
pnpm lint
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Après `docker compose build`, `pnpm test:docker` vérifie également le vrai fichier Compose avec un projet et des volumes temporaires : état healthy, connexion, fichier YAML physique, persistance après redémarrage, fallback SPA et UID non-root. Seules ces ressources de test sont supprimées à la fin. Le port local 8098 doit être libre. `pnpm format` et `pnpm format:check` utilisent Prettier. Une pipeline GitHub Actions reprend les contrôles de qualité.

`lint` exécute ESLint et la vérification TypeScript stricte. Vitest teste les contrats, le stockage réel dans des répertoires temporaires, l’API Fastify par injection HTTP et les champs React. Playwright démarre un serveur isolé sur le port 8087, utilise des identifiants exclusivement de test, et parcourt connexion, création, édition, aperçu, clonage, suppression et configuration. Il exige un frontend préalablement compilé. Aucun test n’accède aux données de production.

```bash
pnpm build
pnpm start
```

Le démarrage local compilé sert aussi le frontend à **http://localhost:8080**. `apps/backend/dist` contient le JavaScript serveur, `packages/shared/dist` le contrat compilé et `apps/frontend/dist` les ressources optimisées.

## Production Docker

**Aucun fichier `.env` n’est obligatoire pour Docker.** Tous les paramètres sont regroupés dans le bloc `environment` de `docker-compose.yml`. Deux méthodes sont possibles :

- Remplacer directement les valeurs dans ce bloc par vos paramètres.
- Conserver les expressions `${DTR_…:-…}` et fournir les variables depuis votre shell ou votre outil de déploiement. Un fichier `.env` reste accepté, mais facultatif.

Un mot de passe administrateur (ou un hash) et le secret de session restent obligatoires au démarrage. Pour utiliser directement votre mot de passe dans Compose, remplacez les valeurs correspondantes :

```yaml
environment:
  DTR_ADMIN_USERNAME: admin
  DTR_ADMIN_PASSWORD: 'REMPLACER_PAR_VOTRE_MOT_DE_PASSE_LONG'
  DTR_ADMIN_PASSWORD_HASH: ''
  DTR_SESSION_SECRET: 'REMPLACER_PAR_UN_SECRET_ALEATOIRE_D_AU_MOINS_32_CARACTERES'
  DTR_SESSION_TTL_SECONDS: '28800'
  DTR_COOKIE_SECURE: 'false'
```

Aucun calcul manuel de hash n’est nécessaire : le serveur le fait au démarrage, en mémoire. Si vous préférez un hash, laissez `DTR_ADMIN_PASSWORD` vide et renseignez `DTR_ADMIN_PASSWORD_HASH`.

**Si une valeur collée directement dans le YAML Compose contient `$`, doublez ce caractère en `$$`**, même entre quotes simples. Docker transmettra un seul `$` au conteneur. Les valeurs fournies par une variable du shell ou un `.env` conservent leurs `$` simples.

Le mot de passe direct reste lisible dans votre fichier Compose et dans la configuration du conteneur pour les personnes ayant accès à Docker. Le serveur ne l’ajoute jamais aux fichiers YAML applicatifs, aux réponses HTTP ni aux logs. Gardez la copie contenant vos secrets hors du dépôt Git.

Activez `DTR_COOKIE_SECURE=true` si l’accès utilisateur passe par HTTPS. Pour tester localement en HTTP, gardez `false`.

```bash
docker compose build
docker compose up -d
docker compose ps
docker compose logs -f
```

Interface : **http://localhost:8080**. `/health` vérifie les accès au stockage et la lecture du catalogue. Le conteneur doit devenir `healthy`. L’image finale exécute seulement `node dist/server.js` et sert les ressources statiques ; elle ne contient ni outils de développement ni sources TypeScript applicatives. Le build échoue si lint, tests ou compilation échouent. L’installation est figée par `pnpm-lock.yaml`.

```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

Les volumes nommés `registry-data` et `registry-runtime` survivent à ces commandes. **Ne pas ajouter `-v` à `docker compose down` si vous souhaitez conserver les données.** Sauvegardez les deux volumes avant une mise à jour. Les sauvegardes internes par Registry ne remplacent pas une sauvegarde externe du volume complet.

L’utilisateur runtime est `node` (**UID/GID 1000:1000**). Le système de fichiers du conteneur est en lecture seule, sauf les volumes et `/tmp`. Pour utiliser des bind mounts Linux, remplacez les volumes par vos dossiers et préparez leurs permissions :

```yaml
volumes:
  - /srv/dtr/data:/data
  - /srv/dtr/runtime:/app/runtime
```

Ne montez pas seulement `/data/registry` si vous souhaitez créer d’autres dossiers depuis l’interface : tous les dossiers choisis doivent rester sous `/data`, lui-même persistant. Compose publie par défaut sur la boucle locale. Un reverse proxy HTTPS peut relayer le port 8080. Pour un accès réseau direct, configurez explicitement `DTR_BIND_ADDRESS`.

## Données et changement de dossier

```text
data_root/
  config/
    application.yml
    audit.yml
    audit-<timestamp>.yml
    backups/<registry_id>/<date>-<hash>.yml
  registry/<service>/<identifiant-avec-tirets>.yml
runtime/data-root.yml
```

Résolution au démarrage : `runtime/data-root.yml`, puis `DTR_DATA_ROOT`, puis le défaut local. L’initialisation crée seulement les fichiers absents. Une configuration existante invalide bloque le démarrage avec une erreur, sans être remplacée.

Dans Configuration, testez puis confirmez le nouveau dossier :

- **Nouveau** : doit être inexistant ou vide, et sous le parent autorisé ; l’application le prépare.
- **Existant** : doit contenir un `config/application.yml` valide et un dossier `registry`.

Le pointeur n’est publié qu’après validation. Les anciennes données restent intactes. Il n’y a pas de migration automatique. Pour migrer, arrêtez le service, copiez explicitement les données vers le nouveau dossier autorisé, puis sélectionnez-le en mode existant. Ne déplacez pas le dossier actif pendant que l’application écrit.

### Dossier Windows avec Docker

Le Compose local monte `C:\Users\guillaume.minet\Documents\dtr-test` sur `/data` dans le conteneur. `DTR_DATA_ROOT=/data` désigne ce dossier parent ; l’application y crée `registry/` et `config/`. `DTR_HOST_DATA_ROOT` permet de saisir et d’afficher le chemin Windows dans l’interface ; cette variable ne crée pas elle-même de montage. Pour changer le dossier Windows, modifiez ensemble la source du montage et `DTR_HOST_DATA_ROOT`, puis recréez le conteneur.

Le Compose local utilise un volume de bootstrap distinct pour démarrer sur ce nouveau stockage. Les anciens volumes Docker ne sont pas supprimés et leurs données ne sont pas automatiquement copiées dans le dossier Windows. Les anciens stockages `appConfig/` + `registries/` restent lisibles sans renommage ; mélanger les deux organisations dans un même dossier est refusé.

## Contrats et usage

Le formulaire comporte Identité, Contexte métier, Reconnaissance, Structure, Transformation, Relations, RAG, Qualité et YAML. Les champs répétables ont des boutons d’ajout et de retrait. Un Registry ne peut être enregistré que si le schéma et ses références sont valides. Le mode strict exige au moins deux catégories de signaux pour un Registry actif.

Configuration et édition de Registry utilisent des onglets horizontaux sous le titre. Une seule carte est affichée à la fois : son contenu défile dans la hauteur disponible, tandis que les boutons Annuler et Enregistrer restent visibles en bas à droite. Changer d’onglet conserve les saisies ; Annuler rétablit les dernières valeurs enregistrées (ou les valeurs initiales pour un nouveau Registry). La sidebar peut être repliée en une colonne d’icônes et dépliée ; ce choix est mémorisé dans le navigateur. Sur mobile, le menu s’ouvre comme un panneau superposé.

L’aperçu définitif passe par le serveur : MIME et métadonnées sont attribués avant l’enregistrement, et un jeton d’aperçu garantit que le YAML affiché sera celui écrit sur disque. Un aperçu expire après dix minutes. Le formulaire incomplet dispose toujours d’un aperçu local indicatif.

Le téléchargement d’un Registry existant renvoie le fichier exact. Le clonage attribue un nouvel ID, réinitialise le statut à `draft` et renseigne `metadata.cloned_from`. L’identifiant d’un Registry enregistré est immuable ; clonez-le pour en changer. Un changement de service modifie le contrat, sans déplacer silencieusement son fichier existant.

Les modifications externes sont rechargées dans le catalogue au plus tard après environ huit secondes (cache serveur de 3 s, interrogation UI de 5 s). Les lectures individuelles et les écritures relisent toujours le disque. Les YAML invalides, versions inconnues et IDs dupliqués sont affichés séparément et restent intacts sur disque.

Voir [la documentation du contrat](docs/registry-schema.md), ainsi que l'[exemple](examples/).

## Sécurité et limites opérationnelles

Sessions opaques en mémoire, cookies signés `HttpOnly` et `SameSite=Strict`, expiration absolue, révocation à la déconnexion. CSRF synchronisé pour les écritures et en-tête spécifique pour la connexion ; aucun CORS permissif. Limitation des connexions et des requêtes, CSP et en-têtes Helmet. Les redémarrages déconnectent les sessions.

Les IDs sont des identifiants logiques ; aucun endpoint Registry n’accepte de chemin physique. Chemins confinés, jonctions/liens symboliques interdits, YAML limité à 2 Mo, alias YAML interdits et aucun code évalué. L’application ne compile les regex que pour contrôler leur syntaxe ; elle ne les applique pas à des documents.

Les écritures applicatives sont sérialisées, avec `If-Match` obligatoire pour modifier/supprimer et un second contrôle du hash avant publication. Les fichiers sont écrits dans un temporaire, synchronisés puis publiés atomiquement. Les sauvegardes sont créées avant modification/suppression selon la configuration. Rotation : 1 000 entrées d’audit par fichier, au plus dix archives.

**Déploiement à une seule instance**, sur disque local. Ne lancez pas plusieurs réplicas sur les mêmes volumes. L’absence de base de données et les sessions en mémoire excluent ici une mise à l’échelle horizontale immédiate. Les détails et limites concernant les éditeurs externes, l’audit et le stockage réseau sont décrits dans les décisions d’architecture.

L’i18n dispose d’un dictionnaire français/anglais extensible pour les commandes principales ; les aides métier détaillées restent actuellement en français.
