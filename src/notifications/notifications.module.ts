import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { TypeOrmModule } from "@nestjs/typeorm";
import { NotificationEntity } from "../database/entities/notification.entity";
import { ObligationEntity } from "../database/entities/obligation.entity";
import { MailService, MAIL_SERVICE } from "./mail.service";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { DeadlineReminderJob } from "./deadline-reminders.job";
import { DeadlineReminderService } from "./deadline-reminders.service";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([NotificationEntity, ObligationEntity]),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    DeadlineReminderService,
    DeadlineReminderJob,
    { provide: MAIL_SERVICE, useClass: MailService },
    ConfigService,
  ],
  exports: [NotificationsService, DeadlineReminderService],
})
export class NotificationsModule {}
