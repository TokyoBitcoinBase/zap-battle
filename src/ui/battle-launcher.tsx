"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { readBrowserStorage, writeBrowserStorage } from "@/src/browser-storage";
import type { ZapBattleSessionSummary } from "@/src/types";

type SessionsResponse = {
  sessions?: ZapBattleSessionSummary[];
};

export type BattleLauncherLocale = "en" | "ja";

type LauncherStatus = "" | "battleIdRequired" | "checking" | "invalid" | "verified";

const LAUNCHER_COPY = {
  en: {
    admin: "Admin",
    adminToken: "Admin Token",
    adminTokenPlaceholder: "Required in production",
    battleId: "Battle ID",
    battleIdRequired: "Enter a Battle ID.",
    checking: "Checking...",
    checkingStatus: "Checking token...",
    invalid: "Admin token is invalid.",
    loadingSaved: "Loading saved URLs...",
    newBattle: "New Battle URL",
    noSaved: "No saved URLs.",
    openAdmin: "Open Admin",
    openPublic: "Open Public Display",
    public: "Public Display",
    publicUrl: "Public URL",
    refresh: "Refresh",
    refreshing: "Loading...",
    savedBattle: "Saved Battle URLs",
    savedDescription: "Saved battles are listed with the most recently updated first.",
    savedLoadError: "Could not load saved URLs.",
    statusDraft: "Ready",
    statusEnded: "Ended",
    statusLive: "Live",
    statusPaused: "Paused",
    unlock: "Unlock Battle Setup",
    updated: "Updated",
    verified: "Admin token verified."
  },
  ja: {
    admin: "管理画面",
    adminToken: "管理トークン",
    adminTokenPlaceholder: "本番環境では必須",
    battleId: "Battle ID",
    battleIdRequired: "Battle IDを入力してください。",
    checking: "確認中...",
    checkingStatus: "管理トークンを確認しています...",
    invalid: "管理トークンが正しくありません。",
    loadingSaved: "保存済みURLを読み込んでいます...",
    newBattle: "新しいBattle URL",
    noSaved: "保存済みURLはありません。",
    openAdmin: "管理画面を開く",
    openPublic: "公開画面を開く",
    public: "公開画面",
    publicUrl: "公開URL",
    refresh: "再読込",
    refreshing: "読込中...",
    savedBattle: "保存済みBattle URL",
    savedDescription: "保存されているバトルを新しい順に表示しています。",
    savedLoadError: "保存済みURLを読み込めませんでした。",
    statusDraft: "開始待ち",
    statusEnded: "終了",
    statusLive: "ライブ",
    statusPaused: "停止中",
    unlock: "バトル設定を開く",
    updated: "更新",
    verified: "管理トークンを確認しました。"
  }
} satisfies Record<BattleLauncherLocale, Record<string, string>>;

export function BattleLauncher({ locale = "ja" }: { locale?: BattleLauncherLocale }) {
  const router = useRouter();
  const [battleId, setBattleId] = useState("");
  const [adminToken, setAdminToken] = useState("");
  const [verified, setVerified] = useState(false);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<LauncherStatus>("");
  const [savedSessions, setSavedSessions] = useState<ZapBattleSessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState(false);
  const normalizedId = useMemo(() => normalizeBattleId(battleId), [battleId]);
  const displayPath = normalizedId ? sessionDisplayPath(normalizedId) : "";
  const operatorPath = displayPath ? `${displayPath}?admin=1&create=1` : "";
  const copy = LAUNCHER_COPY[locale];

  useEffect(() => {
    const stored = readStoredAdminToken();
    setAdminToken(stored);
    if (stored) void verifyToken(stored);
  }, []);

  async function verifyToken(token = adminToken) {
    setChecking(true);
    setStatus("checking");
    try {
      const response = await fetch("/api/zap-live/admin/check", {
        method: "POST",
        headers: adminHeaders(token)
      });
      if (!response.ok) throw new Error("invalid_admin_token");
      writeStoredAdminToken(token.trim());
      setVerified(true);
      setStatus("verified");
      void loadSavedSessions(token.trim());
    } catch {
      setVerified(false);
      setStatus("invalid");
    } finally {
      setChecking(false);
    }
  }

  async function loadSavedSessions(token = adminToken) {
    setSessionsLoading(true);
    setSessionsError(false);
    try {
      const response = await fetch("/api/zap-live/sessions", {
        cache: "no-store",
        headers: adminHeaders(token)
      });
      if (!response.ok) throw new Error("session_list_unavailable");
      const json = await response.json() as SessionsResponse;
      setSavedSessions(Array.isArray(json.sessions) ? json.sessions : []);
    } catch {
      setSessionsError(true);
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
      setStatus("battleIdRequired");
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
            <span>{copy.adminToken}</span>
            <input
              onChange={(event) => {
                setAdminToken(event.target.value);
                setVerified(false);
              }}
              placeholder={copy.adminTokenPlaceholder}
              type="password"
              value={adminToken}
            />
          </label>
          <button className="button gold" disabled={checking} type="submit">
            {checking ? copy.checking : copy.unlock}
          </button>
        </>
      ) : null}
      {status ? (
        <p className={`admin-status ${verified ? "verified" : ""}`}>
          {launcherStatusLabel(status, copy)}
        </p>
      ) : null}

      {verified ? (
        <>
          <section className="new-battle">
            <h2>{copy.newBattle}</h2>
            <label className="field">
              <span>{copy.battleId}</span>
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
                  <span>{copy.publicUrl}</span>
                  <code>{displayPath}</code>
                </div>
                <div className="home-actions">
                  <Link className="button primary" href={operatorPath} onClick={rememberSessionToken}>
                    {copy.openAdmin}
                  </Link>
                  <Link className="button" href={displayPath} onClick={rememberSessionToken}>
                    {copy.openPublic}
                  </Link>
                </div>
              </>
            ) : null}
          </section>

          <section className="saved-battles" aria-labelledby="saved-battles-title">
            <div className="saved-battles-head">
              <div>
                <h2 id="saved-battles-title">{copy.savedBattle}</h2>
                <p>{copy.savedDescription}</p>
              </div>
              <button
                className="button"
                disabled={sessionsLoading}
                onClick={() => void loadSavedSessions()}
                type="button"
              >
                {sessionsLoading ? copy.refreshing : copy.refresh}
              </button>
            </div>
            {sessionsError ? <p className="saved-battles-message error">{copy.savedLoadError}</p> : null}
            {!sessionsError && sessionsLoading && savedSessions.length === 0 ? (
              <p className="saved-battles-message">{copy.loadingSaved}</p>
            ) : null}
            {!sessionsError && !sessionsLoading && savedSessions.length === 0 ? (
              <p className="saved-battles-message">{copy.noSaved}</p>
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
                            {sessionStatusLabel(savedSession.status, locale)}
                          </span>
                        </div>
                        <code>{savedDisplayPath}</code>
                        {savedSession.updatedAt ? (
                          <small>{copy.updated} {formatSessionTime(savedSession.updatedAt, locale)}</small>
                        ) : null}
                      </div>
                      <div className="saved-battle-actions">
                        <Link
                          className="button primary"
                          href={`${savedDisplayPath}?admin=1`}
                          onClick={() => writeStoredAdminToken(adminToken.trim(), savedSession.id)}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          {copy.admin}
                        </Link>
                        <Link
                          className="button"
                          href={savedDisplayPath}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          {copy.public}
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
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

function launcherStatusLabel(
  status: Exclude<LauncherStatus, "">,
  copy: typeof LAUNCHER_COPY[BattleLauncherLocale]
): string {
  if (status === "checking") return copy.checkingStatus;
  if (status === "verified") return copy.verified;
  if (status === "battleIdRequired") return copy.battleIdRequired;
  return copy.invalid;
}

function sessionStatusLabel(
  status: ZapBattleSessionSummary["status"],
  locale: BattleLauncherLocale
): string {
  const copy = LAUNCHER_COPY[locale];
  if (status === "live") return copy.statusLive;
  if (status === "paused") return copy.statusPaused;
  if (status === "ended") return copy.statusEnded;
  return copy.statusDraft;
}

function formatSessionTime(timestamp: number, locale: BattleLauncherLocale): string {
  return new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "en-US", {
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
