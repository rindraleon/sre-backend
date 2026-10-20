import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/**
 * Journal sécurisé des tentatives de connexion (traçabilité et détection
 * d'abus). Aucun mot de passe ni jeton n'y est enregistré ; l'adresse IP est
 * conservée brute uniquement pour le diagnostic des tentatives automatisées.
 */
@Entity({ name: "tentatives_connexion" })
@Index("idx_tentatives_connexion_courriel_cree", ["courriel", "creeLe"])
export class LoginAttemptEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 254 })
  courriel!: string;

  @Column({ type: "boolean", default: false })
  succes!: boolean;

  /** Raison technique courte (« mot de passe », « stat », « compte inactif »…). */
  @Column({ type: "varchar", length: 120, nullable: true })
  motif!: string | null;

  @Column({ name: "adresse_ip", type: "varchar", length: 64, nullable: true })
  adresseIp!: string | null;

  @CreateDateColumn({ name: "cree_le", type: "timestamptz" })
  creeLe!: Date;
}
