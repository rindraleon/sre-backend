import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1760270400000 implements MigrationInterface {
  name = "InitialSchema1760270400000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE role_compte_enum AS ENUM ('ADMIN', 'CLIENT')`,
    );
    await queryRunner.query(
      `CREATE TYPE statut_compte_enum AS ENUM ('ACTIF', 'EN_ATTENTE', 'INACTIF', 'SUSPENDU')`,
    );
    await queryRunner.query(
      `CREATE TYPE type_contribuable_enum AS ENUM ('PARTICULIER', 'ENTREPRISE')`,
    );
    await queryRunner.query(
      `CREATE TYPE periodicite_impot_enum AS ENUM ('MENSUELLE', 'TRIMESTRIELLE', 'ANNUELLE', 'PONCTUELLE')`,
    );
    await queryRunner.query(
      `CREATE TYPE statut_obligation_enum AS ENUM ('A_PAYER', 'PAIEMENT_EN_COURS', 'EN_VERIFICATION', 'PAYE', 'EN_RETARD', 'REJETE', 'CORRECTION_DEMANDEE')`,
    );
    await queryRunner.query(
      `CREATE TYPE mode_paiement_enum AS ENUM ('MOBILE_MONEY', 'VIREMENT_BANCAIRE')`,
    );
    await queryRunner.query(
      `CREATE TYPE operateur_paiement_enum AS ENUM ('MVOLA', 'ORANGE_MONEY', 'AIRTEL_MONEY')`,
    );
    await queryRunner.query(
      `CREATE TYPE statut_paiement_enum AS ENUM ('EN_VERIFICATION', 'CONFIRME', 'REJETE', 'CORRECTION_DEMANDEE')`,
    );
    await queryRunner.query(
      `CREATE TYPE type_document_paiement_enum AS ENUM ('ACCUSE_DECLARATION', 'RECU_PAIEMENT')`,
    );
    await queryRunner.query(
      `CREATE TYPE statut_document_enum AS ENUM ('VALIDE', 'ANNULE')`,
    );

    await queryRunner.query(`
      CREATE TABLE utilisateurs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        nom varchar(160) NOT NULL,
        courriel varchar(254) NOT NULL,
        mot_de_passe_hash varchar(255) NOT NULL,
        role role_compte_enum NOT NULL DEFAULT 'CLIENT',
        statut statut_compte_enum NOT NULL DEFAULT 'ACTIF',
        changement_mot_de_passe_requis boolean NOT NULL DEFAULT false,
        derniere_connexion timestamptz NULL,
        cree_le timestamptz NOT NULL DEFAULT now(),
        modifie_le timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_utilisateurs_courriel ON utilisateurs (courriel)`,
    );

    await queryRunner.query(`
      CREATE TABLE contribuables (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        utilisateur_id uuid NULL UNIQUE REFERENCES utilisateurs(id) ON DELETE SET NULL,
        type type_contribuable_enum NOT NULL,
        nom varchar(120) NOT NULL,
        prenom varchar(120) NULL,
        raison_sociale varchar(180) NULL,
        nom_commercial varchar(180) NULL,
        nif varchar(40) NULL,
        stat varchar(40) NULL,
        adresse varchar(220) NOT NULL,
        region varchar(120) NOT NULL,
        ville varchar(120) NOT NULL,
        courriel varchar(254) NOT NULL,
        telephone varchar(40) NOT NULL,
        representant_legal varchar(180) NULL,
        nom_contact varchar(120) NULL,
        prenom_contact varchar(120) NULL,
        fonction_contact varchar(120) NULL,
        date_creation_compte timestamptz NOT NULL,
        cree_le timestamptz NOT NULL DEFAULT now(),
        modifie_le timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_contribuables_nif ON contribuables (nif) WHERE nif IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_contribuables_stat ON contribuables (stat) WHERE stat IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE types_impots (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code varchar(32) NOT NULL,
        nom varchar(160) NOT NULL,
        description text NOT NULL DEFAULT '',
        categorie varchar(100) NOT NULL,
        contribuables_concernes varchar(20) NOT NULL DEFAULT 'TOUS',
        periodicite periodicite_impot_enum NOT NULL,
        regle_echeance varchar(220) NOT NULL DEFAULT '',
        mode_montant varchar(20) NOT NULL DEFAULT 'MANUEL',
        montant_reference numeric(15, 0) NULL,
        champs_complementaires jsonb NOT NULL DEFAULT '[]'::jsonb,
        actif boolean NOT NULL DEFAULT true,
        cree_le timestamptz NOT NULL DEFAULT now(),
        modifie_le timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_types_impots_code ON types_impots (code)`,
    );

    await queryRunner.query(`
      CREATE TABLE obligations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        contribuable_id uuid NOT NULL REFERENCES contribuables(id) ON DELETE CASCADE,
        type_impot_id uuid NOT NULL REFERENCES types_impots(id) ON DELETE RESTRICT,
        reference_fiscale varchar(64) NOT NULL,
        periode varchar(80) NOT NULL,
        montant numeric(15, 0) NOT NULL CHECK (montant >= 0),
        devise char(3) NOT NULL DEFAULT 'MGA',
        echeance date NOT NULL,
        statut statut_obligation_enum NOT NULL DEFAULT 'A_PAYER',
        cree_le timestamptz NOT NULL DEFAULT now(),
        modifie_le timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_obligations_reference ON obligations (reference_fiscale)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_obligations_contribuable_statut ON obligations (contribuable_id, statut)`,
    );

    await queryRunner.query(`
      CREATE TABLE paiements (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        reference_interne varchar(48) NOT NULL,
        contribuable_id uuid NOT NULL REFERENCES contribuables(id) ON DELETE CASCADE,
        obligation_id uuid NOT NULL REFERENCES obligations(id) ON DELETE RESTRICT,
        montant numeric(15, 0) NOT NULL CHECK (montant >= 0),
        devise char(3) NOT NULL DEFAULT 'MGA',
        mode mode_paiement_enum NOT NULL,
        operateur operateur_paiement_enum NULL,
        telephone_utilise varchar(40) NULL,
        banque_ou_canal varchar(140) NULL,
        titulaire_payeur varchar(180) NULL,
        reference_transaction varchar(128) NOT NULL,
        date_transaction date NOT NULL,
        justificatif_nom varchar(200) NULL,
        statut statut_paiement_enum NOT NULL DEFAULT 'EN_VERIFICATION',
        valide_le timestamptz NULL,
        valide_par_id uuid NULL REFERENCES utilisateurs(id) ON DELETE SET NULL,
        motif_decision text NULL,
        soumis_le timestamptz NOT NULL DEFAULT now(),
        modifie_le timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_paiements_reference_interne ON paiements (reference_interne)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_paiements_contribuable_soumis ON paiements (contribuable_id, soumis_le DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_paiements_statut ON paiements (statut)`,
    );

    await queryRunner.query(`
      CREATE TABLE evenements_paiement (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        paiement_id uuid NOT NULL REFERENCES paiements(id) ON DELETE CASCADE,
        statut statut_paiement_enum NOT NULL,
        libelle varchar(180) NOT NULL,
        acteur_id uuid NULL REFERENCES utilisateurs(id) ON DELETE SET NULL,
        nom_acteur varchar(160) NOT NULL DEFAULT 'Système',
        motif text NULL,
        cree_le timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(
      `CREATE INDEX idx_evenements_paiement_date ON evenements_paiement (paiement_id, cree_le)`,
    );

    await queryRunner.query(`
      CREATE TABLE documents_paiement (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        numero varchar(48) NOT NULL,
        type type_document_paiement_enum NOT NULL,
        statut statut_document_enum NOT NULL DEFAULT 'VALIDE',
        paiement_id uuid NOT NULL REFERENCES paiements(id) ON DELETE CASCADE,
        contribuable_id uuid NOT NULL REFERENCES contribuables(id) ON DELETE CASCADE,
        emis_par_id uuid NULL REFERENCES utilisateurs(id) ON DELETE SET NULL,
        montant numeric(15, 0) NOT NULL CHECK (montant >= 0),
        devise char(3) NOT NULL DEFAULT 'MGA',
        emetteur varchar(180) NOT NULL,
        mention text NOT NULL,
        instantane jsonb NOT NULL,
        emis_le timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_documents_paiement_numero ON documents_paiement (numero)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_documents_paiement_type ON documents_paiement (paiement_id, type)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_documents_contribuable_emis ON documents_paiement (contribuable_id, emis_le DESC)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS documents_paiement`);
    await queryRunner.query(`DROP TABLE IF EXISTS evenements_paiement`);
    await queryRunner.query(`DROP TABLE IF EXISTS paiements`);
    await queryRunner.query(`DROP TABLE IF EXISTS obligations`);
    await queryRunner.query(`DROP TABLE IF EXISTS types_impots`);
    await queryRunner.query(`DROP TABLE IF EXISTS contribuables`);
    await queryRunner.query(`DROP TABLE IF EXISTS utilisateurs`);
    await queryRunner.query(`DROP TYPE IF EXISTS statut_document_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS type_document_paiement_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS statut_paiement_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS operateur_paiement_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS mode_paiement_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS statut_obligation_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS periodicite_impot_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS type_contribuable_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS statut_compte_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS role_compte_enum`);
  }
}
