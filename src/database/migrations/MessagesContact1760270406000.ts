import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Messages du formulaire public « Contact ». Le portail conserve chaque
 * message (source de vérité) ; le courriel aux administrateurs est une
 * notification.best-effort par-dessus.
 */
export class MessagesContact1760270406000 implements MigrationInterface {
  name = "MessagesContact1760270406000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE statut_courriel_contact_enum AS ENUM ('NON_CONFIGURE','EN_ATTENTE','ENVOYE','ECHEC')`,
    );
    await queryRunner.query(`CREATE TABLE messages_contact (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      nom varchar(120) NOT NULL,
      courriel varchar(254) NOT NULL,
      sujet varchar(140) NOT NULL,
      message text NOT NULL,
      lue boolean NOT NULL DEFAULT false,
      statut_courriel statut_courriel_contact_enum NOT NULL DEFAULT 'EN_ATTENTE',
      tentatives_courriel integer NOT NULL DEFAULT 0,
      derniere_erreur_courriel varchar(300),
      courriel_envoye_le timestamptz,
      cree_le timestamptz NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(
      `CREATE INDEX idx_messages_contact_cree_le ON messages_contact (cree_le)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS messages_contact`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS statut_courriel_contact_enum`,
    );
  }
}
