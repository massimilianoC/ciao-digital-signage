"use client";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { signIn, authClient } from "@/lib/auth/auth-client";
import { CiaoLogo } from "@/components/ui/CiaoLogo";

const schema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resendStatus, setResendStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const { register, handleSubmit, formState: { errors, isSubmitting }, setError } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const handleResend = async () => {
    if (!unverifiedEmail) return;
    setResendStatus("sending");
    const { error } = await authClient.sendVerificationEmail({
      email: unverifiedEmail,
      callbackURL: "/dashboard",
    });
    setResendStatus(error ? "error" : "sent");
  };

  const onSubmit = async (data: FormData) => {
    setUnverifiedEmail(null);
    setResendStatus("idle");
    const { error } = await signIn.email({ email: data.email, password: data.password });
    if (error) {
      if (error.code === "EMAIL_NOT_VERIFIED") {
        setUnverifiedEmail(data.email);
        setError("root", { message: "Please verify your email before logging in." });
      } else {
        setError("root", { message: error.message ?? "Invalid credentials" });
      }
      return;
    }

    // Activate the user's first organization so API routes get an orgId
    try {
      const { data: orgs } = await authClient.organization.list();
      if (orgs && orgs.length > 0) {
        await authClient.organization.setActive({ organizationId: orgs[0].id });
      }
    } catch {
      // Non-blocking — org activation may fail if user has no orgs yet
      console.warn("Could not activate organization after login");
    }

    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div className="rounded-lg border border-border bg-card p-8 text-card-foreground shadow-sm">
      <div className="flex justify-center mb-6">
        <CiaoLogo width={224} variant="auto" />
      </div>
      <h1 className="text-2xl font-bold mb-6">Sign in to Ciao Digital Signage</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-1">Email</label>
          <input {...register("email")} id="email" type="email" className="w-full rounded border border-border bg-background px-3 py-2" />
          {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>}
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium mb-1">Password</label>
          <input {...register("password")} id="password" type="password" className="w-full rounded border border-border bg-background px-3 py-2" />
          {errors.password && <p className="text-red-500 text-sm mt-1">{errors.password.message}</p>}
        </div>
        {errors.root && <p className="text-red-500 text-sm">{errors.root.message}</p>}
        {unverifiedEmail && (
          <div className="rounded border border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-700 px-3 py-2 text-sm">
            <p className="text-amber-800 dark:text-amber-300 mb-2">
              Didn&apos;t receive the verification email?
            </p>
            {resendStatus === "sent" ? (
              <p className="text-green-700 dark:text-green-400 font-medium">Verification email sent — check your inbox.</p>
            ) : resendStatus === "error" ? (
              <p className="text-red-600 dark:text-red-400">Failed to send. Try again later.</p>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                disabled={resendStatus === "sending"}
                className="text-blue-600 hover:underline disabled:opacity-50"
              >
                {resendStatus === "sending" ? "Sending…" : "Resend verification email"}
              </button>
            )}
          </div>
        )}
        <button type="submit" disabled={isSubmitting} className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50">
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
      <p className="mt-4 text-sm text-center">
        <a href="/forgot-password" className="text-blue-600 hover:underline">Forgot password?</a>
        {" · "}
        <a href="/register" className="text-blue-600 hover:underline">Create account</a>
      </p>
    </div>
  );
}
