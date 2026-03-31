"use client";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { authClient, signUp } from "@/lib/auth/auth-client";
import { CiaoLogo } from "@/components/ui/CiaoLogo";

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  organizationName: z.string().min(2, "Organization name must be at least 2 characters"),
  email: z.string().email("Valid email required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine(d => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});
type FormData = z.infer<typeof schema>;

function normalizeBaseName(input: string): string {
  const trimmed = input.trim().toLowerCase();
  const alnum = trimmed.replace(/[^a-z0-9\s-]/g, "");
  const compact = alnum.replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return compact || "org";
}

function random4(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export default function RegisterPage() {
  const [registered, setRegistered] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting }, setError } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    const { error } = await signUp.email({ email: data.email, password: data.password, name: data.name });
    if (error) {
      setError("root", { message: error.message ?? "Registration failed" });
      return;
    }

    const base = normalizeBaseName(data.organizationName);
    let orgCreated = false;
    let lastOrgError: string | null = null;

    // Retry with different slug suffixes in case the slug already exists.
    for (let attempt = 0; attempt < 4 && !orgCreated; attempt++) {
      const suffix = random4();
      const orgName = data.organizationName.trim();
      const slug = `${base}-${suffix}`;

      const { error: orgError } = await authClient.organization.create({
        name: orgName,
        slug,
      });

      if (!orgError) {
        orgCreated = true;
        break;
      }

      lastOrgError = orgError.message ?? "Organization creation failed";
    }

    if (!orgCreated) {
      setError("root", {
        message: `Account created, but organization setup failed. Please contact support. (${lastOrgError ?? "unknown error"})`,
      });
      return;
    }

    try {
      const { data: orgs } = await authClient.organization.list();
      if (orgs && orgs.length > 0) {
        await authClient.organization.setActive({ organizationId: orgs[0].id });
      }
    } catch {
      // Non-blocking: organization is created and member role is already assigned.
    }

    setRegistered(true);
  };

  if (registered) return (
    <div className="rounded-lg border border-border bg-card p-8 text-center text-card-foreground shadow-sm">
      <h1 className="text-xl font-bold mb-2">Registration successful!</h1>
      <p className="text-muted-foreground">Check your email to verify your account.</p>
      {process.env.NODE_ENV !== "production" && (
        <p className="mt-2 text-sm text-muted-foreground">In dev, check Mailhog at <a href="http://localhost:8025" className="text-blue-600 hover:underline">localhost:8025</a></p>
      )}
      <p className="mt-4"><a href="/login" className="text-blue-600 hover:underline">Go to login</a></p>
    </div>
  );

  return (
    <div className="rounded-lg border border-border bg-card p-8 text-card-foreground shadow-sm">
      <div className="flex justify-center mb-6">
        <CiaoLogo width={224} variant="auto" />
      </div>
      <h1 className="text-2xl font-bold mb-6">Create account</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-1">Full Name</label>
          <input {...register("name")} id="name" type="text" className="w-full rounded border border-border bg-background px-3 py-2" />
          {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>}
        </div>
        <div>
          <label htmlFor="organizationName" className="block text-sm font-medium mb-1">Organization Name</label>
          <input {...register("organizationName")} id="organizationName" type="text" className="w-full rounded border border-border bg-background px-3 py-2" placeholder="Your company or project name" />
          {errors.organizationName && <p className="text-red-500 text-sm mt-1">{errors.organizationName.message}</p>}
        </div>
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
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium mb-1">Confirm Password</label>
          <input {...register("confirmPassword")} id="confirmPassword" type="password" className="w-full rounded border border-border bg-background px-3 py-2" />
          {errors.confirmPassword && <p className="text-red-500 text-sm mt-1">{errors.confirmPassword.message}</p>}
        </div>
        {errors.root && <p className="text-red-500 text-sm">{errors.root.message}</p>}
        <button type="submit" disabled={isSubmitting} className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50">
          {isSubmitting ? "Creating account..." : "Create account"}
        </button>
      </form>
      <p className="mt-4 text-sm text-center">
        <a href="/login" className="text-blue-600 hover:underline">Already have an account? Sign in</a>
      </p>
    </div>
  );
}
