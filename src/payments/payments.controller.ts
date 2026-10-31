import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { AccountRole, PaymentStatus } from "../database/enums";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { CreatePaymentDto } from "./dto/create-payment.dto";
import { PaymentDecisionDto } from "./dto/payment-decision.dto";
import { parsePaymentFilters } from "./payment-filters";
import { PaymentsService } from "./payments.service";

@ApiTags("Paiements")
@ApiBearerAuth()
@Controller("paiements")
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  @ApiOperation({
    summary: "Déclarer un paiement (nature d'impôt, montant et période saisis par l'utilisateur).",
    description:
      "Aucune obligation fiscale préalable n'est requise. `cleIdempotence` protège des doubles soumissions. La déclaration est validée automatiquement à la soumission : le paiement est créé au statut CONFIRME et le reçu officiel est généré immédiatement.",
  })
  @ApiResponse({ status: 201, description: "Paiement validé automatiquement, reçu officiel émis." })
  @ApiResponse({ status: 400, description: "Données invalides (montant, période, canal)." })
  @ApiResponse({ status: 403, description: "Contribuable hors périmètre ou non autorisé." })
  @ApiResponse({ status: 409, description: "Référence de transaction déjà utilisée ou clé d'idempotence réutilisée." })
  @Roles(AccountRole.CLIENT, AccountRole.ADMIN)
  createDeclaration(
    @CurrentUser() user: AuthenticatedUser,
    @Body() data: CreatePaymentDto,
  ) {
    return this.payments.createDeclaration(user, data);
  }

  @Get("miennes")
  @ApiOperation({ summary: "Lister les paiements du contribuable authentifié." })
  @ApiResponse({ status: 200, description: "Paiements du compte, avec historique et reçu éventuel." })
  @Roles(AccountRole.CLIENT)
  listMyPayments(@CurrentUser() user: AuthenticatedUser) {
    return this.payments.listMyPayments(user);
  }

  @Get("a-suivre")
  @ApiOperation({
    summary: "Transactions nécessitant un suivi (en attente, en échec, annulées).",
  })
  @Roles(AccountRole.ADMIN)
  listToFollowUp() {
    return this.payments.listForAdministration({
      statuses: [
        PaymentStatus.PENDING,
        PaymentStatus.UNDER_REVIEW,
        PaymentStatus.FAILED,
        PaymentStatus.REJECTED,
      ],
      page: 1,
      perPage: 50,
      sort: "date_desc",
    });
  }

  @Get()
  @ApiOperation({
    summary: "Rechercher et filtrer les paiements (administration).",
    description:
      "Filtres combinables : contribuable, nature d'impôt, période, dates, montants, statuts et recherche libre.",
  })
  @ApiQuery({ name: "statut", required: false, description: "Statut, ou liste séparée par des virgules." })
  @ApiQuery({ name: "contribuableId", required: false })
  @ApiQuery({ name: "typeImpotId", required: false })
  @ApiQuery({ name: "periode", required: false, example: "2026-03" })
  @ApiQuery({ name: "du", required: false, example: "2026-01-01" })
  @ApiQuery({ name: "au", required: false, example: "2026-12-31" })
  @ApiQuery({ name: "montantMin", required: false, type: Number })
  @ApiQuery({ name: "montantMax", required: false, type: Number })
  @ApiQuery({ name: "recherche", required: false, description: "Référence, NIF, STAT, nom, courriel." })
  @ApiQuery({ name: "tri", required: false, enum: ["date_desc", "date_asc", "montant_desc", "montant_asc", "confirmation_desc"] })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "parPage", required: false, type: Number, description: "Maximum 100." })
  @ApiResponse({ status: 200, description: "Page de paiements filtrés." })
  @ApiResponse({ status: 400, description: "Filtre invalide." })
  @Roles(AccountRole.ADMIN)
  listForAdministration(
    @Query("statut") statut?: string,
    @Query("statuts") statuts?: string,
    @Query("contribuableId") contribuableId?: string,
    @Query("typeImpotId") typeImpotId?: string,
    @Query("periode") periode?: string,
    @Query("du") du?: string,
    @Query("au") au?: string,
    @Query("montantMin") montantMin?: string,
    @Query("montantMax") montantMax?: string,
    @Query("recherche") recherche?: string,
    @Query("tri") tri?: string,
    @Query("page") page?: string,
    @Query("parPage") parPage?: string,
  ) {
    return this.payments.listForAdministration(
      parsePaymentFilters({
        statut,
        statuts,
        contribuableId,
        typeImpotId,
        periode,
        du,
        au,
        montantMin,
        montantMax,
        recherche,
        tri,
        page,
        parPage,
      }),
    );
  }

  @Post(":id/annulation")
  @ApiOperation({ summary: "Annuler un paiement en attente de confirmation." })
  @ApiResponse({ status: 201, description: "Paiement annulé ; aucun reçu n'est émis." })
  @ApiResponse({ status: 409, description: "Le paiement n'est plus annulable." })
  @Roles(AccountRole.CLIENT, AccountRole.ADMIN)
  cancel(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payments.cancel(id, user);
  }

  @Patch(":id/decision")
  @ApiOperation({
    summary: "Décision administrative : rapprochement (CONFIRME), rejet ou demande de correction.",
    description:
      "CONFIRME déclenche la génération automatique du reçu. Le rejet et la demande de correction exigent un motif et ne produisent aucun reçu.",
  })
  @ApiResponse({ status: 200, description: "Décision enregistrée ; reçu généré si confirmation." })
  @ApiResponse({ status: 409, description: "Paiement déjà clôturé." })
  @Roles(AccountRole.ADMIN)
  decide(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() data: PaymentDecisionDto,
  ) {
    return this.payments.decide(id, user, data);
  }

  @Get(":id")
  @ApiOperation({ summary: "Consulter un paiement accessible à l'utilisateur courant." })
  @ApiResponse({ status: 200, description: "Paiement, historique et reçu éventuel." })
  @ApiResponse({ status: 404, description: "Paiement introuvable ou hors périmètre." })
  getOne(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payments.getOne(id, user);
  }
}
