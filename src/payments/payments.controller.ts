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
import { AccountRole, PaymentStatus } from "../database/enums";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { CreatePaymentDto } from "./dto/create-payment.dto";
import { PaymentDecisionDto } from "./dto/payment-decision.dto";
import { PaymentsService } from "./payments.service";

@Controller("paiements")
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentsController {
  constructor(private readonly paiements: PaymentsService) {}

  @Post()
  @Roles(AccountRole.CLIENT)
  creerDeclaration(
    @CurrentUser() utilisateur: AuthenticatedUser,
    @Body() donnees: CreatePaymentDto,
  ) {
    return this.paiements.creerDeclaration(utilisateur, donnees);
  }

  @Get("miennes")
  @Roles(AccountRole.CLIENT)
  listerMesPaiements(@CurrentUser() utilisateur: AuthenticatedUser) {
    return this.paiements.listerMesPaiements(utilisateur);
  }

  @Get()
  @Roles(AccountRole.ADMIN)
  listerPourAdministration(
    @Query("statut") statut?: string,
    @Query("page") page?: string,
    @Query("parPage") parPage?: string,
  ) {
    let statutFiltre: PaymentStatus | undefined;
    if (statut) {
      if (!Object.values(PaymentStatus).includes(statut as PaymentStatus)) {
        throw new BadRequestException("Filtre de statut invalide.");
      }
      statutFiltre = statut as PaymentStatus;
    }
    return this.paiements.listerPourAdministration(
      statutFiltre,
      Number(page) || 1,
      Number(parPage) || 25,
    );
  }

  @Patch(":id/decision")
  @Roles(AccountRole.ADMIN)
  decider(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() utilisateur: AuthenticatedUser,
    @Body() donnees: PaymentDecisionDto,
  ) {
    return this.paiements.decider(id, utilisateur, donnees);
  }

  @Get(":id")
  obtenirUne(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() utilisateur: AuthenticatedUser,
  ) {
    return this.paiements.obtenirUne(id, utilisateur);
  }
}
