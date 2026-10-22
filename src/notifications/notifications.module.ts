import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ActivationRequestEntity } from "../database/entities/activation-request.entity";
import { ContactMessageEntity } from "../database/entities/contact-message.entity";
import { NotificationEntity } from "../database/entities/notification.entity";
import { ObligationEntity } from "../database/entities/obligation.entity";
import { UserEntity } from "../database/entities/user.entity";
import { ActivationService } from "./activation.service";
import { CampaignService } from "./campaign.service";
import { ContactMessagesAdminController } from "./contact-messages-admin.controller";
import { PublicContactController } from "./public-contact.controller";
import { PublicContactService } from "./public-contact.service";
import { MailService, MAIL_SERVICE } from "./mail.service";
import { NotificationsController } from "./notifications.controller";
import { NotificationsAdminController } from "./notifications-admin.controller";
import { NotificationsService } from "./notifications.service";
import { DeadlineReminderJob } from "./deadline-reminders.job";
import { DeadlineReminderService } from "./deadline-reminders.service";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([
      NotificationEntity,
      ObligationEntity,
      UserEntity,
      ActivationRequestEntity,
      ContactMessageEntity,
    ]),
  ],
  controllers: [
    NotificationsController,
    NotificationsAdminController,
    PublicContactController,
    ContactMessagesAdminController,
  ],
  providers: [
    NotificationsService,
    CampaignService,
    ActivationService,
    PublicContactService,
    DeadlineReminderService,
    DeadlineReminderJob,
    { provide: MAIL_SERVICE, useClass: MailService },
    ConfigService,
  ],
  exports: [
    NotificationsService,
    DeadlineReminderService,
    ActivationService,
    MAIL_SERVICE,
  ],
})
export class NotificationsModule {}
