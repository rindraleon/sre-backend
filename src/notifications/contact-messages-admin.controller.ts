import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AccountRole } from "../database/enums";
import { ContactMessageEntity } from "../database/entities/contact-message.entity";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";

/**
 * Administration: messages received through the public contact form.
 * Restricted to administrator accounts.
 */
@ApiTags("Administration — messages du site public")
@ApiBearerAuth()
@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AccountRole.ADMIN)
export class ContactMessagesAdminController {
  constructor(
    @InjectRepository(ContactMessageEntity)
    private readonly messages: Repository<ContactMessageEntity>,
  ) {}

  @Get("messages-contact")
  @ApiOperation({
    summary: "Lister les messages reçus via le formulaire public de contact.",
    description:
      "Chaque message est conservé dans le portail : le courriel aux administrateurs n’est qu’une notification. Les messages non lus sont renvoyés en premier.",
  })
  @ApiResponse({ status: 200, description: "Messages du formulaire public." })
  async list(
    @Query("nonLus") unreadOnly?: string,
    @Query("recherche") search?: string,
    @Query("limite") limit?: string,
  ) {
    const take = Math.min(Math.max(Number(limit) || 100, 1), 300);
    const builder = this.messages
      .createQueryBuilder("message")
      .orderBy("message.isRead", "ASC")
      .addOrderBy("message.createdAt", "DESC")
      .take(take);

    if (unreadOnly === "true" || unreadOnly === "1") {
      builder.where("message.isRead = false");
    }
    const term = search?.trim();
    if (term) {
      const pattern = `%${term.toLowerCase()}%`;
      builder.andWhere(
        "(LOWER(message.name) LIKE :pattern OR LOWER(message.email) LIKE :pattern OR LOWER(message.subject) LIKE :pattern OR LOWER(message.message) LIKE :pattern)",
        { pattern },
      );
    }

    const rows = await builder.getMany();
    const total = await this.messages.count();
    const unread = await this.messages.count({ where: { isRead: false } });
    return {
      total,
      unread,
      messages: rows.map((row) => ({
        id: row.id,
        nom: row.name,
        courriel: row.email,
        sujet: row.subject,
        message: row.message,
        lue: row.isRead,
        statutCourriel: row.emailStatus,
        derniereErreurCourriel: row.lastEmailError,
        creeLe: row.createdAt,
      })),
    };
  }

  @Patch("messages-contact/:id/lire")
  @ApiOperation({
    summary: "Marquer un message du formulaire public comme lu.",
  })
  @ApiResponse({ status: 200, description: "Message marqué comme lu." })
  async markAsRead(@Param("id", new ParseUUIDPipe()) id: string) {
    await this.messages.update({ id }, { isRead: true });
    return { id, lue: true };
  }
}
