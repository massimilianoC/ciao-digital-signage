"use client";
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
  const { register, handleSubmit, formState: { errors, isSubmitting }, setError } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    const { error } = await signIn.email({ email: data.email, password: data.password });
    if (error) {
      const msg = error.code === "EMAIL_NOT_VERIFIED"
        ? "Please verify your email before logging in. Check your inbox for a verification link."
        : (error.message ?? "Invalid credentials");
      setError("root", { message: msg });
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
