import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { toNotificationView } from "../common/views/entity-views";
import { NotificationEntity } from "../database/entities/notification.entity";

/**
 * Notification center: each user only sees and modifies their
 * own notifications (systematic filtering by `utilisateur_id`, server-side
 * — never by an identifier provided by the client).
 */
@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notifications: Repository<NotificationEntity>,
  ) {}

  async listForUser(userId: string) {
    const notifications = await this.notifications.find({
      where: { user: { id: userId } },
      relations: { obligation: { taxType: true } },
      order: { createdAt: "DESC" },
      take: 100,
    });
    return notifications.map((notification) =>
      toNotificationView(notification),
    );
  }

  async countUnread(userId: string): Promise<{ unreadCount: number }> {
    const unreadCount = await this.notifications.count({
      where: { user: { id: userId }, isRead: false },
    });
    return { unreadCount };
  }

  async markAsRead(id: string, userId: string) {
    const notification = await this.notifications.findOne({
      where: { id, user: { id: userId } },
    });
    // Same response for "not found" and "belongs to another user": no leakage.
    if (!notification) throw new NotFoundException("Notification introuvable.");
    notification.isRead = true;
    return toNotificationView(await this.notifications.save(notification));
  }

  async markAllAsRead(userId: string): Promise<{ unreadCount: number }> {
    await this.notifications.update(
      { user: { id: userId }, isRead: false },
      { isRead: true },
    );
    return { unreadCount: 0 };
  }
}
