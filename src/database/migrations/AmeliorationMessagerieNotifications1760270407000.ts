import { MigrationInterface, QueryRunner } from "typeorm";

/** Amélioration du système de contact, de messagerie et de notifications. */
export class AmeliorationMessagerieNotifications1760270407000
  implements MigrationInterface
{
  name = "AmeliorationMessagerieNotifications1760270407000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE statut_message_contact_enum AS ENUM ('NON_LU', 'LU', 'EN_ATTENTE_REPONSE', 'REPONDU');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE messages_contact
        ADD COLUMN IF NOT EXISTS reference varchar(40),
        ADD COLUMN IF NOT EXISTS source varchar(24) NOT NULL DEFAULT 'SITE_PUBLIC',
        ADD COLUMN IF NOT EXISTS utilisateur_id uuid,
        ADD COLUMN IF NOT EXISTS statut statut_message_contact_enum NOT NULL DEFAULT 'NON_LU',
        ADD COLUMN IF NOT EXISTS lu_le timestamptz,
        ADD COLUMN IF NOT EXISTS statut_accuse statut_courriel_contact_enum NOT NULL DEFAULT 'EN_ATTENTE',
        ADD COLUMN IF NOT EXISTS tentatives_accuse integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS derniere_erreur_accuse varchar(300),
        ADD COLUMN IF NOT EXISTS accuse_envoye_le timestamptz,
        ADD COLUMN IF NOT EXISTS sujet_reponse varchar(200),
        ADD COLUMN IF NOT EXISTS message_reponse text,
        ADD COLUMN IF NOT EXISTS repondu_le timestamptz,
        ADD COLUMN IF NOT EXISTS repondu_par_id uuid,
        ADD COLUMN IF NOT EXISTS repondu_par_nom varchar(160),
        ADD COLUMN IF NOT EXISTS statut_courriel_reponse statut_courriel_contact_enum,
        ADD COLUMN IF NOT EXISTS tentatives_courriel_reponse integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS derniere_erreur_courriel_reponse varchar(300),
        ADD COLUMN IF NOT EXISTS historique_reponses jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS empreinte_contenu varchar(64),
        ADD COLUMN IF NOT EXISTS modifie_le timestamptz NOT NULL DEFAULT now()
    `);

    await queryRunner.query(`
      UPDATE messages_contact
      SET statut = CASE WHEN lue = true THEN 'LU'::statut_message_contact_enum ELSE 'NON_LU'::statut_message_contact_enum END
      WHERE statut = 'NON_LU' AND lue = true
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_contact_statut ON messages_contact (statut)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_contact_empreinte ON messages_contact (empreinte_contenu, cree_le)
    `);

    await queryRunner.query(`
      ALTER TABLE notifications
        ALTER COLUMN type_rappel TYPE varchar(48)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_messages_contact_empreinte
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_messages_contact_statut
    `);
    await queryRunner.query(`
      ALTER TABLE messages_contact
        DROP COLUMN IF EXISTS modifie_le,
        DROP COLUMN IF EXISTS empreinte_contenu,
        DROP COLUMN IF EXISTS historique_reponses,
        DROP COLUMN IF EXISTS derniere_erreur_courriel_reponse,
        DROP COLUMN IF EXISTS tentatives_courriel_reponse,
        DROP COLUMN IF EXISTS statut_courriel_reponse,
        DROP COLUMN IF EXISTS repondu_par_nom,
        DROP COLUMN IF EXISTS repondu_par_id,
        DROP COLUMN IF EXISTS repondu_le,
        DROP COLUMN IF EXISTS message_reponse,
        DROP COLUMN IF EXISTS sujet_reponse,
        DROP COLUMN IF EXISTS accuse_envoye_le,
        DROP COLUMN IF EXISTS derniere_erreur_accuse,
        DROP COLUMN IF EXISTS tentatives_accuse,
        DROP COLUMN IF EXISTS statut_accuse,
        DROP COLUMN IF EXISTS lu_le,
        DROP COLUMN IF EXISTS statut,
        DROP COLUMN IF EXISTS utilisateur_id,
        DROP COLUMN IF EXISTS source,
        DROP COLUMN IF EXISTS reference
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS statut_message_contact_enum
    `);
  }
}
