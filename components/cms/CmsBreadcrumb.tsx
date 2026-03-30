"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Crumb = {
  href: string;
  label: string;
};

const segmentLabelMap: Record<string, string> = {
  dashboard: "Dashboard",
  content: "Content Library",
  upload: "Upload",
  playlists: "Playlists",
  schedules: "Schedules",
  screens: "Screens",
  webapps: "Apps",
  operations: "Operations",
  "google-calendar": "Google Calendar",
  "wordpress-link": "WordPress Link",
  sources: "Sorgenti",
  queue: "Eliminacode",
  screen: "Screen",
  group: "Gruppo",
  org: "Organizzazione",
  new: "Nuovo",
};

function isOpaqueIdentifier(segment: string): boolean {
  return /^[a-f0-9]{24}$/i.test(segment) || /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(segment);
}

function humanizeSegment(segment: string): string {
  return segment
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function resolveSegmentLabel(segment: string, parent?: string): string {
  if (segmentLabelMap[segment]) {
    return segmentLabelMap[segment];
  }

  if (isOpaqueIdentifier(segment)) {
    if (parent === "screens") return "Dettaglio screen";
    if (parent === "playlists") return "Dettaglio playlist";
    if (parent === "webapps") return "Istanza";
    if (parent === "schedules") return "Dettaglio schedule";
    return "Dettaglio";
  }

  return humanizeSegment(decodeURIComponent(segment));
}

function buildBreadcrumbs(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: Crumb[] = [{ href: "/dashboard", label: "Dashboard" }];

  if (segments.length === 0) {
    return crumbs;
  }

  let href = "";
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    href += `/${segment}`;

    if (href === "/dashboard") {
      continue;
    }

    const parent = i > 0 ? segments[i - 1] : undefined;
    crumbs.push({
      href,
      label: resolveSegmentLabel(segment, parent),
    });
  }

  return crumbs;
}

export function CmsBreadcrumb() {
  const pathname = usePathname();
  const crumbs = buildBreadcrumbs(pathname);
  const backTarget = crumbs.length > 1 ? crumbs[crumbs.length - 2].href : null;

  return (
    <div className="min-w-0 space-y-1">
      {backTarget ? (
        <Link
          href={backTarget}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Indietro
        </Link>
      ) : null}

      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <div key={crumb.href} className="flex min-w-0 items-center gap-1">
              {isLast ? (
                <span className="truncate font-medium text-foreground">{crumb.label}</span>
              ) : (
                <Link href={crumb.href} className="truncate transition-colors hover:text-foreground">
                  {crumb.label}
                </Link>
              )}

              {!isLast ? <ChevronRight className="h-3.5 w-3.5 shrink-0" /> : null}
            </div>
          );
        })}
      </nav>
    </div>
  );
}
