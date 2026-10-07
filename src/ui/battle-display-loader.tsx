"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
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
  const [deactivated, setDeactivated] = useState(false);
  const [adminAuthRequired, setAdminAuthRequired] = useState(false);
  const [adminTokenDraft, setAdminTokenDraft] = useState("");
  const [deactivationStatus, setDeactivationStatus] = useState("");
  const [reloadNonce, setReloadNonce] = useState(0);
  const createdSessions = useRef(new Set<string>());

  useEffect(() => {
    if (adminAuthRequired || deactivationStatus) return;
    let cancelled = false;
    let mayCreate = adminEnabled && createEnabled && !createdSessions.current.has(sessionId);
    let timer: number | undefined;
    const controller = new AbortController();
    async function loadSession() {
      try {
        const adminToken = readStoredAdminToken(sessionId);
        setAdminTokenDraft(adminToken);
        const shouldCreate = mayCreate;
        const response = await fetch(`/api/zap-live/sessions/${encodeURIComponent(sessionId)}${shouldCreate ? "?create=1" : ""}`, {
          cache: "no-store",
          signal: controller.signal,
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
        if (response.status === 404 || response.status === 410) {
          if (!cancelled) {
            setError("");
            setNotConfigured(true);
            setDeactivated((current) => response.status === 410 || current);
            if (response.status === 410) setSession(null);
          }
          return;
        }
        if (response.status === 503) {
          throw new Error("Battleデータを一時的に読み込めません。自動で再接続しています。");
        }
        if (!response.ok) throw new Error("セッションを読み込めませんでした。");
        const json = await response.json() as SessionResponse;
        mayCreate = false;
        if (shouldCreate) createdSessions.current.add(sessionId);
        if (!cancelled) {
          if (shouldCreate) removeCreateQueryParam();
          setAdminAuthRequired(false);
          setDeactivationStatus("");
          setError("");
          setNotConfigured(false);
          setDeactivated(false);
          setSession(json.session);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "セッションを読み込めませんでした。");
      } finally {
        if (!cancelled) timer = window.setTimeout(loadSession, 5000);
      }
    }
    void loadSession();
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [adminAuthRequired, adminEnabled, createEnabled, deactivationStatus, reloadNonce, sessionId]);

  function retrySession() {
    setError("");
    setNotConfigured(false);
    setDeactivated(false);
    setReloadNonce((current) => current + 1);
  }

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

  if (error && !session && !deactivated) {
    return (
      <main className="page">
        <section className="topbar">
          <div className="title">
            <h1>Zap Battle</h1>
            <p role="status">{error}</p>
          </div>
          <div className="home-actions">
            <button className="button primary" onClick={retrySession} type="button">
              再読み込み
            </button>
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
              <p role="status">
                {deactivationStatus || (deactivated
                  ? "このBattle URLは無効化されています。"
                  : "Battleデータがまだ見つかりません。自動で再確認しています。")}
              </p>
              {(deactivationStatus || deactivated) && adminEnabled ? (
                <p>再利用する場合はトップページの「新しいBattle URL」から作成してください。</p>
              ) : null}
            </div>
            <div className="home-actions">
              {!deactivationStatus ? (
                <button className="button primary" onClick={retrySession} type="button">
                  再読み込み
                </button>
              ) : null}
              <Link className="button" href="/">トップページへ</Link>
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
        setDeactivated(true);
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
