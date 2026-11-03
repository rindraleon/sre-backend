export const DEFAULT_DOCUMENT_ISSUER =
  "SRE — Service Régional des Entreprises";

const LEGACY_DEMO_ISSUER_PATTERN =
  /^(sre\s*[-—–]\s*)?service\s+(de\s+)?d[ée]monstration/i;

const SRE_ISSUER_VARIANT_PATTERN = /^sre\b.*service\s+r[ée]gional/i;

/**
 * Garantit que l'émetteur imprimé sur les documents officiels est toujours
 * l'identité du Service Régional des Entreprises. Les documents historiques
 * peuvent contenir un libellé de démonstration ou une variante mal accentuée :
 * ils sont normalisés au moment de l'affichage et de la génération du PDF.
 */
export function normalizeDocumentIssuer(value?: string | null): string {
  const cleaned = (value ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) return DEFAULT_DOCUMENT_ISSUER;
  if (
    LEGACY_DEMO_ISSUER_PATTERN.test(cleaned) ||
    SRE_ISSUER_VARIANT_PATTERN.test(cleaned)
  ) {
    return DEFAULT_DOCUMENT_ISSUER;
  }
  return cleaned;
}
