"use client";

import { useEffect, useState, type FormEvent } from "react";
import { readBrowserStorage, writeBrowserStorage } from "@/src/browser-storage";
import { BattleDisplay } from "@/src/ui/battle-display";
import type { ZapBattleSession } from "@/src/types";

type SessionResponse = {
  session: ZapBattleSession;
};

export function BattleDisplayLoader({
  adminEnabled = false,
  createEnabled = false,
  sessionId
}: {
  adminEnabled?: boolean;
  createEnabled?: boolean;
  sessionId: string;
}) {
  const [session, setSession] = useState<ZapBattleSession | null>(null);
  const [error, setError] = useState("");
  const [notConfigured, setNotConfigured] = useState(false);
  const [adminAuthRequired, setAdminAuthRequired] = useState(false);
  const [adminTokenDraft, setAdminTokenDraft] = useState("");
  const [deactivationStatus, setDeactivationStatus] = useState("");
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    if (adminAuthRequired || notConfigured) return;
    let cancelled = false;
    let mayCreate = adminEnabled && createEnabled;
    async function loadSession() {
      try {
        const adminToken = readStoredAdminToken(sessionId);
        setAdminTokenDraft(adminToken);
        const shouldCreate = mayCreate;
        const response = await fetch(`/api/zap-live/sessions/${encodeURIComponent(sessionId)}${shouldCreate ? "?create=1" : ""}`, {
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
          if (!cancelled) {
            setError("");
            setNotConfigured(true);
            setSession(null);
          }
          return;
        }
        if (!response.ok) throw new Error("セッションを読み込めませんでした。");
        const json = await response.json() as SessionResponse;
        mayCreate = false;
        if (!cancelled) {
          if (shouldCreate) removeCreateQueryParam();
          setAdminAuthRequired(false);
          setDeactivationStatus("");
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
  }, [adminAuthRequired, adminEnabled, createEnabled, notConfigured, reloadNonce, sessionId]);

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
              <p>
                {deactivationStatus || (adminEnabled
                  ? "このBattle URLは無効です。再利用する場合はトップページの「新しいBattle URL」から作成してください。"
                  : "Battle not configured. Open the operator display from the top page first.")}
              </p>
              {deactivationStatus && adminEnabled ? (
                <p>再利用する場合はトップページの「新しいBattle URL」から作成してください。</p>
              ) : null}
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

  return (
    <BattleDisplay
      adminEnabled={adminEnabled}
      onSessionChange={setSession}
      onSessionDelete={(message) => {
        setDeactivationStatus(message);
        setSession(null);
        setNotConfigured(true);
      }}
      session={session}
    />
  );
}

function removeCreateQueryParam(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("create")) return;
  url.searchParams.delete("create");
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`
  );
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
    const value = readBrowserStorage(key);
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
    writeBrowserStorage(key, adminToken);
  });
}

function globalAdminTokenStorageKey(): string {
  return "zap-battle:admin-token";
}

function adminTokenStorageKey(sessionId: string): string {
  return `zap-battle:admin-token:${sessionId}`;
}
