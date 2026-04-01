import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { admin, organization } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import {
  defaultStatements,
  adminAc,
} from "better-auth/plugins/admin/access";
import { mongoClient } from "@/lib/db/connection";
import nodemailer from "nodemailer";

// ─── Email Transport ─────────────────────────────────────────────────────────
// When SMTP_HOST is set → use real SMTP (production / Mailhog)
// When SMTP_HOST is missing → mock: log email content to console
const hasSmtp = !!process.env.SMTP_HOST;

const realTransport = hasSmtp
  ? nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  })
  : null;

const smtpTransport = {
  sendMail: async (opts: { from: string; to: string; subject: string; text: string; html?: string }) => {
    if (realTransport) {
      return realTransport.sendMail(opts);
    }
    // Console mock — no SMTP server needed
    console.log("\n╔══════════════════════════════════════════════════════╗");
    console.log("║  📧 EMAIL (console mock — no SMTP configured)       ║");
    console.log("╠══════════════════════════════════════════════════════╣");
    console.log(`║  To:      ${opts.to}`);
    console.log(`║  Subject: ${opts.subject}`);
    console.log(`║  Body:    ${opts.text}`);
    console.log("╚══════════════════════════════════════════════════════╝\n");
  },
};

// ─── Access Control ──────────────────────────────────────────────────────────
// Define "super-admin" role with the same permissions as the built-in admin role
const ac = createAccessControl(defaultStatements);
const adminRole = ac.newRole({
  ...adminAc.statements,
});
// super-admin has the same permissions as admin
const superAdminRole = ac.newRole({
  ...adminAc.statements,
});

export const auth = betterAuth({
  database: mongodbAdapter(mongoClient.db(), { client: mongoClient }),
  emailAndPassword: {
    enabled: true,
    // Disable email verification when SMTP is unavailable (e.g. no Mailhog)
    requireEmailVerification: process.env.SMTP_HOST ? true : false,
    sendResetPassword: async ({ user, url }) => {
      await smtpTransport.sendMail({
        from: process.env.SMTP_FROM ?? "noreply@ciao.local",
        to: user.email,
        subject: "Reset your Ciao password",
        text: `Click to reset your password: ${url}`,
        html: `<p>Click to reset your password: <a href="${url}">${url}</a></p>`,
      });
    },
  },
  // emailVerification is the dedicated Better Auth namespace consumed by the
  // standalone /send-verification-email endpoint (authClient.sendVerificationEmail).
  // emailAndPassword.sendVerificationEmail only fires during registration;
  // the resend flow requires this separate entry point.
  emailVerification: {
    sendVerificationEmail: async ({ user, url }: { user: { email: string }; url: string }) => {
      await smtpTransport.sendMail({
        from: process.env.SMTP_FROM ?? "noreply@ciao.local",
        to: user.email,
        subject: "Verify your Ciao email",
        text: `Click to verify your email: ${url}`,
        html: `<p>Click to verify your email: <a href="${url}">${url}</a></p>`,
      });
    },
  },
  plugins: [
    admin({
      // Both "admin" and "super-admin" can perform admin operations
      adminRoles: ["admin", "super-admin"],
      ac: ac,
      roles: {
        admin: adminRole,
        "super-admin": superAdminRole,
      },
    }),
    organization({
      // Alpha self-service onboarding: each new account can own one organization
      allowUserToCreateOrganization: true,
      organizationLimit: 1,
    }),
  ],
});

// Export the type for use in server components and route handlers
export type Session = typeof auth.$Infer.Session;
