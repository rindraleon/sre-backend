import "dotenv/config";
import { DataSource } from "typeorm";
import { TaxpayerEntity } from "./entities/taxpayer.entity";
import { PaymentDocumentEntity } from "./entities/payment-document.entity";
import { PaymentEventEntity } from "./entities/payment-event.entity";
import { NotificationEntity } from "./entities/notification.entity";
import { ObligationEntity } from "./entities/obligation.entity";
import { PaymentEntity } from "./entities/payment.entity";
import { TaxTypeEntity } from "./entities/tax-type.entity";
import { UserEntity } from "./entities/user.entity";
import { InitialSchema1760270400000 } from "./migrations/InitialSchema1760270400000";
import { CreerNotifications1760270402000 } from "./migrations/CreerNotifications1760270402000";
import { RetirerIndicateurDemonstration1760270401000 } from "./migrations/RetirerIndicateurDemonstration1760270401000";

const motDePasseBase = process.env.DB_PASSWORD?.trim();
if (!motDePasseBase)
  throw new Error(
    "DB_PASSWORD doit être renseigné avant d’exécuter les migrations.",
  );

const sreDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? "sre_app",
  password: motDePasseBase,
  database: process.env.DB_DATABASE ?? "sre_demo",
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
  synchronize: false,
  entities: [
    UserEntity,
    TaxpayerEntity,
    TaxTypeEntity,
    ObligationEntity,
    PaymentEntity,
    PaymentEventEntity,
    PaymentDocumentEntity,
    NotificationEntity,
  ],
  migrations: [
    InitialSchema1760270400000,
    RetirerIndicateurDemonstration1760270401000,
    CreerNotifications1760270402000,
  ],
  migrationsTableName: "migrations_sre",
});

export default sreDataSource;
