import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { PaymentStatus } from "../enums";
import { PaymentEntity } from "./payment.entity";
import { UserEntity } from "./user.entity";

@Entity({ name: "evenements_paiement" })
export class PaymentEventEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => PaymentEntity, (payment) => payment.history, {
    nullable: false,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "paiement_id" })
  payment!: PaymentEntity;

  @Column({
      name: "statut",
    type: "enum",
    enum: PaymentStatus,
    enumName: "statut_paiement_enum",
  })
  status!: PaymentStatus;

  @Column({
      name: "libelle",
    type: "varchar", length: 180 })
  label!: string;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "acteur_id" })
  actor!: UserEntity | null;

  @Column({
    name: "nom_acteur",
    type: "varchar",
    length: 160,
    default: "Système",
  })
  actorName!: string;

  @Column({
      name: "motif",
    type: "text", nullable: true })
  reason!: string | null;

  @CreateDateColumn({ name: "cree_le", type: "timestamptz" })
  createdAt!: Date;
}
