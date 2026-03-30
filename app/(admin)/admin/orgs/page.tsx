"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Org = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  quota: {
    maxScreens: number;
    maxStorageBytes: number;
  };
  createdAt: string;
};

export default function OrgsPage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newOrg, setNewOrg] = useState({ name: "", slug: "" });
  const [error, setError] = useState<string | null>(null);

  const totalStorageGb = useMemo(
    () =>
      orgs.reduce((accumulator, organization) => {
        return accumulator + organization.quota.maxStorageBytes;
      }, 0) /
      1_073_741_824,
    [orgs],
  );

  const loadOrgs = useCallback(async () => {
    setLoading(true);
    setError(null);

    const response = await fetch("/api/orgs");

    if (!response.ok) {
      setLoading(false);
      setError("Failed to load organizations");
      return;
    }

    const payload = (await response.json()) as Org[];
    setOrgs(payload);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadOrgs();
  }, [loadOrgs]);

  const createOrg = async () => {
    setError(null);

    const response = await fetch("/api/orgs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newOrg),
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: unknown };
      setError(typeof payload.error === "string" ? payload.error : "Create organization failed");
      return;
    }

    setNewOrg({ name: "", slug: "" });
    setCreating(false);
    await loadOrgs();
  };

  const toggleStatus = async (org: Org) => {
    await fetch("/api/orgs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orgId: org.id,
        action: org.status === "active" ? "suspend" : "reactivate",
      }),
    });
    await loadOrgs();
  };

  const deleteOrg = async (org: Org) => {
    const confirmed = window.confirm(`Delete organization "${org.name}"? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    await fetch("/api/orgs", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId: org.id }),
    });

    await loadOrgs();
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Organizations</h1>
          <p className="text-sm text-muted-foreground">
            {orgs.length} total orgs, {totalStorageGb.toFixed(1)} GB allocated
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          + New Organization
        </button>
      </div>

      {creating && (
        <div className="mb-6 space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm">
          <h2 className="font-bold">New Organization</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Name</label>
              <input
                value={newOrg.name}
                onChange={(event) => {
                  setNewOrg((previous) => ({ ...previous, name: event.target.value }));
                }}
                className="w-full rounded border border-border bg-background px-3 py-2"
                placeholder="Acme Corp"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Slug</label>
              <input
                value={newOrg.slug}
                onChange={(event) => {
                  setNewOrg((previous) => ({ ...previous, slug: event.target.value }));
                }}
                className="w-full rounded border border-border bg-background px-3 py-2"
                placeholder="acme-corp"
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={createOrg}
              className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              Create
            </button>
            <button
              onClick={() => setCreating(false)}
              className="rounded border border-border px-4 py-2 hover:bg-accent"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <table className="w-full">
            <thead className="border-b border-border bg-muted">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-muted-foreground">Name / Slug</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-muted-foreground">Status</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-muted-foreground">Quota</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orgs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-400">
                    No organizations yet
                  </td>
                </tr>
              )}

              {orgs.map((org) => (
                <tr key={org.id}>
                  <td className="px-6 py-4">
                    <p className="font-medium">{org.name}</p>
                    <p className="text-sm text-muted-foreground">{org.slug}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex rounded px-2 py-1 text-xs font-medium ${
                        org.status === "active" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                      }`}
                    >
                      {org.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {org.quota.maxScreens} screens · {Math.round(org.quota.maxStorageBytes / 1_073_741_824)} GB
                  </td>
                  <td className="space-x-2 px-6 py-4">
                    <button
                      onClick={() => toggleStatus(org)}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {org.status === "active" ? "Suspend" : "Reactivate"}
                    </button>
                    <button
                      onClick={() => deleteOrg(org)}
                      className="text-sm text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
