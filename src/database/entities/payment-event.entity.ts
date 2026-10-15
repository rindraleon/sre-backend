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

  @ManyToOne(() => PaymentEntity, (paiement) => paiement.historique, {
    nullable: false,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "paiement_id" })
  paiement!: PaymentEntity;

  @Column({
    type: "enum",
    enum: PaymentStatus,
    enumName: "statut_paiement_enum",
  })
  statut!: PaymentStatus;

  @Column({ type: "varchar", length: 180 })
  libelle!: string;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "acteur_id" })
  acteur!: UserEntity | null;

  @Column({
    name: "nom_acteur",
    type: "varchar",
    length: 160,
    default: "Système",
  })
  nomActeur!: string;

  @Column({ type: "text", nullable: true })
  motif!: string | null;

  @CreateDateColumn({ name: "cree_le", type: "timestamptz" })
  creeLe!: Date;
}
