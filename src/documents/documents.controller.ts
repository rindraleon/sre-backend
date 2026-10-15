import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { AccountRole } from "../database/enums";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { DocumentsService } from "./documents.service";

@Controller("documents")
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get("miennes")
  @Roles(AccountRole.CLIENT)
  listerMesDocuments(@CurrentUser() utilisateur: AuthenticatedUser) {
    return this.documents.listerMesDocuments(utilisateur.contribuableId ?? "");
  }

  @Get(":id/pdf")
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
  obtenirUnDocument(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() utilisateur: AuthenticatedUser,
  ) {
    return this.documents.obtenirDocument(id, utilisateur);
  }
}
