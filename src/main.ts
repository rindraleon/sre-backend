import "reflect-metadata";
import helmet from "helmet";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { NextFunction, Request, Response } from "express";
import { AppModule } from "./app.module";
import { FiltreErreursHttpSre } from "./commun/filtres/filtre-erreurs-http-sre";

async function demarrer() {
  const application = await NestFactory.create(AppModule, { bufferLogs: true });
  const configuration = application.get(ConfigService);
  const port = Number(configuration.get<string>("PORT", "3000"));
  const origines = configuration
    .get<string>("CORS_ORIGINS", "http://localhost:5173")
    .split(",")
    .map((origine) => origine.trim())
    .filter(Boolean);

  const entetesSecurite = helmet();
  const entetesSwagger = helmet({ contentSecurityPolicy: false });
  application.use(
    (requete: Request, reponse: Response, suivant: NextFunction) => {
      const estDocumentation = requete.path.startsWith("/docs");
      return (estDocumentation ? entetesSwagger : entetesSecurite)(
        requete,
        reponse,
        suivant,
      );
    },
  );
  application.enableCors({
    origin: origines,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
  });
  application.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  application.useGlobalFilters(new FiltreErreursHttpSre());

  const configurationSwagger = new DocumentBuilder()
    .setTitle("API SRE — Haute Matsiatra")
    .setDescription(
      "API NestJS du portail SRE. Les déclarations saisies et références de transaction ne sont pas une preuve de règlement; un reçu interne n'est créé qu'après une décision administrative.",
    )
    .setVersion("1.0.0")
    .addBearerAuth()
    .build();
  const documentSwagger = SwaggerModule.createDocument(
    application,
    configurationSwagger,
  );
  SwaggerModule.setup("docs", application, documentSwagger);

  application.enableShutdownHooks();
  await application.listen(port, "0.0.0.0");
  console.log(`API SRE démarrée sur http://0.0.0.0:${port}`);
}

void demarrer();
