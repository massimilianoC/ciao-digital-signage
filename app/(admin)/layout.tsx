import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/auth";

type SessionUserWithRole = {
  role?: string;
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }

  const role = (session.user as SessionUserWithRole).role;
  if (role !== "super-admin" && role !== "admin") {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="flex items-center justify-between bg-red-700 px-8 py-3 text-white">
        <span className="font-bold">Ciao Infrastructure Admin</span>
        <a href="/dashboard" className="text-sm hover:underline">
          Back to Dashboard
        </a>
      </nav>
      <div className="p-8">{children}</div>
    </div>
  );
}
