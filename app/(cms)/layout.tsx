import { auth } from "@/lib/auth/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { CmsBreadcrumb } from "@/components/cms/CmsBreadcrumb";
import { CmsSidebar } from "@/components/cms/CmsSidebar";

export default async function CmsLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  // Middleware already handles unauthenticated redirects; this is a safety net
  if (!session) redirect("/login");

  return (
    <div className="flex h-screen bg-background">
      <CmsSidebar />
      <main className="flex-1 overflow-y-auto">
        <header className="border-b border-border px-6 py-3 sticky top-0 bg-background z-10">
          <CmsBreadcrumb />
        </header>
        {children}
      </main>
    </div>
  );
}
