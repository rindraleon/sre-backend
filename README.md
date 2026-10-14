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

- `authentification/` : première initialisation, connexion, session JWT et changement de mot de passe.
- `contribuables/` : dossiers Haute Matsiatra, import transactionnel et contrôle d’accès.
- `types-impot/` : configuration administrée, sans taux ou calendrier préchargé.
- `obligations/` : enregistrements saisis et validés par l’administration.
- `paiements/` : déclarations de références et décisions administratives, sans intégration de paiement.
- `documents/` : accusés de soumission et reçus internes accessibles selon le rôle et l’appartenance.
- `utilisateurs/` : administration des statuts et protection du dernier compte administrateur actif.

Les mots de passe sont hachés. Les routes authentifiées utilisent des guards de rôle et contrôles d’appartenance. Les listes, obligations, déclarations et documents sont limitées au périmètre de service.

## Déclarations de paiement

`POST /paiements` crée une déclaration en vérification à partir du montant de l’obligation liée et enregistre un événement ainsi qu’un accusé dans la même transaction. La référence ne confirme pas le transfert. Aucun établissement bancaire ou opérateur mobile n’est contacté; le portail n’exécute pas de mouvement de fonds.

Une décision administrative explicite peut créer un reçu interne, qui précise qu’il ne constitue pas une preuve bancaire ou une confirmation indépendante de réception de fonds. Les notifications externes, e-mails et réinitialisations par e-mail ne sont pas simulés.

## Vérifications

```bash
npm run typecheck
npm run build
```

Les migrations et parcours HTTP de bout en bout doivent être vérifiés sur une base de test dédiée avant déploiement.
