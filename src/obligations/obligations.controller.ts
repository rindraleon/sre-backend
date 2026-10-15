import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AccountRole } from "../database/enums";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { CreateObligationDto } from "./dto/create-obligation.dto";
import { ObligationsService } from "./obligations.service";

@Controller("obligations")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ObligationsController {
  constructor(private readonly obligations: ObligationsService) {}

  @Get("miennes")
  @Roles(AccountRole.CLIENT)
  listerMesObligations(@CurrentUser() utilisateur: AuthenticatedUser) {
    return this.obligations.listerPourClient(utilisateur.contribuableId ?? "");
  }

  @Get()
  @Roles(AccountRole.ADMIN)
  listerToutes() {
    return this.obligations.listerPourAdministration();
  }

  @Post()
  @Roles(AccountRole.ADMIN)
  creer(@Body() donnees: CreateObligationDto) {
    return this.obligations.creer(donnees);
  }

  @Get(":id")
  obtenirUne(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() utilisateur: AuthenticatedUser,
  ) {
    return this.obligations.obtenirUne(id, utilisateur);
  }
}
