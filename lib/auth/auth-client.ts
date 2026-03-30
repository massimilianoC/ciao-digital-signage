import { createAuthClient } from "better-auth/react";
import { organizationClient, adminClient } from "better-auth/client/plugins";

function resolveAuthBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (envUrl) return envUrl;

  // Fallback to the actual browser origin to avoid port/config drift in dev.
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  return "http://localhost:3100";
}

export const authClient = createAuthClient({
  baseURL: resolveAuthBaseUrl(),
  plugins: [
    organizationClient(),
    adminClient(),
  ],
});

// Destructure for convenient named imports elsewhere in the app
export const {
  signIn,
  signUp,
  signOut,
  useSession,
  useActiveOrganization,
} = authClient;
