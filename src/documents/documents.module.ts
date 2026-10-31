import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PaymentDocumentEntity } from "../database/entities/payment-document.entity";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { DocumentsController } from "./documents.controller";
import { PublicDocumentsController } from "./public-documents.controller";
import { DocumentsService } from "./documents.service";

@Module({
  imports: [TypeOrmModule.forFeature([PaymentDocumentEntity])],
  // La route publique est déclarée en premier : `/documents/verifier` ne doit pas
  // être capturée par `/documents/:id` (protégée).
  controllers: [PublicDocumentsController, DocumentsController],
  providers: [DocumentsService, JwtAuthGuard, RolesGuard],
  exports: [DocumentsService],
})
export class DocumentsModule {}
