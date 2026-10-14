import "dotenv/config";
import { DataSource } from "typeorm";
import { ContribuableEntity } from "./entities/contribuable.entity";
import { DocumentPaiementEntity } from "./entities/document-paiement.entity";
import { EvenementPaiementEntity } from "./entities/evenement-paiement.entity";
import { ObligationEntity } from "./entities/obligation.entity";
import { PaiementEntity } from "./entities/paiement.entity";
import { TypeImpotEntity } from "./entities/type-impot.entity";
import { UtilisateurEntity } from "./entities/utilisateur.entity";
import { InitialSchema1760270400000 } from "./migrations/InitialSchema1760270400000";
import { RetirerIndicateurDemonstration1760270401000 } from "./migrations/RetirerIndicateurDemonstration1760270401000";

const motDePasseBase = process.env.DB_PASSWORD?.trim();
if (!motDePasseBase)
  throw new Error(
    "DB_PASSWORD doit être renseigné avant d’exécuter les migrations.",
  );

export const sourceDeDonneesSre = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? "sre_app",
  password: motDePasseBase,
  database: process.env.DB_DATABASE ?? "sre_demo",
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
  synchronize: false,
  entities: [
    UtilisateurEntity,
    ContribuableEntity,
    TypeImpotEntity,
    ObligationEntity,
    PaiementEntity,
    EvenementPaiementEntity,
    DocumentPaiementEntity,
  ],
  migrations: [
    InitialSchema1760270400000,
    RetirerIndicateurDemonstration1760270401000,
  ],
  migrationsTableName: "migrations_sre",
});

export default sourceDeDonneesSre;
