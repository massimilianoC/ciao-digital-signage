"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { io, type Socket } from "socket.io-client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ActivationState = {
  code: string;
  screenId: string;
  expiresInSeconds?: number;
};

type ActivationStatusResponse = {
  status: "pending" | "paired" | "expired";
  paired: boolean;
  screenId: string;
  code?: string;
  token?: string;
  playerUrl?: string;
  expiresInSeconds?: number;
};

const STATUS_POLL_INTERVAL_SECONDS = 5;

function setIntervalSeconds(callback: () => void, seconds: number): number {
  return window.setInterval(callback, seconds * 1000);
}

async function requestActivationCode(): Promise<ActivationState> {
  const response = await fetch("/api/screens/generate-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    throw new Error("Unable to generate pairing code");
  }

  const payload = (await response.json()) as {
    code: string;
    screenId: string;
    expiresInSeconds?: number;
  };
  return {
    code: payload.code,
    screenId: payload.screenId,
    expiresInSeconds: payload.expiresInSeconds,
  };
}

export default function ActivatePage() {
  const router = useRouter();
  const [activation, setActivation] = useState<ActivationState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState<number>(60);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const isBoundarySyncingRef = useRef(false);

  const adminPairUrl = useMemo(() => {
    if (!activation || typeof window === "undefined") {
      return "";
    }
    const origin = window.location.origin;
    return `${origin}/screens/new?code=${encodeURIComponent(activation.code)}`;
  }, [activation]);

  const startActivation = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const nextActivation = await requestActivationCode();
      setActivation(nextActivation);
      setSecondsLeft(nextActivation.expiresInSeconds ?? 60);
    } catch (activationError) {
      setActivation(null);
      setError(
        activationError instanceof Error
          ? activationError.message
          : "Unable to initialize activation",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void startActivation();
  }, [startActivation]);

  useEffect(() => {
    if (!activation) {
      return;
    }

    const tickId = window.setInterval(() => {
      setSecondsLeft((previous) => {
        if (previous <= 0) {
          return 0;
        }

        return previous - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(tickId);
    };
  }, [activation]);

  useEffect(() => {
    if (!activation?.screenId) {
      return;
    }

    const socket: Socket = io("/activation", {
      auth: { screenId: activation.screenId },
      reconnectionDelayMax: 10_000,
    });

    socket.on("activation:paired", (payload: { screenId?: string; token?: string }) => {
      if (!payload?.screenId || !payload?.token) {
        return;
      }

      router.replace(`/player/${payload.screenId}?token=${encodeURIComponent(payload.token)}`);
    });

    return () => {
      socket.disconnect();
    };
  }, [activation?.screenId, router]);

  const pollStatus = useCallback(async () => {
    if (!activation?.screenId) {
      return;
    }

    const screenId = activation.screenId;

    try {
      const response = await fetch(
        `/api/screens/activation-status?screenId=${encodeURIComponent(screenId)}`,
        { cache: "no-store" },
      );

      if (!response.ok) {
        return;
      }

      const status = (await response.json()) as ActivationStatusResponse;

      if (status.status === "paired" && status.token) {
        router.replace(`/player/${status.screenId}?token=${encodeURIComponent(status.token)}`);
        return;
      }

      if (status.status === "pending") {
        if (status.code) {
          const nextCode = status.code;
          setActivation((previous) => {
            if (!previous) {
              return { screenId, code: nextCode };
            }

            if (previous.code === nextCode) {
              return previous;
            }

            return { ...previous, code: nextCode };
          });
        }

        if (typeof status.expiresInSeconds === "number") {
          setSecondsLeft(status.expiresInSeconds);
        }
      }

      if (status.status === "expired") {
        if (!isRegenerating) {
          setIsRegenerating(true);
          try {
            await startActivation();
          } finally {
            setIsRegenerating(false);
          }
        }
      }
    } catch {
      // Keep polling; transient failures are expected in flaky networks.
    }
  }, [activation?.screenId, isRegenerating, router, startActivation]);

  useEffect(() => {
    if (!activation?.screenId) {
      return;
    }

    // First check immediately, then every few seconds so rotated OTPs are reflected quickly.
    void pollStatus();
    const intervalId = setIntervalSeconds(() => {
      void pollStatus();
    }, STATUS_POLL_INTERVAL_SECONDS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activation?.screenId, pollStatus]);

  useEffect(() => {
    if (!activation?.screenId || secondsLeft > 0) {
      return;
    }

    if (isBoundarySyncingRef.current) {
      return;
    }

    isBoundarySyncingRef.current = true;
    void pollStatus().finally(() => {
      isBoundarySyncingRef.current = false;
    });
  }, [activation?.screenId, secondsLeft, pollStatus]);

  const progressPct = Math.max(0, Math.min(100, (secondsLeft / 60) * 100));

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl items-center p-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Activate Player</CardTitle>
          <p className="text-sm text-muted-foreground">
            Keep this page open on the screen device. Pair from the admin app using the code below.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Generating pairing code...</p>
          ) : null}

          {!isLoading && activation ? (
            <div className="rounded-lg border border-border bg-muted/30 p-6 text-center">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Pairing Code</p>
              <p className="mt-2 font-mono text-5xl font-bold tracking-[0.4em]">{activation.code}</p>
              <div className="mt-4">
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-foreground transition-all duration-500"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  OTP updates every 60s. Next rotation in {secondsLeft}s.
                </p>
                {isRegenerating ? (
                  <p className="mt-1 text-xs text-muted-foreground">Refreshing token...</p>
                ) : null}
              </div>
            </div>
          ) : null}

          {activation ? (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Admin pairing URL: <Link className="underline" href={`/screens/new?code=${activation.code}`}>/screens/new?code={activation.code}</Link>
              </p>
              {adminPairUrl ? <p>Full URL: {adminPairUrl}</p> : null}
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex gap-2">
            <Button type="button" onClick={() => void startActivation()}>
              <RefreshCw className="h-4 w-4" />
              Generate New Code
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
