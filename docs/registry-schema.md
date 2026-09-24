# Contrat YAML simplifié — version 1

Les nouveaux documents utilisent le contrat de `examples/hse-entreprises-extérieures.yml` :

- `version: 1` (nombre), `id`, `name`, `service`, `family`, `format` (un seul format), `description` ;
- `recognition.filenames` et `recognition.keywords` : listes de textes ;
- `transformation.type`, `transformation.split_by` et `transformation.sections` : type, découpage et liste des sections ;
- `context` : texte libre.

Le formulaire présente tous ces champs dans l’onglet Document et le résultat dans Aperçu YAML. Les sections sont des intitulés libres, sans référence à des champs canoniques. La version est fixée à 1. Les types et découpages sont des textes libres (par défaut `text` et `section`). L’aperçu, le fichier enregistré et le téléchargement partagent le même contrat, sans métadonnées ni blocs techniques ajoutés. Les contrôles de concurrence et les sauvegardes restent applicables.

Le catalogue utilise un adaptateur interne pour ces documents ; ses champs internes ne sont pas exportés dans leur YAML. Les fichiers historiques restent lisibles et modifiables avec leur formulaire détaillé, sans conversion automatique.

## Ancien contrat YAML 1.0

Toutes les propriétés sont définies dans `packages/shared/src/registry.ts`, le schéma de référence exécutable. Les objets sont stricts ; champs inconnus et versions inconnues sont rejetés pour prévenir la perte silencieuse d’informations. Les valeurs par défaut complètent les fichiers partiels valides à la lecture.

| Section            | Propriétés et rôle                                                                                                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema_version`   | Toujours `"1.0"`                                                                                                                                                                                                        |
| `registry`         | `id` stable (`[a-z][a-z0-9_]*`, sans underscores consécutifs), `name`, `description`, `department`, `domain`, `subdomain`, `family`, `version` sémantique, `status` draft/active/deprecated, `priority` 0–10000, `tags` |
| `business_context` | `document_type`, `description`, `purpose`, `audience` (liste), `context`, `scope`, `exclusions` (liste)                                                                                                                 |
| `formats`          | Liste non vide de xlsx, xls, csv, pdf, docx, pptx, txt, md, json, xml, png, jpg, other                                                                                                                                  |
| `custom_formats`   | Noms des formats supplémentaires, déclaratifs                                                                                                                                                                           |
| `mime_types`       | MIME dérivés des formats et MIME supplémentaires                                                                                                                                                                        |
| `recognition`      | `minimum_score`, `source_paths`, `filename`, `sheets`, `columns`, `keywords`, `structure`, `weights`                                                                                                                    |
| `fields`           | Liste de champs source / canoniques définie ci-dessous                                                                                                                                                                  |
| `transformation`   | `strategy`, `record_unit`, `identity_fields`, `preserve_fields`, `ignore_fields`, `normalize_fields`, `semantic_fields`, `common_context`                                                                               |
| `relations`        | `source`, `type` en majuscules, `target`, `target_kind` (`field` ou `entity`)                                                                                                                                           |
| `rag`              | `record_unit`, `repeat_context`, `search_fields`, `exact_fields`, `lexical_fields`, `semantic_fields`, `contextual_fields`, `generate_relations`                                                                        |
| `quality`          | `minimum_recognition_score`, `require_all_required_fields`, `allow_unknown_columns`, `human_review_below`                                                                                                               |
| `metadata`         | `created_at`, `updated_at` ISO 8601, `created_by`, `updated_by`, `cloned_from` ou null ; gérés par le serveur                                                                                                           |

`registry.keywords` est un tableau de chaînes de caractères (vide par défaut). Il se renseigne dans le champ « Mots-clés » de l’onglet « Identité » du formulaire et est enregistré dans le YAML sous `registry`. Chaque mot-clé doit être non vide ; les espaces en début et fin sont supprimés. Cette liste est indépendante de `recognition.keywords`, utilisée pour les signaux de reconnaissance.

```yaml
registry:
  # ... autres propriétés du registry
  keywords:
    - maintenance
    - interventions
```

## Reconnaissance

`filename` contient des listes `contains`, `starts_with`, `ends_with`, `regex`, `aliases`. `sheets.expected` est une liste de noms. `columns.required` et `columns.expected` sont des listes d’objets `{ name, aliases }`.

`structure` : `min_columns`, `max_columns` entiers cohérents ; `has_table`, `multiple_sheets`, `has_text`, `visual_dependency`, `paginated` booléens. Les valeurs false représentent une absence d’exigence positive ; cette application ne reconnaît pas de documents.

`weights` : `source_path`, `filename`, `required_columns`, `expected_columns`, `keywords`, `structure`. Chaque poids est entre 0 et 1, avec une somme strictement positive. Le contrat propose au futur moteur un score normalisé :

```text
score = somme(poids_i × correspondance_i) / somme(poids_i)
```

Chaque correspondance est comprise entre 0 et 1. Un signal non satisfait contribue 0. Les détails d’extraction et de correspondance restent du ressort du futur moteur, notamment le traitement des aliases et feuilles. Les regex ne sont jamais appliquées ici. Un poids nul désactive une contribution.

## Champs

Chaque champ contient `source`, `canonical`, `aliases`, `type`, `description`, `required`, `preserve_exact`, `normalization`, `allow_empty`, `business_role`, `enum_values`.

Types : string, integer, decimal, boolean, date, datetime, enum, reference, text. `enum` nécessite des valeurs autorisées. Le nom canonique doit être unique. Les normalisations autorisées sont `trim`, `lowercase`, `uppercase`, `normalize_whitespace`, `iso_date`, `decimal_comma`. Une valeur exacte ne peut pas demander simultanément une normalisation.

Toutes les listes de champs dans `transformation` et `rag` référencent des noms canoniques existants. La source d’une relation est un champ existant. Sa cible est soit un champ existant (`target_kind: field`), soit une entité nommée (`target_kind: entity`) : ceci rend explicite la différence entre une colonne et une entité comme `intervention`.

## Transformation et qualité

Stratégies : structured_table, text_document, technical_document, visual_document, generic_document. Unités : row, record, section, page, table, sheet, visual_asset, document. Ces paramètres n’exécutent rien.

Tous les scores sont dans [0,1]. Le seuil de revue humaine est supérieur ou égal au seuil minimal de qualité. En validation stricte, un profil actif exige deux catégories distinctes parmi chemin, nom, colonnes, mots-clés, feuilles et signaux structurels. Le mode standard valide toujours les types, références, doublons et bornes.

## API

L’API est sous `/api`, authentifiée sauf `POST /auth/login`. Authentification de session par cookie, CSRF fourni par `/auth/me` ou `/auth/login`. Les écritures nécessitent `X-CSRF-Token`. La connexion nécessite `X-DTR-Client: web`.

| Méthode et chemin                  | Usage                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------ |
| `GET /registries`                  | Recherche, filtres, tri, pagination, erreurs de fichiers et statistiques |
| `POST /registries`                 | Créer un contrat                                                         |
| `GET /registries/:id`              | Contrat, chemin relatif, YAML exact, ETag                                |
| `PUT /registries/:id`              | Modifier ; `If-Match` obligatoire                                        |
| `DELETE /registries/:id`           | Supprimer ; `If-Match` obligatoire                                       |
| `POST /registries/:id/clone`       | `{ id, name, department, version }`                                      |
| `GET /registries/:id/yaml`         | YAML texte exact                                                         |
| `GET /registries/:id/download`     | Téléchargement YAML                                                      |
| `POST /registries/validate`        | Valider un contrat sans persister                                        |
| `POST /registries/preview`         | `{ document, id? }` → `{ document, yaml, token }`, jeton valable 10 min  |
| `GET /api-registries`              | Recherche et erreurs des registres API                                   |
| `POST /api-registries`             | `{ document }` ; crée un YAML sous `registry/api/`                       |
| `GET /api-registries/:id`          | Contrat API, chemin relatif, YAML exact et ETag                          |
| `PUT /api-registries/:id`          | Modifier ; `If-Match` obligatoire                                        |
| `DELETE /api-registries/:id`       | Supprimer ; `If-Match` obligatoire                                       |
| `POST /api-registries/preview`     | `{ document }` → identifiant généré, contrat validé et YAML              |
| `GET /api-registries/:id/yaml`     | YAML texte exact                                                         |
| `GET /api-registries/:id/download` | Téléchargement YAML                                                      |
| `GET /config`                      | Configuration, ETag, état de stockage et sécurité non sensible           |
| `PUT /config`                      | Remplacer la configuration ; `If-Match` obligatoire                      |
| `POST /config/data-root/test`      | `{ path }`                                                               |
| `POST /config/data-root/change`    | `{ path, mode: "new" ou "existing" }`                                    |

Pour enregistrer un aperçu exact : envoyer le `document` retourné et son jeton dans `X-Preview-Token`. Les métadonnées sont alors celles déjà affichées. Sans jeton, l’API prépare les métadonnées lors de l’écriture. Une requête portant un jeton expiré ou un contenu différent reçoit 409. Les erreurs de validation renvoient 422 avec `{ code, message, issues: [{ path, message }] }`.

Un registre API respecte ce contrat strict :

```yaml
applications:
  LEUL-WMS:
    collections:
      - LEUL-WMS
    api:
      openapi: "http://leul-wms/api/openapi/v1.json"
    endpoint_acces:
      - id: leulia-get-colis
        description: >
          Recherche et consultation des colis.
        usages:
          - localisation d'un colis
          - état d'un colis
          - contenu d'un colis
          - poids des colis
          - dimensions des colis
          - colis d'une commande
          - colis d'une tournée
      - id: leulia-get-preparation
        description: >
          Recherche et consultation des préparations.
        usages:
          - palettes d'une commande
          - colis d'une préparation
          - position d'une préparation
          - état de préparation
          - contenu d'une préparation
      - id: leulia-get-etat-tournee
        description: >
          Consultation de l'état logistique des tournées.
        usages:
          - avancement d'une tournée
          - commandes préparables
          - tournées en attente
          - comparaison de tournées
    tools: []
```

Chaque tool référencé doit exister dans `options.tools` de la configuration.
Le bloc `api.openapi` contient l’URL HTTP ou HTTPS de la spécification OpenAPI. Chaque entrée de `endpoint_acces` contient un identifiant unique dans l’application, une description libre et une liste d’usages. Les anciens registres sans bloc `api`, sans `usages` ou contenant une simple liste d’endpoints restent lisibles ; ils sont convertis vers cette structure lors de leur prochaine modification.
À la création, l’identifiant est généré côté serveur depuis le nom de la première application : mise en minuscules et remplacement des espaces ou séparateurs par des underscores.
