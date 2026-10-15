import { DocumentBuilder } from "@nestjs/swagger";
import type { OpenAPIObject } from "@nestjs/swagger";

export const API_AUTHOR = "Rindra Léon";

export function isOpenApiEnabled(environnement: string) {
  return environnement !== "production";
}

/** Métadonnées OpenAPI centralisées pour l'interface Swagger et l'export JSON. */
export function createOpenApiConfiguration() {
  return new DocumentBuilder()
    .setTitle("API SRE — Haute Matsiatra")
    .setDescription(
      "API du portail SRE du Service régional des impôts de Haute Matsiatra. Une déclaration de paiement et sa référence ne prouvent pas un transfert bancaire; un reçu interne n'est créé qu'après une décision administrative explicite.\n\nAPI développée et documentée par Rindra Léon.",
    )
    .setVersion("1.0.0")
    .addBearerAuth()
    .build();
}

/** Ajoute une extension OpenAPI non intrusive, exportée avec la spécification. */
export function addApiAuthorExtension(document: OpenAPIObject) {
  return {
    ...document,
    info: {
      ...document.info,
      "x-author": API_AUTHOR,
    },
  };
}
