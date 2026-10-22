import {
  BadRequestException,
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
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AccountRole, PaymentStatus } from "../database/enums";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { CreatePaymentDto } from "./dto/create-payment.dto";
import { PaymentDecisionDto } from "./dto/payment-decision.dto";
import { PaymentsService } from "./payments.service";

@ApiTags("Déclarations de paiement")
@ApiBearerAuth()
@Controller("paiements")
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  @ApiOperation({
    summary: "Soumettre une déclaration à l'examen administratif.",
    description: "Le montant vient de l'obligation. La référence et les informations déclarées ne déclenchent aucun transfert et ne prouvent pas un règlement.",
  })
  @ApiResponse({ status: 201, description: "Déclaration créée en attente d'examen; un accusé de soumission peut être téléchargé." })
  @ApiResponse({ status: 400, description: "Données de déclaration invalides." })
  @ApiResponse({ status: 403, description: "Un compte client lié au contribuable est requis." })
  @ApiResponse({ status: 404, description: "Obligation absente ou inaccessible." })
  @ApiResponse({ status: 409, description: "Une déclaration existe déjà ou l'obligation n'est pas éligible." })
  @Roles(AccountRole.CLIENT)
  createDeclaration(
    @CurrentUser() user: AuthenticatedUser,
    @Body() data: CreatePaymentDto,
  ) {
    return this.payments.createDeclaration(user, data);
  }

  @Get("miennes")
  @ApiOperation({ summary: "Lister les déclarations du contribuable authentifié." })
  @ApiResponse({ status: 200, description: "Déclarations du compte, avec leur historique et les documents disponibles." })
  @Roles(AccountRole.CLIENT)
  listMyPayments(@CurrentUser() user: AuthenticatedUser) {
    return this.payments.listMyPayments(user);
  }

  @Get()
  @ApiOperation({ summary: "Lister les déclarations du périmètre Haute Matsiatra (administration)." })
  @ApiQuery({ name: "statut", required: false, enum: PaymentStatus, description: "Filtre de statut métier." })
  @ApiQuery({ name: "page", required: false, type: Number, example: 1 })
  @ApiQuery({ name: "parPage", required: false, type: Number, example: 25, description: "Maximum 100 lignes par page." })
  @ApiResponse({ status: 200, description: "Page de déclarations selon les filtres." })
  @ApiResponse({ status: 400, description: "Filtre de statut invalide." })
  @Roles(AccountRole.ADMIN)
  listForAdministration(
    @Query("statut") status?: string,
    @Query("page") page?: string,
    @Query("parPage") perPage?: string,
  ) {
    let statusFilter: PaymentStatus | undefined;
    if (status) {
      if (!Object.values(PaymentStatus).includes(status as PaymentStatus)) {
        throw new BadRequestException("Filtre de statut invalide.");
      }
      statusFilter = status as PaymentStatus;
    }
    return this.payments.listForAdministration(
      statusFilter,
      Number(page) || 1,
      Number(perPage) || 25,
    );
  }

  @Patch(":id/decision")
  @ApiOperation({
    summary: "Enregistrer une décision administrative sur une déclaration.",
    description: "CONFIRME, REJETE ou CORRECTION_DEMANDEE. Un motif est requis pour le rejet et la demande de correction; CONFIRME crée un reçu interne, pas une preuve bancaire.",
  })
  @ApiResponse({ status: 200, description: "Décision et historique enregistrés; les documents reflètent le statut serveur." })
  @ApiResponse({ status: 400, description: "Statut ou motif de décision invalide." })
  @ApiResponse({ status: 403, description: "Action réservée à l'administration." })
  @ApiResponse({ status: 404, description: "Déclaration introuvable dans le périmètre." })
  @ApiResponse({ status: 409, description: "Une décision a déjà été enregistrée." })
  @Roles(AccountRole.ADMIN)
  decide(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() data: PaymentDecisionDto,
  ) {
    return this.payments.decide(id, user, data);
  }

  @Get(":id")
  @ApiOperation({ summary: "Consulter une déclaration accessible à l'utilisateur courant." })
  @ApiResponse({ status: 200, description: "Déclaration, historique métier et documents associés." })
  @ApiResponse({ status: 404, description: "Déclaration introuvable ou hors périmètre." })
  getOne(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payments.getOne(id, user);
  }
}
