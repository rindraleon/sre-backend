/**
 * Montant en lettres (français), utilisé sur les reçus et accusés.
 * Gère les unités, dizaines, centaines, milliers, millions et milliards,
 * avec les règles françaises (soixante-dix, quatre-vingts, quatre-vingt-onze…).
 */

const UNITES = [
  "zéro",
  "un",
  "deux",
  "trois",
  "quatre",
  "cinq",
  "six",
  "sept",
  "huit",
  "neuf",
  "dix",
  "onze",
  "douze",
  "treize",
  "quatorze",
  "quinze",
  "seize",
];

const DIZAINES: Record<number, string> = {
  20: "vingt",
  30: "trente",
  40: "quarante",
  50: "cinquante",
  60: "soixante",
  80: "quatre-vingt",
};

/**
 * `accord` active les pluriels finaux (« deux cents », « quatre-vingts ») :
 * ils disparaissent quand un autre numéral suit (« deux cent mille »).
 */
function centaineEnLettres(nombre: number, accord = true): string {
  if (nombre < 17) return UNITES[nombre];
  if (nombre < 20) return `dix-${UNITES[nombre - 10]}`;
  if (nombre < 70) {
    const dizaine = Math.floor(nombre / 10) * 10;
    const unite = nombre % 10;
    if (unite === 0) return DIZAINES[dizaine];
    if (unite === 1) return `${DIZAINES[dizaine]}-et-un`;
    return `${DIZAINES[dizaine]}-${UNITES[unite]}`;
  }
  if (nombre < 80) {
    const reste = nombre - 60;
    return reste === 11 ? "soixante-et-onze" : `soixante-${centaineEnLettres(reste, false)}`;
  }
  if (nombre < 100) {
    const reste = nombre - 80;
    if (reste === 0) return accord ? "quatre-vingts" : "quatre-vingt";
    return `quatre-vingt-${centaineEnLettres(reste, false)}`;
  }
  const centaines = Math.floor(nombre / 100);
  const reste = nombre % 100;
  if (centaines === 1) {
    return reste === 0 ? "cent" : `cent ${centaineEnLettres(reste, false)}`;
  }
  const prefixe = `${UNITES[centaines]} cent`;
  if (reste === 0) return accord ? `${prefixe}s` : prefixe;
  return `${prefixe} ${centaineEnLettres(reste, false)}`;
}

/** 0 à 999 999 999 999. */
export function nombreEnLettres(valeur: number): string {
  const nombre = Math.floor(Math.abs(valeur));
  if (nombre === 0) return "zéro";
  if (nombre >= 1_000_000_000_000) return nombre.toLocaleString("fr-FR");

  const tranches: Array<[number, string, string]> = [
    [1_000_000_000, "milliard", "milliards"],
    [1_000_000, "million", "millions"],
    [1_000, "mille", "mille"],
  ];

  let reste = nombre;
  const morceaux: string[] = [];
  for (const [poids, singulier, pluriel] of tranches) {
    const quantite = Math.floor(reste / poids);
    if (quantite === 0) continue;
    reste %= poids;
    const quantiteEnLettres = centaineEnLettres(quantite, false);
    if (poids === 1_000) {
      // « mille » est invariable et ne prend jamais « un ».
      morceaux.push(quantite === 1 ? singulier : `${quantiteEnLettres} ${singulier}`);
    } else {
      morceaux.push(`${quantiteEnLettres} ${quantite > 1 ? pluriel : singulier}`);
    }
  }
  if (reste > 0) morceaux.push(centaineEnLettres(reste));
  return morceaux.join(" ");
}

/** « 2 500 000 MGA » → « Deux millions cinq cent mille ariary ». */
export function montantEnLettres(montant: number, devise = "MGA"): string {
  const unites: Record<string, string> = {
    MGA: "ariary",
    EUR: "euros",
    USD: "dollars",
  };
  const valeur = Math.round(montant);
  const enLettres = nombreEnLettres(valeur);
  const phrase = `${enLettres} ${unites[devise] ?? devise.toLowerCase()}`;
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}
