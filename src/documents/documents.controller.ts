import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AccountRole } from "../database/enums";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { DocumentsService } from "./documents.service";

@ApiTags("Documents fiscaux")
@ApiBearerAuth()
@Controller("documents")
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get("miennes")
  @ApiOperation({ summary: "Lister les documents du contribuable authentifié." })
  @ApiResponse({ status: 200, description: "Accusés et reçus internes accessibles au compte." })
  @Roles(AccountRole.CLIENT)
  listerMesDocuments(@CurrentUser() utilisateur: AuthenticatedUser) {
    return this.documents.listerMesDocuments(utilisateur.contribuableId ?? "");
  }

  @Get(":id/pdf")
  @ApiOperation({ summary: "Télécharger le PDF d'un document autorisé." })
  @ApiResponse({ status: 200, description: "Fichier PDF en téléchargement." })
  @ApiResponse({ status: 404, description: "Document absent, annulé ou hors propriété." })
  async telechargerPdf(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() utilisateur: AuthenticatedUser,
  ) {
    const fichier = await this.documents.obtenirPdf(id, utilisateur);
    return new StreamableFile(fichier.contenu, {
      type: "application/pdf",
      disposition: `attachment; filename="${fichier.numero}.pdf"`,
      length: fichier.contenu.length,
    });
  }

  @Get(":id")
  @ApiOperation({ summary: "Consulter les métadonnées d'un document autorisé." })
  @ApiResponse({ status: 200, description: "Métadonnées du document." })
  @ApiResponse({ status: 404, description: "Document introuvable ou hors propriété." })
  obtenirUnDocument(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() utilisateur: AuthenticatedUser,
  ) {
    return this.documents.obtenirDocument(id, utilisateur);
  }
}
