import { headers } from "next/headers";
import Link from "next/link";
import { LayoutTemplate, Plus } from "lucide-react";

import { getSessionAndOrg } from "@/lib/api-utils";
import { connectDB } from "@/lib/db/connection";
import { CompositeLayoutModel, type ICompositeLayout } from "@/lib/db/models/CompositeLayout";

interface LayoutCardData {
  _id: string;
  name: string;
  status: "active" | "suspended";
  zoneCount: number;
  resolution: { width: number; height: number };
  updatedAt: string;
}

export default async function LayoutsPage() {
  let layouts: LayoutCardData[] = [];

  try {
    const authed = await getSessionAndOrg(await headers());
    const orgId = authed?.orgId;

    if (orgId) {
      await connectDB();
      const records = await CompositeLayoutModel.find({ orgId, status: "active" })
        .sort({ updatedAt: -1 })
        .lean();

      layouts = records.map((record: ICompositeLayout) => ({
        _id: record._id.toString(),
        name: record.name,
        status: record.status,
        zoneCount: record.zones.length,
        resolution: record.resolution,
        updatedAt: record.updatedAt.toISOString(),
      }));
    }
  } catch {
    layouts = [];
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Layout Compositi</h1>
        <Link
          href="/layouts/new"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nuovo Layout
        </Link>
      </div>

      {layouts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <LayoutTemplate className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground text-lg font-medium">Nessun layout creato</p>
          <p className="text-muted-foreground text-sm mt-1">
            Crea un layout composito per definire zone multiple sullo schermo.
          </p>
          <Link
            href="/layouts/new"
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Crea il primo layout
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {layouts.map((layout) => (
            <Link
              key={layout._id}
              href={`/layouts/${layout._id}`}
              className="group block rounded-lg border border-border bg-card p-4 hover:border-primary/50 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <LayoutTemplate className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="font-medium text-sm truncate">{layout.name}</span>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {layout.zoneCount} {layout.zoneCount === 1 ? "zona" : "zone"}
                </span>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {layout.resolution.width}×{layout.resolution.height}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Aggiornato {new Date(layout.updatedAt).toLocaleDateString("it-IT")}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
