# Vérification du livrable — 9 septembre 2026

Contrôles réellement exécutés sur Windows avec Node 24 et pnpm 10.28.2 (pnpm lancé via `npm exec`), puis dans l’image Linux de production :

| Contrôle                         | Résultat                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | Réussi                                                                          |
| `pnpm lint`                      | ESLint et TypeScript strict : réussis                                           |
| `pnpm test`                      | 23 tests réussis, 4 fichiers                                                    |
| `pnpm build`                     | Shared, backend JavaScript, frontend Vite : réussis                             |
| `pnpm test:e2e`                  | Parcours administrateur Playwright réussi                                       |
| `pnpm format:check`              | Tous les fichiers conformes                                                     |
| `docker compose build`           | Image multi-stage construite ; lint, tests et compilation exécutés dans Linux   |
| `pnpm test:docker`               | Démarrage et contrôle du vrai Compose avec projet/volumes temporaires : réussis |

Le parcours navigateur vérifie : connexion, création, édition, aperçu YAML, clonage, suppression avec confirmation, modification de configuration, fin de l’assistant initial et déconnexion. Des captures desktop (1440 px) et mobile (390 px) ont été inspectées ; le test mobile vérifie l’absence de débordement horizontal global.

Le test Docker utilise le fichier Compose de production avec une surcharge limitée aux identifiants aléatoires de test, au nom de l’image et au port local 8098. Les restrictions du service et les volumes sont donc ceux du déploiement réel. Il vérifie :

- `/health` et état Docker `healthy` ;
- authentification réelle par cookie ;
- création d’un `.yml` dans le volume et lecture physique dans le conteneur ;
- présence du Registry après redémarrage ;
- utilisateur runtime UID 1000 ;
- fallback SPA sur une route Registry.

Les conteneurs et volumes du projet de test ont été supprimés après vérification. Aucun déploiement avec des identifiants de production n’a été laissé actif. `.env` est une copie sans secrets de `.env.example` : renseigner le mot de passe direct (ou un hash Argon2id) et le secret de session dans Compose ou dans les variables de déploiement avant le démarrage personnel. Le test Docker utilise désormais un mot de passe direct contenant un caractère dollar.

Limites explicites : déploiement à une instance ; pas de benchmark de charge ; pas de garantie de transaction multi-fichier pour l’audit ; aides métier détaillées encore en français. Voir `architecture.md` pour les garanties filesystem et les courses possibles avec un éditeur externe.
