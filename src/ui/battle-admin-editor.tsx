"use client";

import Link from "next/link";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { cleanupTemporaryProfile, createTemporaryProfile } from "@/src/nostr-temp-profile";
import type { BattleSide, Contestant, ZapBattleSession } from "@/src/types";

type SessionResponse = {
  session: ZapBattleSession;
};

type AdminLocale = "en" | "ja";

const ADMIN_COPY = {
  en: {
    clearResultsConfirm: "Clear results and comments? Player info and Lightning Addresses will remain.",
    clearResultsSaved: "Results and comments were cleared. Player info remains.",
    clearPlayerConfirm: "Clear this player? Display name, Lightning Address, and Nostr profile link will be removed.",
    copyIframeFailed: "Could not copy iframe code.",
    creatingTemp: "Creating temporary Nostr profile...",
    createTempFailed: "Could not create temporary Nostr profile.",
    createTempMissing: "Display name and Lightning Address are required for instant creation.",
    createTempSaved: "Temporary Nostr profile created and saved to the session.",
    createMissingTemps: "Create temporary Nostr profiles for players without Nostr accounts",
    createMissingTempsNote: "Uses the entered display name and Lightning Address, then stores the temporary keys only in this browser.",
    deleteConfirm: "Delete the data for this display URL? The public display will become not configured. The URL route itself will still exist.",
    deleteFailed: "Could not delete URL data.",
    deleteSaved: "Display URL data deleted. The public display is now not configured.",
    deleting: "Deleting URL data...",
    loadingFailed: "Could not load session.",
    resetConfirm: "Reset everything? Player info, Lightning Addresses, timer, and results will be cleared.",
    resetting: "Resetting...",
    resetFailed: "Could not reset.",
    resetSaved: "Reset complete. Temporary profiles were cleared where possible.",
    saveFailed: "Could not save.",
    saveWithTempProfiles: "Save + Create Nostr Profiles",
    saving: "Saving...",
    saved: "Saved. The display screen will update.",
    savedWithTempProfiles: "Temporary Nostr profiles created and saved. The display screen will update.",
    tempCleaned: "Temporary Nostr profile was cleared and removed from the session.",
    tempCleanedLocalOnly: "No temporary key was found in this browser, so it was only removed from the session.",
    tempCleaning: "Clearing temporary Nostr profile...",
    tempCleanFailed: "Could not clear temporary Nostr profile."
  },
  ja: {
    clearResultsConfirm: "集計とコメントをリセットしますか？参加者情報とLightning Addressは残ります。",
    clearResultsSaved: "集計とコメントをリセットしました。参加者情報は残しています。",
    clearPlayerConfirm: "このプレイヤー欄を空にしますか？表示名、Lightning Address、Nostrプロフィール連携が消えます。",
    copyIframeFailed: "iframeコードをコピーできませんでした。",
    creatingTemp: "一時Nostrプロフィールを作成しています...",
    createTempFailed: "一時Nostrプロフィールを作成できませんでした。",
    createTempMissing: "インスタント作成には表示名とLightning Addressが必要です。",
    createTempSaved: "一時Nostrプロフィールを作成し、セッションへ保存しました。",
    createMissingTemps: "Nostrアカウントがないプレイヤー用に一時Nostrプロフィールを作成する",
    createMissingTempsNote: "入力済みの表示名とLightning Addressを使います。一時鍵はこのブラウザにのみ保存されます。",
    deleteConfirm: "この表示URLのデータを削除しますか？公開表示は未設定に戻ります。URLのルート自体は残ります。",
    deleteFailed: "URLデータを削除できませんでした。",
    deleteSaved: "表示URLのデータを削除しました。公開表示は未設定になりました。",
    deleting: "URLデータを削除しています...",
    loadingFailed: "セッションを読み込めませんでした。",
    resetConfirm: "すべてリセットしますか？参加者情報、Lightning Address、タイマー、集計が消えます。",
    resetting: "リセットしています...",
    resetFailed: "リセットできませんでした。",
    resetSaved: "リセットしました。一時プロフィールは可能な範囲で空にしました。",
    saveFailed: "保存できませんでした。",
    saveWithTempProfiles: "保存 + Nostrプロフィール作成",
    saving: "保存しています...",
    saved: "保存しました。表示画面に反映されます。",
    savedWithTempProfiles: "一時Nostrプロフィールを作成して保存しました。表示画面に反映されます。",
    tempCleaned: "一時Nostrプロフィールを空にし、セッションから外しました。",
    tempCleanedLocalOnly: "このブラウザに一時鍵がないため、セッションからのみ外しました。",
    tempCleaning: "一時Nostrプロフィールを空にしています...",
    tempCleanFailed: "一時Nostrプロフィールを空にできませんでした。"
  }
} satisfies Record<AdminLocale, Record<string, string>>;

const DEFAULT_SESSION: ZapBattleSession = {
  id: "",
  title: "Dance Battle",
  status: "draft",
  startsAt: null,
  endsAt: null,
  durationSeconds: 10 * 60,
  graceSeconds: 30,
  contestants: {
    left: {
      side: "left",
      displayName: "",
      lightningAddress: ""
    },
    right: {
      side: "right",
      displayName: "",
      lightningAddress: ""
    }
  }
};

export function BattleAdminEditor({
  compact = false,
  locale = "en",
  onSessionChange,
  sessionId
}: {
  compact?: boolean;
  locale?: AdminLocale;
  onSessionChange?(session: ZapBattleSession): void;
  sessionId: string;
}) {
  const copy = ADMIN_COPY[locale];
  const [session, setSession] = useState<ZapBattleSession>({ ...DEFAULT_SESSION, id: sessionId });
  const [durationDraft, setDurationDraft] = useState(() => durationInputParts(DEFAULT_SESSION.durationSeconds));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [iframeCopied, setIframeCopied] = useState(false);
  const [adminToken, setAdminToken] = useState("");
  const [adminTokenLoaded, setAdminTokenLoaded] = useState(false);
  const [createMissingTemporaryProfiles, setCreateMissingTemporaryProfiles] = useState(true);
  const displayUrl = `/zap-battle/${encodeURIComponent(sessionId)}/display`;
  const absoluteDisplayUrl = useAbsoluteUrl(displayUrl);
  const iframeCode = `<iframe src="${absoluteDisplayUrl}" style="width:100%;min-height:900px;border:0;" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" title="Zap Battle"></iframe>`;
  const missingTemporaryProfileSides = temporaryProfileCandidateSides(session);
  const shouldCreateMissingTemporaryProfiles = createMissingTemporaryProfiles && missingTemporaryProfileSides.length > 0;

  useEffect(() => {
    setAdminTokenLoaded(false);
    const storedToken = readStoredAdminToken(sessionId);
    setAdminToken(storedToken);
    setAdminTokenLoaded(true);
    let cancelled = false;
    async function loadSession() {
      try {
        setLoading(true);
        const response = await fetch(`/api/zap-live/sessions/${encodeURIComponent(sessionId)}?create=1`, {
          cache: "no-store",
          headers: adminHeaders(storedToken)
        });
        if (!response.ok) throw new Error(copy.loadingFailed);
        const json = await response.json() as SessionResponse;
        if (!cancelled) {
          setSession(json.session);
          setDurationDraft(durationInputParts(json.session.durationSeconds));
        }
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : copy.loadingFailed);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadSession();
    return () => {
      cancelled = true;
    };
  }, [copy.loadingFailed, sessionId]);

  useEffect(() => {
    if (!adminTokenLoaded) return;
    writeStoredAdminToken(adminToken, sessionId);
  }, [adminToken, adminTokenLoaded, sessionId]);

  async function saveSession(
    nextSession = session,
    successMessage = copy.saved,
    options: { createMissingTemporaryProfiles?: boolean } = {}
  ) {
    setSaving(true);
    setStatus(copy.saving);
    try {
      let sessionToSave = nextSession;
      const createMissing = options.createMissingTemporaryProfiles ?? false;
      if (createMissing) {
        sessionToSave = await withTemporaryProfilesForMissingContestants(nextSession);
      }
      const response = await fetch(`/api/zap-live/sessions/${encodeURIComponent(sessionId)}`, {
        method: "PUT",
        headers: adminHeaders(adminToken),
        body: JSON.stringify(sessionToSave)
      });
      const json = await response.json() as SessionResponse & { errors?: string[] };
      if (!response.ok) throw new Error(json.errors?.join(" / ") || copy.saveFailed);
      setSession(json.session);
      onSessionChange?.(json.session);
      setStatus(successMessage);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : copy.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  async function createInstantContestant(side: BattleSide) {
    const contestant = session.contestants[side];
    if (!contestant.displayName.trim() || !contestant.lightningAddress.trim()) {
      setStatus(copy.createTempMissing);
      return;
    }
    setSaving(true);
    setStatus(copy.creatingTemp);
    try {
      const { pubkey } = await createTemporaryProfile({ sessionId, contestant });
      const nextSession = updateContestant(session, side, {
        ...contestant,
        nostrPubkey: pubkey,
        temporaryProfile: true
      });
      setSession(nextSession);
      await saveSession(nextSession, copy.saved);
      setStatus(copy.createTempSaved);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : copy.createTempFailed);
    } finally {
      setSaving(false);
    }
  }

  async function withTemporaryProfilesForMissingContestants(nextSession: ZapBattleSession): Promise<ZapBattleSession> {
    let updatedSession = nextSession;
    for (const side of temporaryProfileCandidateSides(nextSession)) {
      const contestant = updatedSession.contestants[side];
      const { pubkey } = await createTemporaryProfile({ sessionId, contestant });
      updatedSession = updateContestant(updatedSession, side, {
        ...contestant,
        nostrPubkey: pubkey,
        temporaryProfile: true
      });
    }
    setSession(updatedSession);
    return updatedSession;
  }

  async function cleanupInstantContestant(side: BattleSide) {
    const contestant = session.contestants[side];
    const confirmed = window.confirm(copy.clearPlayerConfirm);
    if (!confirmed) return;
    setSaving(true);
    setStatus(copy.tempCleaning);
    try {
      const result = await cleanupTemporaryProfile({
        sessionId,
        side,
        expectedPubkey: contestant.temporaryProfile ? contestant.nostrPubkey : undefined
      });
      const nextSession = updateContestant(session, side, {
        side,
        displayName: "",
        lightningAddress: "",
        nostrPubkey: undefined,
        profileImageUrl: undefined,
        temporaryProfile: false
      });
      setSession(nextSession);
      await saveSession(nextSession);
      setStatus(result === "cleaned"
        ? copy.tempCleaned
        : copy.tempCleanedLocalOnly);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : copy.tempCleanFailed);
    } finally {
      setSaving(false);
    }
  }

  async function resetBattle() {
    const confirmed = window.confirm(copy.resetConfirm);
    if (!confirmed) return;
    setSaving(true);
    setStatus(copy.resetting);
    try {
      await Promise.all((["left", "right"] as BattleSide[]).map(async (side) => {
        const contestant = session.contestants[side];
        if (!contestant.temporaryProfile) return;
        await cleanupTemporaryProfile({
          sessionId,
          side,
          expectedPubkey: contestant.nostrPubkey
        }).catch(() => undefined);
      }));
      const nextSession: ZapBattleSession = {
        ...DEFAULT_SESSION,
        id: sessionId,
        updatedAt: Math.floor(Date.now() / 1000)
      };
      setSession(nextSession);
      setDurationDraft(durationInputParts(nextSession.durationSeconds));
      await saveSession(nextSession);
      setStatus(copy.resetSaved);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : copy.resetFailed);
    } finally {
      setSaving(false);
    }
  }

  async function clearResults() {
    const confirmed = window.confirm(copy.clearResultsConfirm);
    if (!confirmed) return;
    const nextSession: ZapBattleSession = {
      ...session,
      status: "draft",
      startsAt: null,
      endsAt: null,
      finalResult: undefined,
      updatedAt: Math.floor(Date.now() / 1000)
    };
    setSession(nextSession);
    await saveSession(nextSession, copy.clearResultsSaved);
  }

  async function deleteBattleSession() {
    const confirmed = window.confirm(copy.deleteConfirm);
    if (!confirmed) return;
    setSaving(true);
    setStatus(copy.deleting);
    try {
      const response = await fetch(`/api/zap-live/sessions/${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
        headers: adminHeaders(adminToken)
      });
      const json = await response.json().catch(() => ({})) as { errors?: string[] };
      if (!response.ok) throw new Error(json.errors?.join(" / ") || copy.deleteFailed);
      setSession({ ...DEFAULT_SESSION, id: sessionId });
      onSessionChange?.({ ...DEFAULT_SESSION, id: sessionId });
      setDurationDraft(durationInputParts(DEFAULT_SESSION.durationSeconds));
      setStatus(copy.deleteSaved);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : copy.deleteFailed);
    } finally {
      setSaving(false);
    }
  }

  async function copyIframe() {
    try {
      await navigator.clipboard.writeText(iframeCode);
      setIframeCopied(true);
      window.setTimeout(() => setIframeCopied(false), 1600);
    } catch {
      setStatus(copy.copyIframeFailed);
    }
  }

  return (
    <main className={`admin-page ${compact ? "compact" : ""}`}>
      {!compact ? (
        <section className="admin-head">
          <div>
          <p className="eyebrow">Zap Battle Admin</p>
          <h1>Battle setup</h1>
          <p>公開可能なニックネームとLightning Addressを入力して、WordPressに貼る表示URLを作ります。</p>
          </div>
          <div className={`status ${session.status === "live" ? "live" : ""}`}>
            <span className="status-dot" aria-hidden="true" />
            <strong>{loading ? "Loading" : session.status}</strong>
          </div>
        </section>
      ) : null}

      <section className="admin-grid">
        <div className="admin-card">
          <label className="field">
            <span>Admin token</span>
            <input
              value={adminToken}
              onChange={(event) => setAdminToken(event.target.value)}
              placeholder="Required in production"
              type="password"
            />
          </label>
          <label className="field">
            <span>Battle title</span>
            <input
              value={session.title}
              onChange={(event) => setSession((current) => ({ ...current, title: event.target.value }))}
              placeholder="Dance Battle Final"
            />
          </label>
          <label className="field">
            <span>Battle time</span>
            <div className="time-grid">
              <label>
                <small>Minutes</small>
                <input
                  inputMode="numeric"
                  min={0}
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => updateDuration(setSession, setDurationDraft, durationDraft, "minutes", event.target.value)}
                  placeholder="10"
                  pattern="[0-9]*"
                  type="text"
                  value={durationDraft.minutes}
                />
              </label>
              <label>
                <small>Seconds</small>
                <input
                  inputMode="numeric"
                  max={59}
                  min={0}
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => updateDuration(setSession, setDurationDraft, durationDraft, "seconds", event.target.value)}
                  placeholder="0"
                  pattern="[0-9]*"
                  type="text"
                  value={durationDraft.seconds}
                />
              </label>
            </div>
          </label>
        </div>

        <ContestantForm
          contestant={session.contestants.left}
          onChange={(contestant) => setContestant(setSession, "left", contestant)}
          onCreateTemporaryProfile={() => void createInstantContestant("left")}
          onCleanupTemporaryProfile={() => void cleanupInstantContestant("left")}
          working={saving}
        />
        <ContestantForm
          contestant={session.contestants.right}
          onChange={(contestant) => setContestant(setSession, "right", contestant)}
          onCreateTemporaryProfile={() => void createInstantContestant("right")}
          onCleanupTemporaryProfile={() => void cleanupInstantContestant("right")}
          working={saving}
        />
      </section>

      {missingTemporaryProfileSides.length > 0 ? (
        <section className="admin-profile-options" aria-label="Nostr profile options">
          <label className="checkbox-field">
            <input
              checked={createMissingTemporaryProfiles}
              onChange={(event) => setCreateMissingTemporaryProfiles(event.target.checked)}
              type="checkbox"
            />
            <span>{copy.createMissingTemps}</span>
          </label>
          <p>{copy.createMissingTempsNote}</p>
        </section>
      ) : null}

      <section className="admin-actions">
        <button
          className="button primary"
          type="button"
          onClick={() => void saveSession(
            session,
            shouldCreateMissingTemporaryProfiles ? copy.savedWithTempProfiles : copy.saved,
            { createMissingTemporaryProfiles: shouldCreateMissingTemporaryProfiles }
          )}
          disabled={saving}
        >
          {saving ? "Working..." : shouldCreateMissingTemporaryProfiles ? copy.saveWithTempProfiles : "Save"}
        </button>
        <button className="button gold" type="button" onClick={() => void clearResults()} disabled={saving}>
          Clear results
        </button>
        <Link className="button" href={displayUrl} rel="noopener noreferrer" target="_blank">
          Open display tab
        </Link>
        <button className="button" type="button" onClick={() => void copyIframe()}>
          {iframeCopied ? "Copied" : "Copy iframe"}
        </button>
        <div className="admin-danger-actions">
          <button className="button danger" type="button" onClick={() => void resetBattle()} disabled={saving}>
            All Reset
          </button>
          <button className="button danger" type="button" onClick={() => void deleteBattleSession()} disabled={saving}>
            Delete URL Data
          </button>
        </div>
      </section>

      {status ? <p className="admin-status">{status}</p> : null}

      <section className="admin-card">
        <h2>WordPress iframe</h2>
        <textarea className="iframe-code" readOnly value={iframeCode} />
      </section>
    </main>
  );
}

function ContestantForm({
  contestant,
  onChange,
  onCreateTemporaryProfile,
  onCleanupTemporaryProfile,
  working
}: {
  contestant: Contestant;
  onChange(contestant: Contestant): void;
  onCreateTemporaryProfile(): void;
  onCleanupTemporaryProfile(): void;
  working: boolean;
}) {
  return (
    <div className={`admin-card contestant-form ${contestant.side}`}>
      <h2>{contestant.side === "left" ? "PLAYER 1" : "PLAYER 2"}</h2>
      <label className="field">
        <span>Display name</span>
        <input
          value={contestant.displayName}
          onChange={(event) => onChange({ ...contestant, displayName: event.target.value })}
          placeholder={contestant.side === "left" ? "Player 1" : "Player 2"}
        />
      </label>
      <p className="field-note">Use only a public nickname or stage name. Do not enter a legal name unless the contestant has approved public display.</p>
      <label className="field">
        <span>Lightning Address</span>
        <input
          value={contestant.lightningAddress}
          onChange={(event) => onChange({ ...contestant, lightningAddress: event.target.value })}
          placeholder={contestant.side === "left" ? "player1@example.com" : "player2@example.com"}
        />
      </label>
      <div className="inline-actions">
        <button className="button gold" type="button" onClick={onCreateTemporaryProfile} disabled={working}>
          Create
        </button>
        <button className="button" type="button" onClick={onCleanupTemporaryProfile} disabled={working}>
          Clear
        </button>
      </div>
      {contestant.temporaryProfile ? <p className="field-note">App-created temporary profile. Clear will blank this player and publish blank metadata if this browser still has the key.</p> : null}
      <label className="field">
        <span>Nostr public key / npub optional</span>
        <input
          value={contestant.nostrPubkey ?? ""}
          onChange={(event) => onChange({ ...contestant, nostrPubkey: event.target.value || undefined })}
          placeholder="npub1... or hex pubkey"
        />
      </label>
    </div>
  );
}

function updateContestant(session: ZapBattleSession, side: BattleSide, contestant: Contestant): ZapBattleSession {
  return {
    ...session,
    contestants: {
      ...session.contestants,
      [side]: contestant
    }
  };
}

function setContestant(
  setSession: Dispatch<SetStateAction<ZapBattleSession>>,
  side: BattleSide,
  contestant: Contestant
) {
  setSession((current) => ({
    ...current,
    contestants: {
      ...current.contestants,
      [side]: contestant
    }
  }));
}

function temporaryProfileCandidateSides(session: ZapBattleSession): BattleSide[] {
  return (["left", "right"] as BattleSide[]).filter((side) => {
    const contestant = session.contestants[side];
    return Boolean(
      contestant.displayName.trim() &&
      contestant.lightningAddress.trim() &&
      !contestant.nostrPubkey?.trim() &&
      !contestant.temporaryProfile
    );
  });
}

function updateDuration(
  setSession: Dispatch<SetStateAction<ZapBattleSession>>,
  setDurationDraft: Dispatch<SetStateAction<ReturnType<typeof durationInputParts>>>,
  currentDraft: ReturnType<typeof durationInputParts>,
  unit: "minutes" | "seconds",
  rawValue: string
) {
  const nextValue = normalizeDurationInput(unit, rawValue);
  const nextDraft = {
    ...currentDraft,
    [unit]: nextValue
  };
  const minutes = Number.parseInt(nextDraft.minutes || "0", 10) || 0;
  const seconds = Number.parseInt(nextDraft.seconds || "0", 10) || 0;
  setDurationDraft(nextDraft);
  setSession((session) => ({
    ...session,
    durationSeconds: Math.max(1, minutes * 60 + seconds)
  }));
}

function normalizeDurationInput(unit: "minutes" | "seconds", rawValue: string): string {
  if (rawValue.trim() === "") return "";
  const numericOnly = rawValue.replace(/\D/g, "");
  if (!numericOnly) return "";
  const value = Math.max(0, Number.parseInt(numericOnly, 10) || 0);
  return String(unit === "seconds" ? Math.min(59, value) : value);
}

function durationInputParts(durationSeconds: number) {
  const parts = durationParts(durationSeconds);
  return {
    minutes: parts.minutes ? String(parts.minutes) : "",
    seconds: parts.seconds ? String(parts.seconds) : ""
  };
}

function durationParts(durationSeconds: number) {
  const totalSeconds = Math.max(0, Math.round(durationSeconds));
  return {
    minutes: Math.floor(totalSeconds / 60),
    seconds: totalSeconds % 60
  };
}

function useAbsoluteUrl(path: string): string {
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  return origin ? new URL(path, origin).toString() : path;
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

function adminTokenStorageKey(sessionId: string): string {
  return `zap-battle:admin-token:${sessionId}`;
}

function globalAdminTokenStorageKey(): string {
  return "zap-battle:admin-token";
}
