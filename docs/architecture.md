# Décisions d’architecture

## Frontières et extension

Le domaine expose des ports (`RegistryRepository`, `ApiRegistryRepository`, `ConfigurationRepository`, `AuditLog`, `UnitOfWork`, `Clock`). Les services applicatifs coordonnent les règles, les métadonnées et les opérations. Les adaptateurs implémentent la persistance et l’authentification. `app.ts` effectue l’assemblage et la traduction centrale des erreurs. Le frontend n’importe aucun module backend. Les registres documentaires et API possèdent des dépôts et caches distincts ; le catalogue documentaire exclut explicitement `registry/api/`.

Pour ajouter une version de contrat, introduire un schéma autonome dans `packages/shared` et un dispatcher dans `validateRegistry`, avec migration explicite et tests de compatibilité. La version 1.0 est volontairement stricte : une propriété inconnue est refusée, jamais supprimée silencieusement. Les ajouts métier se font dans les YAML ; les nouveaux types de contrat dans les schémas.

Les champs de formulaire sont dérivés des schémas Zod et étiquetés via un dictionnaire. Cela évite la divergence entre validation et interface. L’adaptateur de formulaire est le seul module UI qui inspecte la structure interne de Zod 3. Une migration de Zod nécessite de tester ce composant. Les pages décident des sections ; elles ne décident pas des règles de validation.

`SectionTabs` fournit la navigation horizontale accessible au clavier ; `WorkspaceCard` sépare le panneau défilant des actions fixes. Ces composants de présentation sont partagés entre configuration et Registries. La taille de sidebar est une préférence locale de navigateur, indépendante des contrats métier. Le formulaire de configuration conserve sa version de référence jusqu’à la sauvegarde ou au rechargement pour préserver les contrôles de concurrence.

## Cohérence et concurrence

Une unité de travail sérialise les mutations dans le processus, y compris les changements de dossier. Chaque mise à jour et suppression vérifie le SHA-256 du contenu lu, avec `409` si la version a changé ; `428` si `If-Match` manque. Une seconde vérification se fait après la sauvegarde. Les lectures de formulaire n’actualisent pas silencieusement des données non enregistrées.

La publication utilise un temporaire dans le même dossier, `fsync`, puis `rename`. Une création emploie un lien physique atomique sans écrasement. Les répertoires sont synchronisés sur Linux. Les garanties visent un disque local POSIX/NTFS, pas NFS/SMB. Les contrôles de liens symboliques ne constituent pas une défense contre un administrateur système malveillant capable de remplacer les répertoires entre deux appels système.

Un éditeur externe ne participe pas au mutex applicatif. Le contrôle d’ETag détecte les modifications observables avant publication ; aucun compare-and-swap universel de fichier n’existe ici. Un éditeur externe qui écrit exactement entre le dernier contrôle et le renommage peut encore entrer en course. Pour les modifications serveur : arrêter les écritures applicatives ou effectuer une maintenance contrôlée. Ne pas prétendre à une transaction distribuée ni à plusieurs réplicas.

Le contrat et l’audit sont deux fichiers atomiques distincts. Une panne entre leurs publications peut laisser une mutation valide sans entrée d’audit. Une erreur d’audit est signalée au client et dans les logs ; il faut relire le Registry avant de réessayer. Pour un audit juridiquement transactionnel, il faudrait un journal de transactions récupérable ; ce n’est pas une garantie de cette version.

## Index en mémoire

Le catalogue est reconstruit depuis le disque au démarrage / à la première demande. Un cache de trois secondes évite les scans à chaque consultation ; les mutations invalident ce cache, et toute lecture individuelle le reconstruit. Les entrées invalides sont isolées. Les identifiants dupliqués rendent toutes leurs occurrences indisponibles à l’édition.

Ce compromis vise les catalogues internes de quelques centaines à quelques milliers de profils. L’index est remplaçable par un watcher incrémental sous le même port. Un système massif nécessite aussi un protocole de coordination de fichiers, une mémoire bornée par budget et des mesures de charge ; ajouter simplement des réplicas serait incorrect.

## Sessions et racines

Les sessions sont en mémoire, bornées à 100, identifiées par 256 bits aléatoires et expirent sans glissement. Le cookie est signé par le secret d’environnement. La déconnexion supprime réellement la session. L’opérateur fournit soit `DTR_ADMIN_PASSWORD` (16 à 1 024 caractères, haché en Argon2id au démarrage), soit `DTR_ADMIN_PASSWORD_HASH`. Les deux options simultanées sont rejetées. Le service d’authentification utilise uniquement le hash. Le mot de passe direct reste présent dans la configuration Docker de l’opérateur ; aucun secret n’est persisté dans les YAML applicatifs ni renvoyé au frontend.

Le parent autorisé des données est une capacité fournie par l’opérateur, indépendante du pointeur de bootstrap. L’interface ne peut sélectionner qu’un dossier sous ce parent, non imbriqué avec le dossier actif ou le runtime, sans symlink. Une racine existante doit être un référentiel valide. Le choix ne déplace jamais les anciennes données.

## Production

Fastify sert API et SPA depuis une seule origine. Les routes React sans extension reviennent à `index.html`, mais les API inconnues restent des 404 JSON. Le conteneur non-root ne dispose que de dépendances de production et de JavaScript compilé. Les données et le pointeur sont dans deux volumes distincts. Les signaux arrêtent le serveur et attendent les écritures en cours.
