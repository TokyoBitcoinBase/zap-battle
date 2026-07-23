"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { readBrowserStorage, writeBrowserStorage } from "@/src/browser-storage";
import type { ZapBattleSessionSummary } from "@/src/types";

type SessionsResponse = {
  sessions?: ZapBattleSessionSummary[];
};

export function BattleLauncher() {
  const router = useRouter();
  const [battleId, setBattleId] = useState("");
  const [adminToken, setAdminToken] = useState("");
  const [verified, setVerified] = useState(false);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState("");
  const [savedSessions, setSavedSessions] = useState<ZapBattleSessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState("");
  const normalizedId = useMemo(() => normalizeBattleId(battleId), [battleId]);
  const displayPath = normalizedId ? sessionDisplayPath(normalizedId) : "";
  const operatorPath = displayPath ? `${displayPath}?admin=1&create=1` : "";

  useEffect(() => {
    const stored = readStoredAdminToken();
    setAdminToken(stored);
    if (stored) void verifyToken(stored);
  }, []);

  async function verifyToken(token = adminToken) {
    setChecking(true);
    setStatus("Checking token...");
    try {
      const response = await fetch("/api/zap-live/admin/check", {
        method: "POST",
        headers: adminHeaders(token)
      });
      if (!response.ok) throw new Error("Admin token is invalid.");
      writeStoredAdminToken(token.trim());
      setVerified(true);
      setStatus("Admin token verified.");
      void loadSavedSessions(token.trim());
    } catch (error) {
      setVerified(false);
      setStatus(error instanceof Error ? error.message : "Admin token is invalid.");
    } finally {
      setChecking(false);
    }
  }

  async function loadSavedSessions(token = adminToken) {
    setSessionsLoading(true);
    setSessionsError("");
    try {
      const response = await fetch("/api/zap-live/sessions", {
        cache: "no-store",
        headers: adminHeaders(token)
      });
      if (!response.ok) throw new Error("保存済みURLを読み込めませんでした。");
      const json = await response.json() as SessionsResponse;
      setSavedSessions(Array.isArray(json.sessions) ? json.sessions : []);
    } catch (error) {
      setSessionsError(error instanceof Error ? error.message : "保存済みURLを読み込めませんでした。");
    } finally {
      setSessionsLoading(false);
    }
  }

  function rememberSessionToken() {
    if (!normalizedId) return;
    writeStoredAdminToken(adminToken.trim(), normalizedId);
  }

  function openOperatorDisplay() {
    if (!operatorPath) {
      setStatus("Battle IDを入力してください。");
      return;
    }
    rememberSessionToken();
    router.push(operatorPath);
  }

  return (
    <form
      className="launcher"
      onSubmit={(event) => {
        event.preventDefault();
        if (checking) return;
        if (verified) {
          openOperatorDisplay();
          return;
        }
        void verifyToken();
      }}
    >
      {!verified ? (
        <>
          <label className="field">
            <span>Admin Token</span>
            <input
              onChange={(event) => {
                setAdminToken(event.target.value);
                setVerified(false);
              }}
              placeholder="Required in production"
              type="password"
              value={adminToken}
            />
          </label>
          <button className="button gold" disabled={checking} type="submit">
            {checking ? "Checking..." : "Unlock Battle Setup"}
          </button>
        </>
      ) : null}
      {status ? <p className={`admin-status ${verified ? "verified" : ""}`}>{status}</p> : null}

      {verified ? (
        <>
          <section className="saved-battles" aria-labelledby="saved-battles-title">
            <div className="saved-battles-head">
              <div>
                <h2 id="saved-battles-title">保存済みBattle URL</h2>
                <p>保存されているバトルを新しい順に表示しています。</p>
              </div>
              <button
                className="button"
                disabled={sessionsLoading}
                onClick={() => void loadSavedSessions()}
                type="button"
              >
                {sessionsLoading ? "読込中..." : "再読込"}
              </button>
            </div>
            {sessionsError ? <p className="saved-battles-message error">{sessionsError}</p> : null}
            {!sessionsError && sessionsLoading && savedSessions.length === 0 ? (
              <p className="saved-battles-message">保存済みURLを読み込んでいます...</p>
            ) : null}
            {!sessionsError && !sessionsLoading && savedSessions.length === 0 ? (
              <p className="saved-battles-message">保存済みURLはありません。</p>
            ) : null}
            {savedSessions.length > 0 ? (
              <ul className="saved-battle-list">
                {savedSessions.map((savedSession) => {
                  const savedDisplayPath = sessionDisplayPath(savedSession.id);
                  return (
                    <li key={savedSession.id}>
                      <div className="saved-battle-info">
                        <div className="saved-battle-title">
                          <strong>{savedSession.title}</strong>
                          <span className={`saved-battle-status ${savedSession.status}`}>
                            {sessionStatusLabel(savedSession.status)}
                          </span>
                        </div>
                        <code>{savedDisplayPath}</code>
                        {savedSession.updatedAt ? <small>更新 {formatSessionTime(savedSession.updatedAt)}</small> : null}
                      </div>
                      <div className="saved-battle-actions">
                        <Link
                          className="button primary"
                          href={`${savedDisplayPath}?admin=1`}
                          onClick={() => writeStoredAdminToken(adminToken.trim(), savedSession.id)}
                        >
                          管理画面
                        </Link>
                        <Link className="button" href={savedDisplayPath}>
                          公開画面
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>

          <section className="new-battle">
            <h2>新しいBattle URL</h2>
            <label className="field">
              <span>Battle ID</span>
              <input
                autoCapitalize="none"
                autoCorrect="off"
                inputMode="url"
                onChange={(event) => setBattleId(event.target.value)}
                placeholder="tokyo-final"
                value={battleId}
              />
            </label>
            {displayPath ? (
              <>
                <div className="launcher-preview">
                  <span>Public URL</span>
                  <code>{displayPath}</code>
                </div>
                <div className="home-actions">
                  <Link className="button primary" href={operatorPath} onClick={rememberSessionToken}>
                    管理画面を開く
                  </Link>
                  <Link className="button" href={displayPath} onClick={rememberSessionToken}>
                    公開画面を開く
                  </Link>
                </div>
              </>
            ) : null}
          </section>
        </>
      ) : null}
    </form>
  );
}

function normalizeBattleId(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return normalized;
}

function sessionDisplayPath(sessionId: string): string {
  return `/zap-battle/${encodeURIComponent(sessionId)}/display`;
}

function sessionStatusLabel(status: ZapBattleSessionSummary["status"]): string {
  if (status === "live") return "ライブ";
  if (status === "paused") return "停止中";
  if (status === "ended") return "終了";
  return "開始待ち";
}

function formatSessionTime(timestamp: number): string {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(timestamp * 1000));
}

function adminHeaders(adminToken: string): HeadersInit {
  return {
    "content-type": "application/json",
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
