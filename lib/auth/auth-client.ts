import { createAuthClient } from "better-auth/react";
import { organizationClient, adminClient } from "better-auth/client/plugins";

function resolveAuthBaseUrl(): string {
  // Browser: always use the actual origin — avoids baked-in localhost URLs in
  // production bundles when NEXT_PUBLIC_APP_URL was set to localhost at build time.
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  // SSR context: use the configured env var (or localhost for local dev).
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3100";
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
