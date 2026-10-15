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
import { AccountRole } from "../database/enums";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { CreateTaxTypeDto } from "./dto/create-tax-type.dto";
import { TaxTypesService } from "./tax-types.service";

class ActiviteTypeImpotDto {
  @IsBoolean({ message: "Ce champ doit être un booléen." })
  actif!: boolean;
}

@Controller("types-impots")
@UseGuards(JwtAuthGuard, RolesGuard)
export class TaxTypesController {
  constructor(private readonly typesImpots: TaxTypesService) {}

  @Get()
  listerActifs() {
    return this.typesImpots.listerActifs();
  }

  @Get("tous")
  @Roles(AccountRole.ADMIN)
  listerTous() {
    return this.typesImpots.listerTous();
  }

  @Post()
  @Roles(AccountRole.ADMIN)
  creer(@Body() donnees: CreateTaxTypeDto) {
    return this.typesImpots.creer(donnees);
  }

  @Patch(":id")
  @Roles(AccountRole.ADMIN)
  modifier(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() donnees: CreateTaxTypeDto,
  ) {
    return this.typesImpots.modifier(id, donnees);
  }

  @Patch(":id/activite")
  @Roles(AccountRole.ADMIN)
  definirActivite(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() donnees: ActiviteTypeImpotDto,
  ) {
    return this.typesImpots.definirActivite(id, donnees.actif);
  }
}
