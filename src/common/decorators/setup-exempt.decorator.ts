import { SetMetadata } from "@nestjs/common";

/**
 * Marks a route as accessible during the initial setup
 * (provisional password change / profile completion).
 * Every other authenticated route stays blocked until the setup is
 * finished — server-side, through the `InitialSetupInterceptor`.
 */
export const SETUP_EXEMPT_KEY = "setupExempt";
export const SetupExempt = () =>
  SetMetadata(SETUP_EXEMPT_KEY, true);
