# API SRE – Haute Matsiatra

API NestJS + TypeORM + PostgreSQL pour la gestion des contribuables, obligations fiscales, paiements et notifications.

## 1. Prérequis

| Outil | Version recommandée | Remarques |
| --- | --- | --- |
| [Node.js](https://nodejs.org/) | >= 18.x (LTS) | Recommandé Node.js 20.x |
| [npm](https://www.npmjs.com/) | >= 9.x | Livré avec Node.js |
| [PostgreSQL](https://www.postgresql.org/) | >= 14.x | Requis |

## 2. Clonage et installation

## bash
git clone <url-du-depot>.git
cd paiement/serveur-api


### 2.1. Créer la base de données PostgreSQL

## sql
CREATE DATABASE sre_haute_matsiatra;
CREATE USER sre_user WITH ENCRYPTED PASSWORD 'votre_mot_de_passe';
GRANT ALL PRIVILEGES ON DATABASE sre_haute_matsiatra TO sre_user;


### 2.2. Installer et configurer

# bash
# Installer les dépendances
npm install  #local
npm ci  #production

# Créer le fichier d'environnement
cp .env.example .env


Configurer le fichier `.env` :

env
# Application
PORT=3000
NODE_ENV=development
APP_URL=http://localhost:5173

# Base de données
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=sre_user
DB_PASSWORD=votre_mot_de_passe
DB_NAME=sre_haute_matsiatra
DB_SYNCHRONIZE=false

# Authentification
JWT_SECRET=generer_un_secret_aleatoire_fort
JWT_EXPIRES_IN=1d

# CORS
CORS_ORIGINS=http://localhost:5173

# Rappels
FUSEAU_HORAIRE=Indian/Antananarivo
RAPPELS_ACTIFS=true
RAPPELS_JOURS_AVANT=7,3,1,0
RAPPELS_JOURS_RETARD=1,3,7
RAPPELS_TENTATIVES_COURRIEL_MAX=3

# Mail
MAIL_TRANSPORT=capture
MAIL_FROM=noreply@sre-hautematsiatra.mg
# SMTP_* si MAIL_TRANSPORT=smtp


> `DB_SYNCHRONIZE` doit rester à `false`. Utiliser uniquement les migrations.  
> `JWT_SECRET` doit être une chaîne aléatoire forte et unique.

### 2.3. Appliquer les migrations

#bash
npm run migration:run


## 3. Lancement

#bash
# Développement (avec rechargement automatique)
npm run start:dev

# Production
npm run build
npm run start:prod


L'API sera accessible sur :
- **API** : [http://localhost:3000](http://localhost:3000)
- **Swagger** : [http://localhost:3000/docs](http://localhost:3000/docs)
- **Santé** : [http://localhost:3000/sante](http://localhost:3000/sante)

## 4. Commandes utiles

| Commande | Description |
| --- | --- |
| `npm ci` | Installer les dépendances |
| `npm run start:dev` | Lancer en mode développement |
| `npm run start:prod` | Lancer en mode production |
| `npm run build` | Compiler TypeScript vers `dist/` |
| `npm run typecheck` | Vérification TypeScript |
| `npm test` | Lancer les tests Jest |
| `npm run migration:generate --name=NomMigration` | Générer une migration depuis les entités |
| `npm run migration:run` | Appliquer les migrations |
| `npm run migration:revert` | Annuler la dernière migration |

## 5. Structure du projet

text
serveur-api/
├── src/
│   ├── auth/          # Authentification, JWT, initialisation admin
│   ├── taxpayers/     # Contribuables
│   ├── tax-types/     # Types d'impôts
│   ├── obligations/   # Obligations fiscales
│   ├── payments/      # Déclarations de paiement
│   ├── documents/     # Accusés et reçus
│   ├── users/         # Utilisateurs
│   ├── notifications/ # Notifications et rappels d'échéances
│   ├── health/        # Health check
│   ├── common/        # Guards, décorateurs, filtres, validation
│   └── database/      # Entités, enums, migrations, data-source
└── test/              # Tests unitaires


## 6. Auteur

**Rindra & Harena**