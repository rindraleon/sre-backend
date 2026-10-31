/**
 * Code 128 (sous-ensemble B) : encodage et tracé du code-barres dans un PDF.
 *
 * Module autonome, sans dépendance externe : la table des 107 symboles est la
 * table officielle du code 128 (largeurs de barres et d'espaces, en modules).
 * Le sous-ensemble B couvre les caractères ASCII 32 à 126, ce qui suffit aux
 * numéros de reçus (`SRE-REC-2026-…`) et aux références de paiement.
 */

/** Largeurs des 11 modules de chaque symbole (indices 0 à 106). */
const MODELES: readonly string[] = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213",
  "122312", "132212", "221213", "221312", "231212", "112232", "122132",
  "122231", "113222", "123122", "123221", "223211", "221132", "221231",
  "213212", "223112", "312131", "311222", "321122", "321221", "312212",
  "322112", "322211", "212123", "212321", "232121", "111323", "131123",
  "131321", "112313", "132113", "132311", "211313", "231113", "231311",
  "112133", "112331", "132131", "113123", "113321", "133121", "313121",
  "211331", "231131", "213113", "213311", "213131", "311123", "311321",
  "331121", "312113", "312311", "332111", "314111", "221411", "431111",
  "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114",
  "413111", "241112", "134111", "111242", "121142", "121241", "114212",
  "124112", "124211", "411212", "421112", "421211", "212141", "214121",
  "412121", "111143", "111341", "131141", "114113", "114311", "411113",
  "411311", "113141", "114131", "311141", "411131", "211412", "211214",
  "211232", "2331112",
];

const DEBUT_B = 104;
const ARRET = 106;
const QUIET_ZONE = 10; // modules de marge silencieuse de chaque côté

export interface DessinCode128 {
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
}

/** Valeurs code 128 (début, données, contrôle, arrêt) pour un texte ASCII. */
export function valeursCode128(texte: string): number[] {
  if (!texte.length) {
    throw new Error("Code 128 : texte vide.");
  }
  const donnees = [...texte].map((caractere) => {
    const code = caractere.charCodeAt(0);
    if (code < 32 || code > 126) {
      throw new Error(
        `Code 128 : caractère non encodable (${JSON.stringify(caractere)}).`,
      );
    }
    return code - 32;
  });
  const controle =
    (DEBUT_B + donnees.reduce((somme, valeur, index) => somme + valeur * (index + 1), 0)) %
    103;
  return [DEBUT_B, ...donnees, controle, ARRET];
}

/** Nombre total de modules occupés par la séquence, marges silencieuses exclues. */
export function modulesCode128(valeurs: number[]): number {
  return valeurs.reduce(
    (total, valeur) => total + [...MODELES[valeur]].reduce((s, d) => s + Number(d), 0),
    0,
  );
}

/**
 * Tracé du code-barres. `largeur` inclut les marges silencieuses ; la hauteur
 * correspond aux barres seules.
 */
export function dessinerCode128(
  // Type minimal pour éviter de dépendre des types de pdfkit dans ce module.
  pdf: { rect: (x: number, y: number, w: number, h: number) => { fill: (c: string) => void } },
  texte: string,
  { x, y, largeur, hauteur }: DessinCode128,
  couleur = "#0f2a42",
): void {
  const valeurs = valeursCode128(texte);
  const modules = modulesCode128(valeurs);
  const module = largeur / (modules + QUIET_ZONE * 2);
  let curseur = x + QUIET_ZONE * module;

  for (const valeur of valeurs) {
    const modele = MODELES[valeur];
    for (let index = 0; index < modele.length; index += 1) {
      const largeurBarre = Number(modele[index]) * module;
      if (index % 2 === 0) {
        pdf.rect(curseur, y, largeurBarre, hauteur).fill(couleur);
      }
      curseur += largeurBarre;
    }
  }
}
