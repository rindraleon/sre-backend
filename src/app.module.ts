import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigurationInitialeInterceptor } from "./common/interceptors/configuration-initiale.interceptor";
import { JournalActiviteInterceptor } from "./common/interceptors/journal-activite.interceptor";
import { ActivityLogEntity } from "./database/entities/activity-log.entity";
import { AuthModule } from "./auth/auth.module";
import { TaxpayersModule } from "./taxpayers/taxpayers.module";
import { DocumentsModule } from "./documents/documents.module";
import { HealthController } from "./health/health.controller";
import { NotificationsModule } from "./notifications/notifications.module";
import { ObligationsModule } from "./obligations/obligations.module";
import { PaymentsModule } from "./payments/payments.module";
import { TaxTypesModule } from "./tax-types/tax-types.module";
import { UsersModule } from "./users/users.module";
import { JournalModule } from "./journal/journal.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: [".env"] }),
    ThrottlerModule.forRoot([{ name: "global", ttl: 60_000, limit: 120 }]),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configuration: ConfigService) => {
        const motDePasseBase = configuration.getOrThrow<string>("DB_PASSWORD");
        if (!motDePasseBase.trim())
          throw new Error(
            "DB_PASSWORD doit être renseigné dans la configuration.",
          );
        return {
          type: "postgres" as const,
          host: configuration.get<string>("DB_HOST", "localhost"),
          port: Number(configuration.get<string>("DB_PORT", "5432")),
          username: configuration.get<string>("DB_USERNAME", "sre_app"),
          password: motDePasseBase,
          database: configuration.get<string>("DB_DATABASE", "sre_demo"),
          ssl:
            configuration.get<string>("DB_SSL") === "true"
              ? { rejectUnauthorized: false }
              : false,
          autoLoadEntities: true,
          synchronize:
            configuration.get<string>("DB_SYNCHRONIZE") === "true" &&
            configuration.get<string>("NODE_ENV", "development") !==
              "production",
          migrationsRun: false,
          migrationsTableName: "migrations_sre",
          retryAttempts: 5,
          retryDelay: 3000,
        };
      },
    }),
    AuthModule,
    TaxpayersModule,
    TaxTypesModule,
    ObligationsModule,
    NotificationsModule,
    PaymentsModule,
    DocumentsModule,
    UsersModule,
    JournalModule,
    TypeOrmModule.forFeature([ActivityLogEntity]),
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Blocage serveur des fonctionnalités métier pendant la configuration initiale.
    { provide: APP_INTERCEPTOR, useClass: ConfigurationInitialeInterceptor },
    // Audit : journalise chaque action métier d'un compte authentifié.
    { provide: APP_INTERCEPTOR, useClass: JournalActiviteInterceptor },
  ],
})
export class AppModule {}
