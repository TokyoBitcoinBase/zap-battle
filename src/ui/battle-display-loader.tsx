"use client";

import { useEffect, useState, type FormEvent } from "react";
import { BattleDisplay } from "@/src/ui/battle-display";
import type { ZapBattleSession } from "@/src/types";

type SessionResponse = {
  session: ZapBattleSession;
};

export function BattleDisplayLoader({ adminEnabled = false, sessionId }: { adminEnabled?: boolean; sessionId: string }) {
  const [session, setSession] = useState<ZapBattleSession | null>(null);
  const [error, setError] = useState("");
  const [notConfigured, setNotConfigured] = useState(false);
  const [adminAuthRequired, setAdminAuthRequired] = useState(false);
  const [adminTokenDraft, setAdminTokenDraft] = useState("");
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    if (adminAuthRequired) return;
    let cancelled = false;
    async function loadSession() {
      try {
        const adminToken = readStoredAdminToken(sessionId);
        setAdminTokenDraft(adminToken);
        const response = await fetch(`/api/zap-live/sessions/${encodeURIComponent(sessionId)}${adminEnabled ? "?create=1" : ""}`, {
          cache: "no-store",
          headers: adminEnabled ? adminHeaders(adminToken) : undefined
        });
        if (response.status === 401 && adminEnabled) {
          if (!cancelled) {
            setAdminAuthRequired(true);
            setError("");
            setSession(null);
          }
          return;
        }
        if (response.status === 404) {
          if (!cancelled) setNotConfigured(true);
          return;
        }
        if (!response.ok) throw new Error("セッションを読み込めませんでした。");
        const json = await response.json() as SessionResponse;
        if (!cancelled) {
          setAdminAuthRequired(false);
          setError("");
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
  }, [adminAuthRequired, adminEnabled, reloadNonce, sessionId]);

  function submitAdminToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    writeStoredAdminToken(adminTokenDraft.trim(), sessionId);
    setAdminAuthRequired(false);
    setReloadNonce((current) => current + 1);
  }

  if (adminAuthRequired) {
    return (
      <main className="page">
        <section className="topbar auth-panel">
          <div className="title">
            <h1>Zap Battle</h1>
            <p>Admin Tokenが必要です。</p>
          </div>
          <form className="auth-form" onSubmit={submitAdminToken}>
            <label className="field">
              <span>Admin token</span>
              <input
                autoFocus
                value={adminTokenDraft}
                onChange={(event) => setAdminTokenDraft(event.target.value)}
                placeholder="Enter admin token"
                type="password"
              />
            </label>
            <button className="button primary" type="submit">
              Open admin display
            </button>
          </form>
        </section>
      </main>
    );
  }

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

function readStoredAdminToken(sessionId?: string): string {
  const keys = [
    ...(sessionId ? [adminTokenStorageKey(sessionId)] : []),
    globalAdminTokenStorageKey()
  ];
  for (const key of keys) {
    const value = sessionStorage.getItem(key) ?? localStorage.getItem(key);
    if (value) return value;
  }
  return "";
}

function writeStoredAdminToken(adminToken: string, sessionId?: string): void {
  const keys = [
    ...(sessionId ? [adminTokenStorageKey(sessionId)] : []),
    globalAdminTokenStorageKey()
  ];
  keys.forEach((key) => {
    sessionStorage.setItem(key, adminToken);
    localStorage.setItem(key, adminToken);
  });
}

function globalAdminTokenStorageKey(): string {
  return "zap-battle:admin-token";
}

function adminTokenStorageKey(sessionId: string): string {
  return `zap-battle:admin-token:${sessionId}`;
}
