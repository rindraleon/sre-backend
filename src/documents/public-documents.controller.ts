import { Controller, Get, Query } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DocumentsService } from "./documents.service";

/**
 * Vérification publique d'un document (sans authentification) : un tiers muni du
 * numéro et du code imprimés sur un reçu peut contrôler son authenticité, sans
 * accéder aux autres données du contribuable.
 */
@ApiTags("Vérification de document")
@Controller("documents")
export class PublicDocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get("verifier")
  @ApiOperation({ summary: "Vérifier l'authenticité d'un document à partir de son numéro et de son code." })
  @ApiQuery({ name: "numero", required: true, example: "SRE-REC-2026-ABC123456789" })
  @ApiQuery({ name: "code", required: true, example: "1A2B3C4D5E6F7A8B" })
  @ApiResponse({ status: 200, description: "Résultat de la vérification (valide ou non)." })
  verify(@Query("numero") numero?: string, @Query("code") code?: string) {
    if (!numero || !code) {
      return { valide: false, motif: "Numéro et code requis." };
    }
    return this.documents.verifyDocument(numero, code);
  }
}
