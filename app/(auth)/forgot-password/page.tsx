"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { authClient } from "@/lib/auth/auth-client";
import { CiaoLogo } from "@/components/ui/CiaoLogo";

const schema = z.object({ email: z.string().email() });
type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting }, setError } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    const { error } = await authClient.requestPasswordReset({
      email: data.email,
      redirectTo: "/reset-password",
    });
    if (error) {
      setError("root", { message: error.message ?? "Failed to send reset email" });
      return;
    }
    setSent(true);
  };

  if (sent) return (
    <div className="rounded-lg border border-border bg-card p-8 text-center text-card-foreground shadow-sm">
      <h1 className="text-xl font-bold mb-2">Check your email</h1>
      <p className="text-muted-foreground">A password reset link has been sent. Check Mailhog at <a href="http://localhost:8025" className="text-blue-600">localhost:8025</a> in dev.</p>
    </div>
  );

  return (
    <div className="rounded-lg border border-border bg-card p-8 text-card-foreground shadow-sm">
      <div className="flex justify-center mb-6">
        <CiaoLogo width={224} variant="auto" />
      </div>
      <h1 className="text-2xl font-bold mb-6">Forgot password</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input {...register("email")} type="email" className="w-full rounded border border-border bg-background px-3 py-2" />
          {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>}
        </div>
        {errors.root && <p className="text-red-500 text-sm">{errors.root.message}</p>}
        <button type="submit" disabled={isSubmitting} className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50">
          {isSubmitting ? "Sending..." : "Send reset link"}
        </button>
      </form>
    </div>
  );
}
