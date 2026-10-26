import "dotenv/config";
import { DataSource } from "typeorm";
import { TaxpayerEntity } from "./entities/taxpayer.entity";
import { PaymentDocumentEntity } from "./entities/payment-document.entity";
import { PaymentEventEntity } from "./entities/payment-event.entity";
import { LoginAttemptEntity } from "./entities/login-attempt.entity";
import { NotificationEntity } from "./entities/notification.entity";
import { ObligationEntity } from "./entities/obligation.entity";
import { PaymentEntity } from "./entities/payment.entity";
import { TaxTypeEntity } from "./entities/tax-type.entity";
import { UserEntity } from "./entities/user.entity";
import { ActivationRequestEntity } from "./entities/activation-request.entity";
import { ActivityLogEntity } from "./entities/activity-log.entity";
import { ContactMessageEntity } from "./entities/contact-message.entity";
import { InitialSchema1760270400000 } from "./migrations/InitialSchema1760270400000";
import { CreerNotifications1760270402000 } from "./migrations/CreerNotifications1760270402000";
import { RetirerIndicateurDemonstration1760270401000 } from "./migrations/RetirerIndicateurDemonstration1760270401000";
import { SecuriteAuthCampagnes1760270403000 } from "./migrations/SecuriteAuthCampagnes1760270403000";
import { PremiereConnexionEntreprises1760270404000 } from "./migrations/PremiereConnexionEntreprises1760270404000";
import { JournalActivite1760270405000 } from "./migrations/JournalActivite1760270405000";
import { MessagesContact1760270406000 } from "./migrations/MessagesContact1760270406000";
import { AmeliorationMessagerieNotifications1760270407000 } from "./migrations/AmeliorationMessagerieNotifications1760270407000";

const databasePassword = process.env.DB_PASSWORD?.trim();
if (!databasePassword)
  throw new Error(
    "DB_PASSWORD doit être renseigné avant d’exécuter les migrations.",
  );

const sreDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? "sre_app",
  password: databasePassword,
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
    LoginAttemptEntity,
    ActivationRequestEntity,
    ActivityLogEntity,
    ContactMessageEntity,
  ],
  migrations: [
    InitialSchema1760270400000,
    RetirerIndicateurDemonstration1760270401000,
    CreerNotifications1760270402000,
    SecuriteAuthCampagnes1760270403000,
    PremiereConnexionEntreprises1760270404000,
    JournalActivite1760270405000,
    MessagesContact1760270406000,
    AmeliorationMessagerieNotifications1760270407000,
  ],
  migrationsTableName: "migrations_sre",
});

export default sreDataSource;
