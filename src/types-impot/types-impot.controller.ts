import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { IsBoolean } from "class-validator";
import { RoleCompte } from "../base-de-donnees/enums";
import { RolesAutorises } from "../commun/decorateurs/roles.decorateur";
import { JwtAuthGuard } from "../commun/guards/jwt-auth.guard";
import { RolesGuard } from "../commun/guards/roles.guard";
import { CreerTypeImpotDto } from "./dto/creer-type-impot.dto";
import { TypesImpotService } from "./types-impot.service";

class ActiviteTypeImpotDto {
  @IsBoolean()
  actif!: boolean;
}

@Controller("types-impots")
@UseGuards(JwtAuthGuard, RolesGuard)
export class TypesImpotController {
  constructor(private readonly typesImpots: TypesImpotService) {}

  @Get()
  listerActifs() {
    return this.typesImpots.listerActifs();
  }

  @Get("tous")
  @RolesAutorises(RoleCompte.ADMIN)
  listerTous() {
    return this.typesImpots.listerTous();
  }

  @Post()
  @RolesAutorises(RoleCompte.ADMIN)
  creer(@Body() donnees: CreerTypeImpotDto) {
    return this.typesImpots.creer(donnees);
  }

  @Patch(":id")
  @RolesAutorises(RoleCompte.ADMIN)
  modifier(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() donnees: CreerTypeImpotDto,
  ) {
    return this.typesImpots.modifier(id, donnees);
  }

  @Patch(":id/activite")
  @RolesAutorises(RoleCompte.ADMIN)
  definirActivite(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() donnees: ActiviteTypeImpotDto,
  ) {
    return this.typesImpots.definirActivite(id, donnees.actif);
  }
}
