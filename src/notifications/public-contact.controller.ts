import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import type { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { AccountRole } from "../database/enums";
import { ClientContactDto, PublicContactDto } from "./dto/public-contact.dto";
import { PublicContactService } from "./public-contact.service";

/** Public landing form and client workspace contact endpoint. */
@ApiTags("Contact public & client")
@Controller("contact")
export class PublicContactController {
  constructor(private readonly contact: PublicContactService) {}

  @Post()
  @Throttle({ global: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      "Transmettre un message du formulaire public aux administrateurs actifs et envoyer un accusé de réception.",
    description:
      "Le message est validé puis enregistré en base de données avec une référence de suivi. Une notification est envoyée aux administrateurs actifs et un accusé de réception automatique est envoyé à l'expéditeur.",
  })
  @ApiResponse({
    status: 201,
    description: "Message enregistré, référence émise et notifications déclenchées.",
  })
  @ApiResponse({ status: 400, description: "Données de contact invalides." })
  @ApiResponse({
    status: 429,
    description: "Trop de messages envoyés ; réessayez plus tard.",
  })
  send(@Body() data: PublicContactDto) {
    return this.contact.send(data);
  }

  @Post("client")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AccountRole.CLIENT, AccountRole.ADMIN)
  @ApiBearerAuth()
  @Throttle({ global: { limit: 8, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      "Transmettre un message à l'administration depuis l'espace client authentifié.",
  })
  @ApiResponse({
    status: 201,
    description:
      "Message enregistré, notification envoyée aux administrateurs et accusé de réception envoyé au client.",
  })
  sendFromClient(
    @CurrentUser() user: AuthenticatedUser,
    @Body() data: ClientContactDto,
  ) {
    return this.contact.sendFromClient(user, data);
  }
}
