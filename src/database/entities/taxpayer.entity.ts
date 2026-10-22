import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { TaxpayerType } from "../enums";
import { UserEntity } from "./user.entity";

@Entity({ name: "contribuables" })
@Index("uq_contribuables_nif", ["nif"], {
  unique: true,
  where: '"nif" IS NOT NULL',
})
@Index("uq_contribuables_stat", ["stat"], {
  unique: true,
  where: '"stat" IS NOT NULL',
})
export class TaxpayerEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @OneToOne(() => UserEntity, (user) => user.taxpayer, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "utilisateur_id" })
  user!: UserEntity | null;

  @Column({
    type: "enum",
    enum: TaxpayerType,
    enumName: "type_contribuable_enum",
  })
  type!: TaxpayerType;

  @Column({
      name: "nom",
    type: "varchar", length: 120 })
  lastName!: string;

  @Column({
      name: "prenom",
    type: "varchar", length: 120, nullable: true })
  firstName!: string | null;

  @Column({
    name: "raison_sociale",
    type: "varchar",
    length: 180,
    nullable: true,
  })
  legalName!: string | null;

  @Column({
    name: "nom_commercial",
    type: "varchar",
    length: 180,
    nullable: true,
  })
  tradeName!: string | null;

  @Column({ type: "varchar", length: 40, nullable: true })
  nif!: string | null;

  @Column({ type: "varchar", length: 40, nullable: true })
  stat!: string | null;

  @Column({
      name: "adresse",
    type: "varchar", length: 220 })
  address!: string;

  @Column({ type: "varchar", length: 120 })
  region!: string;

  @Column({
      name: "ville",
    type: "varchar", length: 120 })
  city!: string;

  @Column({
      name: "courriel",
    type: "varchar", length: 254 })
  email!: string;

  @Column({
      name: "telephone",
    type: "varchar", length: 40 })
  phone!: string;

  @Column({
    name: "representant_legal",
    type: "varchar",
    length: 180,
    nullable: true,
  })
  legalRepresentative!: string | null;

  @Column({ name: "nom_contact", type: "varchar", length: 120, nullable: true })
  contactLastName!: string | null;

  @Column({
    name: "prenom_contact",
    type: "varchar",
    length: 120,
    nullable: true,
  })
  contactFirstName!: string | null;

  @Column({
    name: "fonction_contact",
    type: "varchar",
    length: 120,
    nullable: true,
  })
  contactRole!: string | null;

  @Column({ name: "date_creation_compte", type: "timestamptz" })
  accountCreatedAt!: Date;

  @CreateDateColumn({ name: "cree_le", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "modifie_le", type: "timestamptz" })
  updatedAt!: Date;
}
