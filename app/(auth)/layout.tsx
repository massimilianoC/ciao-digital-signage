import { getSessionAndOrg } from "@/lib/api-utils";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const authed = await getSessionAndOrg(await headers());
  if (authed) redirect("/dashboard");
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
