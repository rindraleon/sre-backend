import "reflect-metadata";
import helmet from "helmet";
import { randomUUID } from "node:crypto";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { SwaggerModule } from "@nestjs/swagger";
import type { NextFunction, Request, Response } from "express";
import { AppModule } from "./app.module";
import { HttpErrorFilter } from "./common/filters/http-error.filter";
import { createValidationException } from "./common/validation/validation-errors";
import { addApiAuthorExtension, createOpenApiConfiguration, isOpenApiEnabled } from "./docs";

async function bootstrap() {
  const application = await NestFactory.create(AppModule, { bufferLogs: true });
  const configuration = application.get(ConfigService);
  const port = Number(configuration.get<string>("PORT", "3000"));
  const origins = configuration
    .get<string>("CORS_ORIGINS", "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  application.use(
    (_request: Request, response: Response, next: NextFunction) => {
      const requestId = randomUUID();
      response.locals.requestId = requestId;
      response.setHeader("X-Request-ID", requestId);
      next();
    },
  );

  const securityHeaders = helmet();
  const swaggerHeaders = helmet({ contentSecurityPolicy: false });
  application.use(
    (request: Request, response: Response, next: NextFunction) => {
      const isDocumentation = request.path.startsWith("/docs");
      return (isDocumentation ? swaggerHeaders : securityHeaders)(
        request,
        response,
        next,
      );
    },
  );
  application.enableCors({
    origin: origins,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["X-Request-ID"],
    credentials: false,
  });
  application.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      exceptionFactory: createValidationException,
    }),
  );
  application.useGlobalFilters(new HttpErrorFilter());

  const documentSwagger = addApiAuthorExtension(
    SwaggerModule.createDocument(application, createOpenApiConfiguration()),
  );
  // The UI and its OpenAPI export stay restricted to non-production environments.
  if (isOpenApiEnabled(configuration.get<string>("NODE_ENV", "development"))) {
    SwaggerModule.setup("docs", application, documentSwagger, {
      jsonDocumentUrl: "docs-json",
      yamlDocumentUrl: "docs-yaml",
      customSiteTitle: "Documentation API SRE — Haute Matsiatra",
      swaggerOptions: {
        displayRequestDuration: true,
        filter: true,
        persistAuthorization: false,
      },
    });
  }

  application.enableShutdownHooks();
  await application.listen(port, "0.0.0.0");
  console.log(`API SRE démarrée sur http://0.0.0.0:${port}`);
}

void bootstrap();
