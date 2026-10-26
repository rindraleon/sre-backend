import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/** Secure log of sign-in attempts (traceability and abuse detection). */
@Entity({ name: "tentatives_connexion" })
@Index("idx_tentatives_connexion_courriel_cree", ["email", "createdAt"])
export class LoginAttemptEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({
      name: "courriel",
    type: "varchar", length: 254 })
  email!: string;

  @Column({
      name: "succes",
    type: "boolean", default: false })
  success!: boolean;

  /** Short technical reason ("password", "stat", "inactive account"…). */
  @Column({
      name: "motif",
    type: "varchar", length: 120, nullable: true })
  reason!: string | null;

  @Column({ name: "adresse_ip", type: "varchar", length: 64, nullable: true })
  ipAddress!: string | null;

  @CreateDateColumn({ name: "cree_le", type: "timestamptz" })
  createdAt!: Date;
}
