import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { TypeOrmModule } from "@nestjs/typeorm";
import { InitialSetupInterceptor } from "./common/interceptors/initial-setup.interceptor";
import { ActivityLogInterceptor } from "./common/interceptors/activity-log.interceptor";
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
import { ActivityLogModule } from "./activity-log/activity-log.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: [".env"] }),
    ThrottlerModule.forRoot([{ name: "global", ttl: 60_000, limit: 120 }]),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configuration: ConfigService) => {
        const nodeEnvironment = configuration.get<string>(
          "NODE_ENV",
          "development",
        );
        const databaseUrl = configuration.get<string>("DATABASE_URL")?.trim();
        const sslEnabled =
          configuration.get<string>("DB_SSL") === "true" ||
          (Boolean(databaseUrl) &&
            configuration.get<string>("DB_SSL") !== "false");
        const sharedOptions = {
          type: "postgres" as const,
          ssl: sslEnabled ? { rejectUnauthorized: false } : false,
          autoLoadEntities: true,
          synchronize:
            configuration.get<string>("DB_SYNCHRONIZE") === "true" &&
            nodeEnvironment !== "production",
          migrations: [`${__dirname}/database/migrations/*{.ts,.js}`],
          migrationsRun:
            configuration.get<string>(
              "DB_MIGRATIONS_RUN",
              nodeEnvironment === "production" ? "true" : "false",
            ) === "true",
          migrationsTableName: "migrations_sre",
          retryAttempts: 5,
          retryDelay: 3000,
        };

        if (databaseUrl) return { ...sharedOptions, url: databaseUrl };

        const databasePassword = configuration
          .get<string>("DB_PASSWORD")
          ?.trim();
        if (!databasePassword)
          throw new Error(
            "DB_PASSWORD doit être renseigné dans la configuration (ou DATABASE_URL pour un hébergement managé).",
          );

        return {
          ...sharedOptions,
          host: configuration.get<string>("DB_HOST", "localhost"),
          port: Number(configuration.get<string>("DB_PORT", "5432")),
          username: configuration.get<string>("DB_USERNAME", "sre_app"),
          password: databasePassword,
          database: configuration.get<string>("DB_DATABASE", "sre_demo"),
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
    ActivityLogModule,
    TypeOrmModule.forFeature([ActivityLogEntity]),
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Server-side blocking of business features during the initial setup.
    { provide: APP_INTERCEPTOR, useClass: InitialSetupInterceptor },
    // Audit: logs every business action of an authenticated account.
    { provide: APP_INTERCEPTOR, useClass: ActivityLogInterceptor },
  ],
})
export class AppModule {}
