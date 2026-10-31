import PDFDocument from "pdfkit";
import { dessinerCode128 } from "./code128";
import { montantEnLettres } from "./montant-en-lettres";

export interface RecuFiscalPdfDonnees {
  estRecuDefinitif: boolean;
  numero: string;
  emetteur: string;
  emisLe: Date | string;
  fuseauHoraire: string;
  montant: number;
  devise: string;
  statutPaiement: string;
  codeVerification: string | null;
  urlVerification: string;
  mention: string;
  contribuable: {
    nom: string;
    nif: string | null;
    stat: string | null;
    adresse: string | null;
    ville: string | null;
    telephone: string | null;
    courriel: string | null;
  };
  impot: {
    nature: string;
    code: string | null;
    periode: string;
  };
  paiement: {
    referenceInterne: string;
    referenceTransactionDeclaree: string;
    modeDeclare: string;
    operateur: string | null;
    canal: string | null;
    confirmeLe: string | null;
    dateTransactionDeclaree: string | null;
    obligationReference: string | null;
    origine: string | null;
  };
}

const COULEURS = {
  marine: "#0f2a42",
  marineCercle1: "#1a526b",
  marineCercle2: "#16465d",
  sarcelle: "#0f8a8c",
  vertFonce: "#16856b",
  vertFond: "#e9f6f0",
  ambreFond: "#fef3c7",
  ambreTexte: "#92400e",
  rubanAmbre: "#efa34b",
  carteGris: "#f2f6f9",
  bordure: "#dbe4e9",
  filetTableau: "#e6edf2",
  texteGris: "#5b6e80",
  texteSecondaire: "#6c7e8f",
  blanc: "#ffffff",
  sousTitreClair: "#b8cad8",
} as const;

const MOIS_FR = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

/** Séparateur de milliers par espace simple (toujours encodable en WinAnsi / Helvetica). */
export function formaterMontantChiffres(montant: number): string {
  return Math.round(montant)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function formaterDateHeure(valeur: Date | string | null | undefined, fuseau: string): string {
  if (!valeur) return "—";
  const date = valeur instanceof Date ? valeur : new Date(String(valeur));
  if (Number.isNaN(date.getTime())) return "—";
  const parties = new Intl.DateTimeFormat("fr-FR", {
    timeZone: fuseau,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const lire = (type: string) => parties.find((p) => p.type === type)?.value ?? "";
  return `${lire("day")}/${lire("month")}/${lire("year")}  •  ${lire("hour")}:${lire("minute")}:${lire("second")}`;
}

/** Traduit une période fiscale en libellé lisible, sans ajouter le terme « exercice ». */
export function formaterPeriodeFiscale(periode: string): string {
  const valeur = (periode ?? "").trim();
  if (!valeur || valeur === "—") return "Non applicable";
  const moisMatch = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(valeur);
  if (moisMatch) {
    const annee = moisMatch[1];
    const mois = MOIS_FR[Number(moisMatch[2]) - 1];
    return `${mois} ${annee}`;
  }
  const trimestreMatch = /^(\d{4})-T([1-4])$/i.exec(valeur);
  if (trimestreMatch) {
    return `${trimestreMatch[2]}e trimestre ${trimestreMatch[1]}`;
  }
  if (/^\d{4}$/.test(valeur)) {
    return valeur;
  }
  const jourMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valeur);
  if (jourMatch) {
    return `${jourMatch[3]}/${jourMatch[2]}/${jourMatch[1]}`;
  }
  return valeur;
}

function libelleModePaiement(
  mode: string,
  operateur: string | null,
  canal: string | null,
): string {
  const libellesOperateurs: Record<string, string> = {
    MVOLA: "MVola",
    ORANGE_MONEY: "Orange Money",
    AIRTEL_MONEY: "Airtel Money",
  };
  if (mode === "VIREMENT_BANCAIRE") {
    return canal?.trim() ? `Virement bancaire (${canal.trim()})` : "Virement bancaire";
  }
  if (mode === "MOBILE_MONEY") {
    const op = operateur ? (libellesOperateurs[operateur] ?? operateur.replace(/_/g, " ")) : "";
    return op ? `Mobile Money (${op})` : "Mobile Money";
  }
  return mode ? mode.replace(/_/g, " ") : "—";
}

function texteOuTiret(valeur: string | null | undefined, repli = "Non renseigné"): string {
  const propre = (valeur ?? "").trim();
  return propre.length > 0 ? propre : repli;
}

function formaterIdentifiantFiscal(libelle: "NIF" | "STAT", valeur: string | null): string | null {
  const propre = (valeur ?? "").trim();
  if (!propre) return null;
  return new RegExp(`^${libelle}\\b`, "i").test(propre) ? propre : `${libelle} ${propre}`;
}

function tronquer(texte: string, max: number): string {
  return texte.length <= max ? texte : `${texte.slice(0, max - 1)}…`;
}

/** Génère le PDF A4 (une page) conforme au modèle de reçu de versement fiscal, avec code-barres Code 128. */
export function genererPdfRecuFiscal(donnees: RecuFiscalPdfDonnees): Promise<Buffer> {
  const morceaux: Buffer[] = [];
  const estRecu = donnees.estRecuDefinitif;

  return new Promise((resoudre, rejeter) => {
    const pdf = new PDFDocument({
      size: "A4",
      margin: 0,
      autoFirstPage: true,
      info: {
        Title: donnees.numero,
        Author: donnees.emetteur,
        Subject: estRecu
          ? "Reçu de versement fiscal"
          : "Accusé de réception de déclaration",
      },
    });
    pdf.on("data", (part: Buffer) => morceaux.push(part));
    pdf.on("end", () => resoudre(Buffer.concat(morceaux)));
    pdf.on("error", rejeter);

    const LARGEUR_PAGE = 595.28;
    const MARGE_X = 40;
    const LARGEUR_CONTENU = LARGEUR_PAGE - MARGE_X * 2; // 515.28

    // ─── 1. Bandeau supérieur marine avec cercles décoratifs ───────────────
    const HAUTEUR_BANDEAU = 166;
    pdf.save();
    pdf.rect(0, 0, LARGEUR_PAGE, HAUTEUR_BANDEAU).clip();
    pdf.rect(0, 0, LARGEUR_PAGE, HAUTEUR_BANDEAU).fill(COULEURS.marine);
    pdf.circle(555, 28, 118).fillOpacity(0.55).fill(COULEURS.marineCercle1);
    pdf.circle(590, 8, 74).fillOpacity(0.75).fill(COULEURS.marineCercle2);
    pdf.restore();
    pdf.fillOpacity(1);

    // Pastille sarcelle avec coche blanche (ou horloge stylisée si accusé)
    pdf.roundedRect(46, 40, 38, 38, 9).fill(COULEURS.sarcelle);
    pdf.save();
    pdf.lineWidth(2.8).lineCap("round").lineJoin("round").strokeColor(COULEURS.blanc);
    if (estRecu) {
      pdf.moveTo(56, 60).lineTo(63, 67).lineTo(75, 51).stroke();
    } else {
      pdf.circle(65, 59, 10).stroke();
      pdf.moveTo(65, 53).lineTo(65, 59).lineTo(70, 62).stroke();
    }
    pdf.restore();

    // Marque SRE | PLATEFORME FISCALE + organisme habilité
    pdf
      .fillColor(COULEURS.blanc)
      .font("Helvetica-Bold")
      .fontSize(11)
      .text("SRE  |  PLATEFORME FISCALE", 95, 45, { lineBreak: false });
    pdf
      .fillColor(COULEURS.sousTitreClair)
      .font("Helvetica")
      .fontSize(8.5)
      .text(tronquer(donnees.emetteur, 72), 95, 61, { lineBreak: false });

    // Grand titre + sous-titre
    pdf
      .fillColor(COULEURS.blanc)
      .font("Helvetica-Bold")
      .fontSize(estRecu ? 22 : 19.5)
      .text(
        estRecu ? "REÇU DE VERSEMENT FISCAL" : "ACCUSÉ DE DÉCLARATION FISCALE",
        46,
        96,
        { lineBreak: false },
      );
    pdf
      .fillColor(COULEURS.sousTitreClair)
      .font("Helvetica")
      .fontSize(9.2)
      .text(
        estRecu
          ? "JUSTIFICATIF DE PAIEMENT  •  DOCUMENT À CONSERVER"
          : "CONFIRMATION DE DÉPÔT  •  NE VAUT PAS PREUVE DE PAIEMENT",
        46,
        125,
        { lineBreak: false },
      );

    // Ruban incliné uniquement pour l'accusé (équivalent non-valable d'un reçu)
    if (!estRecu) {
      pdf.save();
      pdf.translate(474, 141);
      pdf.rotate(7);
      pdf.roundedRect(-84, -12, 168, 24, 5).fill(COULEURS.rubanAmbre);
      pdf
        .fillColor(COULEURS.marine)
        .font("Helvetica-Bold")
        .fontSize(7.4)
        .text("ACCUSÉ — NON LIBÉRATOIRE", -84, -3.5, {
          width: 168,
          align: "center",
          lineBreak: false,
        });
      pdf.restore();
    }

    // ─── 2. Carte Numéro du reçu / Date et heure du paiement ───────────────
    const Y_CARTE_ENTETE = 186;
    const H_CARTE_ENTETE = 58;
    pdf
      .roundedRect(MARGE_X, Y_CARTE_ENTETE, LARGEUR_CONTENU, H_CARTE_ENTETE, 9)
      .fill(COULEURS.carteGris);

    const X_SEPARATEUR = MARGE_X + Math.round(LARGEUR_CONTENU * 0.5);
    pdf
      .save()
      .lineWidth(0.8)
      .strokeColor(COULEURS.bordure)
      .moveTo(X_SEPARATEUR, Y_CARTE_ENTETE + 12)
      .lineTo(X_SEPARATEUR, Y_CARTE_ENTETE + H_CARTE_ENTETE - 12)
      .stroke()
      .restore();

    pdf
      .fillColor(COULEURS.texteGris)
      .font("Helvetica")
      .fontSize(7.5)
      .text(estRecu ? "NUMÉRO DU REÇU" : "NUMÉRO DE L'ACCUSÉ", MARGE_X + 16, Y_CARTE_ENTETE + 13, {
        lineBreak: false,
      });
    pdf
      .fillColor(COULEURS.marine)
      .font("Helvetica-Bold")
      .fontSize(13)
      .text(donnees.numero, MARGE_X + 16, Y_CARTE_ENTETE + 28, { lineBreak: false });

    const dateReference =
      estRecu && donnees.paiement.confirmeLe ? donnees.paiement.confirmeLe : donnees.emisLe;
    pdf
      .fillColor(COULEURS.texteGris)
      .font("Helvetica")
      .fontSize(7.5)
      .text(
        estRecu ? "DATE ET HEURE DU PAIEMENT" : "DATE ET HEURE DU DÉPÔT",
        X_SEPARATEUR + 18,
        Y_CARTE_ENTETE + 13,
        { lineBreak: false },
      );
    pdf
      .fillColor(COULEURS.marine)
      .font("Helvetica-Bold")
      .fontSize(11.5)
      .text(
        formaterDateHeure(dateReference, donnees.fuseauHoraire),
        X_SEPARATEUR + 18,
        Y_CARTE_ENTETE + 29,
        { lineBreak: false },
      );

    // Pastille de statut alignée à droite sous la carte
    const pastilleTexte = estRecu ? "PAYÉ / CONFIRMÉ" : "DÉCLARÉ / EN ATTENTE";
    const pastilleLargeur = estRecu ? 104 : 124;
    const pastilleX = MARGE_X + LARGEUR_CONTENU - pastilleLargeur;
    const pastilleY = Y_CARTE_ENTETE + H_CARTE_ENTETE + 9;
    pdf
      .roundedRect(pastilleX, pastilleY, pastilleLargeur, 20, 10)
      .fill(estRecu ? COULEURS.vertFond : COULEURS.ambreFond);
    pdf
      .fillColor(estRecu ? COULEURS.vertFonce : COULEURS.ambreTexte)
      .font("Helvetica-Bold")
      .fontSize(7.8)
      .text(pastilleTexte, pastilleX, pastilleY + 6, {
        width: pastilleLargeur,
        align: "center",
        lineBreak: false,
      });

    // Helper d'en-tête de section avec filet sarcelle
    const dessinerTitreSection = (titre: string, y: number) => {
      pdf
        .fillColor(COULEURS.marine)
        .font("Helvetica-Bold")
        .fontSize(10.5)
        .text(titre, 46, y, { lineBreak: false });
      pdf.rect(46, y + 16, 62, 2.3).fill(COULEURS.sarcelle);
    };

    // ─── 3. Identification du contribuable ─────────────────────────────────
    const Y_SEC_CONTRIB = 276;
    dessinerTitreSection("IDENTIFICATION DU CONTRIBUABLE", Y_SEC_CONTRIB);

    const Y_CARTE_CONTRIB = Y_SEC_CONTRIB + 26;
    const H_CARTE_CONTRIB = 78;
    pdf
      .roundedRect(MARGE_X, Y_CARTE_CONTRIB, LARGEUR_CONTENU, H_CARTE_CONTRIB, 9)
      .fill(COULEURS.carteGris);

    const X_COL2 = MARGE_X + Math.round(LARGEUR_CONTENU * 0.55);
    const LARG_COL1 = X_COL2 - (MARGE_X + 16) - 12;
    const LARG_COL2 = MARGE_X + LARGEUR_CONTENU - X_COL2 - 16;

    const nifStat = [
      formaterIdentifiantFiscal("NIF", donnees.contribuable.nif),
      formaterIdentifiantFiscal("STAT", donnees.contribuable.stat),
    ]
      .filter(Boolean)
      .join("  •  ");
    const adresseComplete = [donnees.contribuable.adresse, donnees.contribuable.ville]
      .map((v) => (v ?? "").trim())
      .filter(Boolean)
      .join(", ");
    const contactComplet = [donnees.contribuable.telephone, donnees.contribuable.courriel]
      .map((v) => (v ?? "").trim())
      .filter(Boolean)
      .join("  •  ");

    pdf
      .fillColor(COULEURS.texteGris)
      .font("Helvetica")
      .fontSize(7.2)
      .text("ENTREPRISE / CONTRIBUABLE", MARGE_X + 16, Y_CARTE_CONTRIB + 11, { lineBreak: false });
    pdf
      .fillColor(COULEURS.marine)
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(tronquer(texteOuTiret(donnees.contribuable.nom, "Contribuable"), 42), MARGE_X + 16, Y_CARTE_CONTRIB + 23, {
        width: LARG_COL1,
        lineBreak: false,
      });

    pdf
      .fillColor(COULEURS.texteGris)
      .font("Helvetica")
      .fontSize(7.2)
      .text("NIF / IDENTIFIANT FISCAL", MARGE_X + 16, Y_CARTE_CONTRIB + 45, { lineBreak: false });
    pdf
      .fillColor(COULEURS.marine)
      .font("Helvetica-Bold")
      .fontSize(9.2)
      .text(tronquer(nifStat || "Non renseigné", 46), MARGE_X + 16, Y_CARTE_CONTRIB + 57, {
        width: LARG_COL1,
        lineBreak: false,
      });

    pdf
      .fillColor(COULEURS.texteGris)
      .font("Helvetica")
      .fontSize(7.2)
      .text("ADRESSE", X_COL2, Y_CARTE_CONTRIB + 11, { lineBreak: false });
    pdf
      .fillColor(COULEURS.marine)
      .font("Helvetica-Bold")
      .fontSize(9.2)
      .text(tronquer(adresseComplete || "Non renseignée", 44), X_COL2, Y_CARTE_CONTRIB + 24, {
        width: LARG_COL2,
        lineBreak: false,
      });

    pdf
      .fillColor(COULEURS.texteGris)
      .font("Helvetica")
      .fontSize(7.2)
      .text("CONTACT", X_COL2, Y_CARTE_CONTRIB + 45, { lineBreak: false });
    pdf
      .fillColor(COULEURS.marine)
      .font("Helvetica-Bold")
      .fontSize(9.2)
      .text(tronquer(contactComplet || "Non renseigné", 44), X_COL2, Y_CARTE_CONTRIB + 57, {
        width: LARG_COL2,
        lineBreak: false,
      });

    // ─── 4. Détails du versement (carte bordée à 5 lignes) ─────────────────
    const Y_SEC_DETAILS = 392;
    dessinerTitreSection("DÉTAILS DU VERSEMENT", Y_SEC_DETAILS);

    const Y_TABLEAU = Y_SEC_DETAILS + 26;
    const H_LIGNE = 27.5;
    const LIGNES: Array<[string, string]> = [
      [
        "Nature de l'impôt",
        donnees.impot.nature,
      ],
      ["Période fiscale", formaterPeriodeFiscale(donnees.impot.periode)],
      [
        "Référence de déclaration / dossier",
        donnees.paiement.obligationReference
          ? `${donnees.paiement.referenceInterne}  •  Obligation ${donnees.paiement.obligationReference}`
          : donnees.paiement.referenceInterne,
      ],
      [
        "Mode de paiement",
        libelleModePaiement(
          donnees.paiement.modeDeclare,
          donnees.paiement.operateur,
          donnees.paiement.canal,
        ),
      ],
      ["Référence de transaction", texteOuTiret(donnees.paiement.referenceTransactionDeclaree, "—")],
    ];
    const H_TABLEAU = H_LIGNE * LIGNES.length;

    pdf
      .save()
      .lineWidth(0.9)
      .roundedRect(MARGE_X, Y_TABLEAU, LARGEUR_CONTENU, H_TABLEAU, 9)
      .fillAndStroke(COULEURS.blanc, COULEURS.bordure)
      .restore();

    LIGNES.forEach(([libelle, valeur], index) => {
      const yLigne = Y_TABLEAU + index * H_LIGNE;
      if (index > 0) {
        pdf
          .save()
          .lineWidth(0.7)
          .strokeColor(COULEURS.filetTableau)
          .moveTo(MARGE_X + 14, yLigne)
          .lineTo(MARGE_X + LARGEUR_CONTENU - 14, yLigne)
          .stroke()
          .restore();
      }
      pdf
        .fillColor(COULEURS.texteGris)
        .font("Helvetica")
        .fontSize(9)
        .text(libelle, MARGE_X + 16, yLigne + 9, { lineBreak: false });
      pdf
        .fillColor(COULEURS.marine)
        .font("Helvetica-Bold")
        .fontSize(index === 0 ? 8 : 9.2)
        .text(tronquer(valeur, index === 0 ? 88 : 58), MARGE_X + 195, yLigne + 9, {
          width: LARGEUR_CONTENU - 211,
          align: "right",
          lineBreak: false,
        });
    });

    // ─── 5. Encadré du montant total versé + montant en lettres ────────────
    const Y_MONTANT = Y_TABLEAU + H_TABLEAU + 14;
    const H_MONTANT = 58;
    pdf
      .roundedRect(MARGE_X, Y_MONTANT, LARGEUR_CONTENU, H_MONTANT, 9)
      .fill(estRecu ? COULEURS.vertFond : COULEURS.ambreFond);

    pdf
      .fillColor(estRecu ? COULEURS.vertFonce : COULEURS.ambreTexte)
      .font("Helvetica-Bold")
      .fontSize(8)
      .text(estRecu ? "MONTANT TOTAL VERSÉ" : "MONTANT DÉCLARÉ", MARGE_X + 16, Y_MONTANT + 11, {
        lineBreak: false,
      });
    pdf
      .fillColor(COULEURS.marine)
      .font("Helvetica-Bold")
      .fontSize(20)
      .text(
        `${formaterMontantChiffres(donnees.montant)} ${donnees.devise}`,
        MARGE_X + 16,
        Y_MONTANT + 25,
        { lineBreak: false },
      );

    const enLettres = montantEnLettres(donnees.montant, donnees.devise);
    pdf
      .fillColor(COULEURS.texteGris)
      .font("Helvetica")
      .fontSize(8.5)
      .text(enLettres, MARGE_X + 235, Y_MONTANT + 22, {
        width: LARGEUR_CONTENU - 251,
        align: "right",
      });

    // ─── 6. Vérification, traçabilité et code-barres de l'ID du reçu ───────
    const Y_VERIF = Y_MONTANT + H_MONTANT + 20;
    const LARG_CARTE_CODEBARRE = 212;
    const H_CARTE_CODEBARRE = 80;
    const X_CARTE_CODEBARRE = MARGE_X + LARGEUR_CONTENU - LARG_CARTE_CODEBARRE;
    const LARG_TEXTE_VERIF = X_CARTE_CODEBARRE - 46 - 16;

    pdf
      .fillColor(COULEURS.marine)
      .font("Helvetica-Bold")
      .fontSize(9.5)
      .text("VÉRIFICATION ET TRAÇABILITÉ", 46, Y_VERIF, { lineBreak: false });

    pdf
      .fillColor(COULEURS.texteGris)
      .font("Helvetica")
      .fontSize(8.3)
      .text(
        `${estRecu ? "Référence de vérification" : "Référence de l'accusé"} : ${donnees.numero}`,
        46,
        Y_VERIF + 15,
        {
          width: LARG_TEXTE_VERIF,
          lineBreak: false,
        },
      );

    if (donnees.codeVerification) {
      pdf
        .fillColor(COULEURS.marine)
        .font("Helvetica-Bold")
        .fontSize(8.3)
        .text(`Code d'authenticité : ${donnees.codeVerification}`, 46, Y_VERIF + 28, {
          width: LARG_TEXTE_VERIF,
          lineBreak: false,
        });
      pdf
        .fillColor(COULEURS.texteSecondaire)
        .font("Helvetica")
        .fontSize(7.1)
        .text(`Contrôle en ligne : ${donnees.urlVerification}`, 46, Y_VERIF + 41, {
          width: LARG_TEXTE_VERIF,
          lineGap: 1,
        });
    }

    pdf
      .fillColor(COULEURS.texteGris)
      .font("Helvetica")
      .fontSize(7.6)
      .text(
        estRecu
          ? "Ce reçu est associé à une transaction confirmée et enregistrée dans la plateforme."
          : "Document émis au dépôt de la déclaration ; le reçu définitif sera délivré après confirmation.",
        46,
        Y_VERIF + 62,
        { width: LARG_TEXTE_VERIF, lineGap: 1 },
      );

    // Encadré code-barres Code 128 encodant le numéro unique du reçu / de l'accusé
    pdf
      .save()
      .lineWidth(0.8)
      .roundedRect(X_CARTE_CODEBARRE, Y_VERIF - 2, LARG_CARTE_CODEBARRE, H_CARTE_CODEBARRE, 7)
      .fillAndStroke(COULEURS.blanc, COULEURS.bordure)
      .restore();

    pdf
      .fillColor(COULEURS.texteSecondaire)
      .font("Helvetica-Bold")
      .fontSize(6.6)
      .text(
        estRecu ? "CODE-BARRES — ID DU REÇU" : "CODE-BARRES — ID DE L'ACCUSÉ",
        X_CARTE_CODEBARRE,
        Y_VERIF + 6,
        {
          width: LARG_CARTE_CODEBARRE,
          align: "center",
          lineBreak: false,
        },
      );

    dessinerCode128(
      pdf,
      donnees.numero,
      {
        x: X_CARTE_CODEBARRE + 8,
        y: Y_VERIF + 18,
        largeur: LARG_CARTE_CODEBARRE - 16,
        hauteur: 38,
      },
      COULEURS.marine,
    );

    pdf
      .fillColor(COULEURS.marine)
      .font("Courier-Bold")
      .fontSize(7.6)
      .text(donnees.numero, X_CARTE_CODEBARRE, Y_VERIF + 61, {
        width: LARG_CARTE_CODEBARRE,
        align: "center",
        lineBreak: false,
      });

    if (estRecu) {
      const yTampon = Y_VERIF + 88;
      pdf
        .fillColor(COULEURS.texteGris)
        .font("Helvetica-Bold")
        .fontSize(6.8)
        .text("TAMPON ET SIGNATURE DU RESPONSABLE", MARGE_X, yTampon, {
          lineBreak: false,
        });
      pdf
        .save()
        .lineWidth(0.9)
        .dash(3, { space: 3 })
        .roundedRect(MARGE_X, yTampon + 10, 180, 43, 5)
        .stroke(COULEURS.bordure)
        .undash()
        .restore();
    }

    // ─── 7. Pied de page officiel ──────────────────────────────────────────
    const Y_PIED = estRecu ? 795 : 782;
    pdf
      .save()
      .lineWidth(0.7)
      .strokeColor(COULEURS.bordure)
      .moveTo(MARGE_X, Y_PIED)
      .lineTo(MARGE_X + LARGEUR_CONTENU, Y_PIED)
      .stroke()
      .restore();

    pdf
      .fillColor(COULEURS.texteGris)
      .font("Helvetica")
      .fontSize(7.8)
      .text(
        `${donnees.emetteur}  •  Portail de télédéclaration et suivi des paiements fiscaux`,
        MARGE_X,
        Y_PIED + 10,
        { width: LARGEUR_CONTENU, align: "center", lineBreak: false },
      );

    pdf
      .fillColor(COULEURS.texteSecondaire)
      .font("Helvetica-Oblique")
      .fontSize(7.2)
      .text(
        estRecu
          ? "Justificatif électronique généré automatiquement après confirmation du paiement ; vérifiable à l'aide du numéro de reçu et du code d'authenticité."
          : "Accusé électronique de soumission : ce document n'atteste pas l'encaissement effectif des fonds.",
        MARGE_X,
        Y_PIED + 23,
        { width: LARGEUR_CONTENU, align: "center" },
      );

    pdf.end();
  });
}
