# API SRE — Haute Matsiatra

API NestJS avec TypeORM et PostgreSQL. Le périmètre opérationnel des comptes contribuables et des dossiers est limité à Haute Matsiatra. Aucun seed n’est fourni ou exécuté; une base neuve ne contient pas de profil, de type d’impôt ni d’obligation d’exemple.

## Configuration et lancement

```bash
cp .env.example .env
# Renseigner les paramètres PostgreSQL, DB_PASSWORD et un JWT_SECRET aléatoire.
npm ci
npm run migration:run
npm run start:dev
```

`DB_SYNCHRONIZE=false` par défaut; privilégiez les migrations et n’activez pas `synchronize` en production. L’API écoute sur le port défini par `PORT` (par défaut `3000`). Swagger est disponible sur `/docs`, l’état de santé sur `/sante`.

Ne lancez les migrations que sur la base voulue et après revue, sauvegarde et vérification de l’historique. Ne supprimez pas de volume ou de données de production sans précaution. Le chantier ne nettoie pas les lignes d’une base préexistante : si elle contient d’anciens enregistrements de démonstration, recensez-les et décidez de leur traitement séparément, après sauvegarde. Le projet ne crée ni compte d’accès par défaut, ni mot de passe en clair, ni jeu d’exemple.

## Modules

- `auth/` : première initialisation, connexion, session JWT et changement de mot de passe.
- `taxpayers/` : dossiers Haute Matsiatra, import transactionnel et contrôle d'accès (route API `contribuables` inchangée).
- `tax-types/` : configuration administrée, sans taux ou calendrier préchargé.
- `obligations/` : enregistrements saisis et validés par l'administration.
- `payments/` : déclarations de références et décisions administratives, sans intégration de paiement (route API `paiements` inchangée).
- `documents/` : accusés de soumission et reçus internes accessibles selon le rôle et l'appartenance.
- `users/` : administration des statuts et protection du dernier compte administrateur actif.
- `notifications/` : centre de notifications, rappels d'échéances et courriels tracés.
- `common/` : décorateurs, guards, filtre d'erreurs et validation partagés ; `database/` : entités, enums, migrations.
- `health/` : état de santé (`/sante`).

Les mots de passe sont hachés. Les routes authentifiées utilisent des guards de rôle et contrôles d’appartenance. Les listes, obligations, déclarations et documents sont limitées au périmètre de service.

## Déclarations de paiement

`POST /paiements` crée une déclaration en vérification à partir du montant de l’obligation liée et enregistre un événement ainsi qu’un accusé dans la même transaction. La référence ne confirme pas le transfert. Aucun établissement bancaire ou opérateur mobile n’est contacté; le portail n’exécute pas de mouvement de fonds.

Une décision administrative explicite peut créer un reçu interne, qui précise qu’il ne constitue pas une preuve bancaire ou une confirmation indépendante de réception de fonds. Les notifications externes, e-mails et réinitialisations par e-mail ne sont pas simulés.

## Vérifications

```bash
npm run typecheck
npm run build
npm test        # tests unitaires Jest (contrat d’erreurs de validation)
```

## Format d’erreur API (contrat avec le frontend)

Toute erreur HTTP est renvoyée au format unique :

```json
{
  "statusCode": 400,
  "message": "Données invalides.",
  "errors": { "courriel": ["Adresse e-mail invalide."] },
  "timestamp": "2026-10-14T12:00:00.000Z"
}
```

`errors` n’est présent que pour les erreurs de validation (`ValidationPipe` + `exceptionFactory` dans `main.ts`, construction par `common/validation/validation-errors.ts`) ; les champs imbriqués utilisent le chemin complet (`profil.telephone`). Les messages des DTO sont en français. Aucune stack trace ni donnée sensible n’est exposée ; les erreurs 5xx sont journalisées côté serveur uniquement. Swagger (`/docs`) n’est actif que hors production.

Mot de passe (inscription et changement) : **10 caractères minimum, une majuscule, une minuscule et un chiffre** — règle identique côté frontend (schémas Zod).

Les migrations et parcours HTTP de bout en bout doivent être vérifiés sur une base de test dédiée avant déploiement.

## Notifications et rappels d'échéances

- **Source de vérité** : `obligations.echeance` (date) et `obligations.statut`. Aucune date fiscale n'est codée en dur.
- **Job** : quotidien à 06:00 (`Indian/Antananarivo`, `FUSEAU_HORAIRE`), désactivable par `RAPPELS_ACTIFS=false`, jamais déclenché par un GET. Relançable sans doublons : table `notifications` avec clé d'idempotence unique (utilisateur + obligation + type de rappel), migration `CreerNotifications1760270402000`.
- **Politique (paramètres initiaux, pas des règles officielles)** : `RAPPELS_JOURS_AVANT=7,3,1,0`, `RAPPELS_JOURS_RETARD=1,3,7`, `RAPPELS_TENTATIVES_COURRIEL_MAX=3`. Statuts rappelables : `A_PAYER`, `EN_RETARD`, `REJETE`, `CORRECTION_DEMANDEE`. Une obligation `PAYE` n'est plus rappelée ; une déclaration `EN_VERIFICATION`/`PAIEMENT_EN_COURS` n'est ni présentée comme payée ni relancée pendant la vérification.
- **In-app** : `GET /notifications`, `GET /notifications/non-lues`, `PATCH /notifications/:id/lue`, `PATCH /notifications/toutes-lues` — toujours filtrés par l'utilisateur du jeton (isolation testée).
- **Courriel** : `MAIL_TRANSPORT=smtp` (nodemailer, variables `SMTP_*`, `MAIL_FROM`) ou `capture` (tests/développement, aucun envoi réel). Sans transport configuré, l'état reste `NON_CONFIGURE`/`ECHEC` tracé sur la notification ; l'in-app est conservée et rien n'annonce un envoi fictif.
- **Test manuel** : régler une obligation test à J-7, `MAIL_TRANSPORT=capture`, appeler `RappelsEcheancesService.traiter(date)` via un test ou un script, vérifier la notification créée puis l'absence de doublon à la seconde exécution.

## Structure du code (anglais)

- `src/auth/`, `src/taxpayers/`, `src/tax-types/`, `src/payments/`, `src/users/`, `src/obligations/`, `src/documents/`, `src/notifications/`, `src/health/` : modules métier (controller/service/dto).
- `src/common/` : `decorators/`, `filters/` (contrat d'erreur), `guards/`, `interfaces/`, `validation/`.
- `src/database/` : `entities/`, `enums.ts`, `data-source.ts`, `migrations/` (**noms de migrations conservés** : ils sont enregistrés en base).
- Convention : identifiants exportés en anglais ; tables, colonnes, valeurs d'enums, routes et champs JSON inchangés (contrats et données préservés). Scripts de migration : `src/database/data-source.ts`.
