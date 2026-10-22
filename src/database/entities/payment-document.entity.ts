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
@Index("uq_documents_paiement_numero", ["number"], { unique: true })
@Index("uq_documents_paiement_type", ["payment", "type"], { unique: true })
@Index("idx_documents_contribuable_emis", ["taxpayer", "issuedAt"])
export class PaymentDocumentEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({
      name: "numero",
    type: "varchar", length: 48 })
  number!: string;

  @Column({
    type: "enum",
    enum: PaymentDocumentType,
    enumName: "type_document_paiement_enum",
  })
  type!: PaymentDocumentType;

  @Column({
      name: "statut",
    type: "enum",
    enum: DocumentStatus,
    enumName: "statut_document_enum",
    default: DocumentStatus.VALID,
  })
  status!: DocumentStatus;

  @ManyToOne(() => PaymentEntity, (payment) => payment.documents, {
    nullable: false,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "paiement_id" })
  payment!: PaymentEntity;

  @ManyToOne(() => TaxpayerEntity, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "contribuable_id" })
  taxpayer!: TaxpayerEntity;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "emis_par_id" })
  issuedBy!: UserEntity | null;

  @Column({ name: "montant", type: "numeric", precision: 15, scale: 0 })
  amount!: string;

  @Column({
      name: "devise",
    type: "char", length: 3, default: "MGA" })
  currency!: "MGA";

  @Column({ name: "emetteur", type: "varchar", length: 180 })
  issuer!: string;

  @Column({ name: "mention", type: "text" })
  mention!: string;

  @Column({
      name: "instantane",
    type: "jsonb" })
  snapshot!: Record<string, unknown>;

  @CreateDateColumn({ name: "emis_le", type: "timestamptz" })
  issuedAt!: Date;
}
