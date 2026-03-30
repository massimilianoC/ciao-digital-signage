"use client";

import { ArrowRight, Monitor } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function NewScreenPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pairingCode, setPairingCode] = useState("");
  const [screenName, setScreenName] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC", []);

  useEffect(() => {
    const codeFromQuery = searchParams.get("code")?.trim().toUpperCase();
    if (!codeFromQuery) {
      return;
    }

    setPairingCode(codeFromQuery);
  }, [searchParams]);

  const handlePair = async (event: React.FormEvent) => {
    event.preventDefault();

    const normalizedCode = pairingCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!normalizedCode) {
      setError("Pairing code is required");
      return;
    }

    if (!screenName.trim()) {
      setError("Screen name is required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/screens/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: normalizedCode,
          name: screenName.trim(),
          timezone,
          location: location.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Failed to pair screen");
      }

      const payload = (await response.json()) as { screenId: string };
      router.push(`/screens/${payload.screenId}`);
    } catch (pairError) {
      setError(pairError instanceof Error ? pairError.message : "Failed to pair screen");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md p-6">
      <h1 className="mb-6 text-2xl font-bold">Register New Screen</h1>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Monitor className="h-8 w-8 text-muted-foreground" />
            <div>
              <CardTitle>Enter Pairing Code</CardTitle>
              <p className="text-sm text-muted-foreground">
                Open the player screen and enter the displayed code.
              </p>
              <p className="text-xs text-muted-foreground">
                Start from public activation page: <span className="font-mono">/activate</span>
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handlePair} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="pairing-code">Pairing Code</Label>
              <Input
                id="pairing-code"
                value={pairingCode}
                onChange={(event) => setPairingCode(event.target.value.toUpperCase())}
                placeholder="ABC123"
                className="font-mono text-lg tracking-widest uppercase"
                maxLength={12}
                autoFocus
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="screen-name">Screen Name</Label>
              <Input
                id="screen-name"
                value={screenName}
                onChange={(event) => setScreenName(event.target.value)}
                placeholder="Lobby Screen"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="screen-location">Location (optional)</Label>
              <Input
                id="screen-location"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="Ground Floor, Reception"
              />
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? (
                "Pairing..."
              ) : (
                <>
                  <ArrowRight className="h-4 w-4" />
                  Pair Screen
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
