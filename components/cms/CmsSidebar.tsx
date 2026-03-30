"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppWindow, BarChart3, Calendar, Eye, LayoutTemplate, ListVideo, Monitor, RadioTower, Upload, Users } from "lucide-react";

import LogoutButton from "@/components/logout-button";
import { CiaoLogo } from "@/components/ui/CiaoLogo";

const activeNavItems = [
  { href: "/content", label: "Content Library", icon: Upload },
  { href: "/playlists", label: "Playlists", icon: ListVideo },
  { href: "/layouts", label: "Layout Compositi", icon: LayoutTemplate },
  { href: "/schedules", label: "Schedules", icon: Calendar },
  { href: "/screens", label: "Screens", icon: Monitor },
  { href: "/webapps", label: "Apps", icon: AppWindow },
  { href: "/operations", label: "Operations", icon: RadioTower },
] as const;

const comingSoonItems = [
  { label: "User Management", icon: Users, hint: "Planned in roadmap", dependency: "RBAC policies" },
  { label: "Eagle Eye", icon: Eye, hint: "Monitoring suite planned", dependency: "Player telemetry stream" },
  { label: "Statistics", icon: BarChart3, hint: "Analytics dashboard planned", dependency: "Data pipeline" },
] as const;

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function CmsSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r border-border bg-card shrink-0 flex flex-col">
      <div className="p-4 border-b border-border">
        <CiaoLogo width={156} variant="auto" align="left" />
      </div>

      <nav className="p-3 space-y-1 flex-1">
        {activeNavItems.map((item) => {
          const Icon = item.icon;
          const active = isActivePath(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm transition-colors ${
                active
                  ? "bg-accent text-accent-foreground font-medium"
                  : "hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}

        <div className="pt-4">
          <p className="px-4 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Coming soon</p>
          {comingSoonItems.map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.label}
                type="button"
                disabled
                title={item.hint}
                className="w-full rounded-md px-4 py-2 text-sm text-muted-foreground opacity-55 cursor-not-allowed text-left"
              >
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                  <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide">Coming soon</span>
                </span>
                <span className="mt-1 block text-[10px]">Dependency: {item.dependency}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <div className="border-t border-border p-3">
        <LogoutButton />
      </div>
    </aside>
  );
}
