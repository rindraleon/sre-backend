import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { NotificationEntity } from "../database/entities/notification.entity";

/**
 * Centre de notifications : chaque utilisateur ne voit et ne modifie que ses
 * propres notifications (filtrage systématique par `utilisateur_id`, côté
 * serveur — jamais par un identifiant fourni par le client).
 */
@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notifications: Repository<NotificationEntity>,
  ) {}

  listerPourUtilisateur(utilisateurId: string) {
    return this.notifications.find({
      where: { utilisateur: { id: utilisateurId } },
      relations: { obligation: { typeImpot: true } },
      order: { creeLe: "DESC" },
      take: 100,
    });
  }

  async compterNonLues(utilisateurId: string): Promise<{ nonLues: number }> {
    const nonLues = await this.notifications.count({
      where: { utilisateur: { id: utilisateurId }, lue: false },
    });
    return { nonLues };
  }

  async marquerLue(id: string, utilisateurId: string) {
    const notification = await this.notifications.findOne({
      where: { id, utilisateur: { id: utilisateurId } },
    });
    // Même réponse pour « inexistante » et « à un autre utilisateur » : aucune fuite.
    if (!notification) throw new NotFoundException("Notification introuvable.");
    notification.lue = true;
    return this.notifications.save(notification);
  }

  async marquerToutesLues(utilisateurId: string): Promise<{ nonLues: number }> {
    await this.notifications.update(
      { utilisateur: { id: utilisateurId }, lue: false },
      { lue: true },
    );
    return { nonLues: 0 };
  }
}
