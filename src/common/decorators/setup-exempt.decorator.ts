import { SetMetadata } from "@nestjs/common";

/** Marks a route as accessible during the initial setup (provisional password change / profile completion). */
export const SETUP_EXEMPT_KEY = "setupExempt";
export const SetupExempt = () =>
  SetMetadata(SETUP_EXEMPT_KEY, true);
