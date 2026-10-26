import { MigrationInterface, QueryRunner } from "typeorm";

/** Centre de notifications in-app + suivi d'envoi des courriels de rappel d'échéance. */
export class CreerNotifications1760270402000 implements MigrationInterface {
  name = "CreerNotifications1760270402000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE statut_courriel_notification_enum AS ENUM ('NON_CONFIGURE','EN_ATTENTE','ENVOYE','ECHEC')`,
    );
    await queryRunner.query(`CREATE TABLE notifications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      utilisateur_id uuid NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
      obligation_id uuid REFERENCES obligations(id) ON DELETE SET NULL,
      type_rappel varchar(24) NOT NULL,
      titre varchar(160) NOT NULL,
      message text NOT NULL,
      lien varchar(200),
      lue boolean NOT NULL DEFAULT false,
      cle_idempotence varchar(200) NOT NULL,
      statut_courriel statut_courriel_notification_enum NOT NULL DEFAULT 'EN_ATTENTE',
      tentatives_courriel integer NOT NULL DEFAULT 0,
      derniere_erreur_courriel varchar(300),
      courriel_envoye_le timestamptz,
      cree_le timestamptz NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_notifications_cle_idempotence ON notifications (cle_idempotence)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_notifications_utilisateur_lue ON notifications (utilisateur_id, lue)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS notifications`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS statut_courriel_notification_enum`,
    );
  }
}
