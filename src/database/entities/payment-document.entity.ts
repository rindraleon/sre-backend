import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { DocumentStatus, PaymentDocumentType } from "../enums";
import { TaxpayerEntity } from "./taxpayer.entity";
import { PaymentEntity } from "./payment.entity";
import { UserEntity } from "./user.entity";

@Entity({ name: "documents_paiement" })
@Index("uq_documents_paiement_numero", ["numero"], { unique: true })
@Index("uq_documents_paiement_type", ["paiement", "type"], { unique: true })
@Index("idx_documents_contribuable_emis", ["contribuable", "emisLe"])
export class PaymentDocumentEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 48 })
  numero!: string;

  @Column({
    type: "enum",
    enum: PaymentDocumentType,
    enumName: "type_document_paiement_enum",
  })
  type!: PaymentDocumentType;

  @Column({
    type: "enum",
    enum: DocumentStatus,
    enumName: "statut_document_enum",
    default: DocumentStatus.VALIDE,
  })
  statut!: DocumentStatus;

  @ManyToOne(() => PaymentEntity, (paiement) => paiement.documents, {
    nullable: false,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "paiement_id" })
  paiement!: PaymentEntity;

  @ManyToOne(() => TaxpayerEntity, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "contribuable_id" })
  contribuable!: TaxpayerEntity;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "emis_par_id" })
  emisPar!: UserEntity | null;

  @Column({ name: "montant", type: "numeric", precision: 15, scale: 0 })
  montant!: string;

  @Column({ type: "char", length: 3, default: "MGA" })
  devise!: "MGA";

  @Column({ name: "emetteur", type: "varchar", length: 180 })
  emetteur!: string;

  @Column({ name: "mention", type: "text" })
  mention!: string;

  @Column({ type: "jsonb" })
  instantane!: Record<string, unknown>;

  @CreateDateColumn({ name: "emis_le", type: "timestamptz" })
  emisLe!: Date;
}
