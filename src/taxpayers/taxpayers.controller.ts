import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AccountRole } from "../database/enums";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { CreateTaxpayerDto } from "./dto/create-taxpayer.dto";
import { ImportTaxpayersDto } from "./dto/import-taxpayers.dto";
import { UpdateTaxpayerProfileDto } from "./dto/update-taxpayer-profile.dto";
import { TaxpayersService } from "./taxpayers.service";

@Controller("contribuables")
@UseGuards(JwtAuthGuard, RolesGuard)
export class TaxpayersController {
  constructor(private readonly contribuables: TaxpayersService) {}

  @Get("moi")
  @Roles(AccountRole.CLIENT)
  obtenirMonProfil(@CurrentUser() utilisateur: AuthenticatedUser) {
    return this.contribuables.obtenirMonProfil(utilisateur);
  }

  @Patch("moi")
  @Roles(AccountRole.CLIENT)
  modifierMonProfil(
    @CurrentUser() utilisateur: AuthenticatedUser,
    @Body() donnees: UpdateTaxpayerProfileDto,
  ) {
    return this.contribuables.modifierMonProfil(utilisateur, donnees);
  }

  @Post("import")
  @Roles(AccountRole.ADMIN)
  importer(@Body() donnees: ImportTaxpayersDto) {
    return this.contribuables.importer(donnees.profils);
  }

  @Post()
  @Roles(AccountRole.ADMIN)
  creerPourAdministration(@Body() donnees: CreateTaxpayerDto) {
    return this.contribuables.creerPourAdministration(donnees);
  }

  @Get()
  @Roles(AccountRole.ADMIN)
  lister(
    @Query("recherche") recherche?: string,
    @Query("page") page?: string,
    @Query("parPage") parPage?: string,
  ) {
    return this.contribuables.lister(
      recherche,
      Number(page) || 1,
      Number(parPage) || 25,
    );
  }

  @Delete(":id")
  @Roles(AccountRole.ADMIN)
  supprimer(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.contribuables.supprimer(id);
  }

  @Get(":id")
  @Roles(AccountRole.ADMIN)
  obtenirUne(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.contribuables.obtenirUne(id);
  }
}
