import { SetMetadata } from "@nestjs/common";

/**
 * Marque une route comme accessible pendant la configuration initiale
 * (changement de mot de passe provisoire / complétion du profil).
 * Toutes les autres routes authentifiées restent bloquées tant que la
 * configuration n'est pas terminée — côté serveur, par l'intercepteur
 * `ConfigurationInitialeInterceptor`.
 */
export const CONFIGURATION_LIBRE_KEY = "configurationLibre";
export const ConfigurationLibre = () =>
  SetMetadata(CONFIGURATION_LIBRE_KEY, true);
