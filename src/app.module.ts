import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthentificationModule } from "./authentification/authentification.module";
import { ContribuablesModule } from "./contribuables/contribuables.module";
import { DocumentsModule } from "./documents/documents.module";
import { SanteController } from "./sante/sante.controller";
import { ObligationsModule } from "./obligations/obligations.module";
import { PaiementsModule } from "./paiements/paiements.module";
import { TypesImpotModule } from "./types-impot/types-impot.module";
import { UtilisateursModule } from "./utilisateurs/utilisateurs.module";

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
    AuthentificationModule,
    ContribuablesModule,
    TypesImpotModule,
    ObligationsModule,
    PaiementsModule,
    DocumentsModule,
    UtilisateursModule,
  ],
  controllers: [SanteController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
