"use client";

import { useEffect, useState } from "react";
import { BattleDisplay } from "@/src/ui/battle-display";
import type { ZapBattleSession } from "@/src/types";

type SessionResponse = {
  session: ZapBattleSession;
};

export function BattleDisplayLoader({ adminEnabled = false, sessionId }: { adminEnabled?: boolean; sessionId: string }) {
  const [session, setSession] = useState<ZapBattleSession | null>(null);
  const [error, setError] = useState("");
  const [notConfigured, setNotConfigured] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadSession() {
      try {
        const adminToken = sessionStorage.getItem(adminTokenStorageKey(sessionId)) ?? sessionStorage.getItem(globalAdminTokenStorageKey()) ?? "";
        const response = await fetch(`/api/zap-live/sessions/${encodeURIComponent(sessionId)}${adminEnabled ? "?create=1" : ""}`, {
          cache: "no-store",
          headers: adminEnabled ? adminHeaders(adminToken) : undefined
        });
        if (response.status === 404) {
          if (!cancelled) setNotConfigured(true);
          return;
        }
        if (!response.ok) throw new Error("セッションを読み込めませんでした。");
        const json = await response.json() as SessionResponse;
        if (!cancelled) {
          setNotConfigured(false);
          setSession(json.session);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "セッションを読み込めませんでした。");
      }
    }
    void loadSession();
    const timer = window.setInterval(loadSession, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [sessionId]);

  if (error) {
    return (
      <main className="page">
        <section className="topbar">
          <div className="title">
            <h1>Zap Battle</h1>
            <p>{error}</p>
          </div>
        </section>
      </main>
    );
  }

  if (!session) {
    if (notConfigured) {
      return (
        <main className="page">
          <section className="topbar">
            <div className="title">
              <h1>Zap Battle</h1>
              <p>Battle not configured. Open the operator display from the top page first.</p>
            </div>
          </section>
        </main>
      );
    }
    return (
      <main className="page">
        <section className="topbar">
          <div className="title">
            <h1>Zap Battle</h1>
            <p>Loading session...</p>
          </div>
        </section>
      </main>
    );
  }

  return <BattleDisplay adminEnabled={adminEnabled} onSessionChange={setSession} session={session} />;
}

function adminHeaders(adminToken: string): HeadersInit {
  return {
    ...(adminToken.trim() ? { "x-admin-token": adminToken.trim() } : {})
  };
}

function globalAdminTokenStorageKey(): string {
  return "zap-battle:admin-token";
}

function adminTokenStorageKey(sessionId: string): string {
  return `zap-battle:admin-token:${sessionId}`;
}
