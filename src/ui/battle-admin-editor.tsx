"use client";

import Link from "next/link";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { cleanupTemporaryProfile, createTemporaryProfile } from "@/src/nostr-temp-profile";
import { fetchZapReceiptsOnce } from "@/src/nostr-zap-receipts";
import type { BattleSide, Contestant, ZapBattleFinalResult, ZapBattleSession, ZapReceiptItem } from "@/src/types";

type SessionResponse = {
  session: ZapBattleSession;
};

const DEFAULT_SESSION: ZapBattleSession = {
  id: "",
  title: "Dance Battle",
  status: "draft",
  startsAt: null,
  endsAt: null,
  durationSeconds: 10 * 60,
  graceSeconds: 60,
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

export function BattleAdminEditor({ compact = false, sessionId }: { compact?: boolean; sessionId: string }) {
  const [session, setSession] = useState<ZapBattleSession>({ ...DEFAULT_SESSION, id: sessionId });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [iframeCopied, setIframeCopied] = useState(false);
  const [adminToken, setAdminToken] = useState("");
  const displayUrl = `/zap-battle/${encodeURIComponent(sessionId)}/display`;
  const absoluteDisplayUrl = useAbsoluteUrl(displayUrl);
  const iframeCode = `<iframe src="${absoluteDisplayUrl}" style="width:100%;min-height:900px;border:0;" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" title="Zap Battle"></iframe>`;

  useEffect(() => {
    const storedToken = localStorage.getItem(adminTokenStorageKey(sessionId)) ?? localStorage.getItem(globalAdminTokenStorageKey()) ?? "";
    setAdminToken(storedToken);
    let cancelled = false;
    async function loadSession() {
      try {
        setLoading(true);
        const response = await fetch(`/api/zap-live/sessions/${encodeURIComponent(sessionId)}?create=1`, {
          cache: "no-store",
          headers: adminHeaders(storedToken)
        });
        if (!response.ok) throw new Error("セッションを読み込めませんでした。");
        const json = await response.json() as SessionResponse;
        if (!cancelled) setSession(json.session);
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : "セッションを読み込めませんでした。");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadSession();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    localStorage.setItem(adminTokenStorageKey(sessionId), adminToken);
    localStorage.setItem(globalAdminTokenStorageKey(), adminToken);
  }, [adminToken, sessionId]);

  async function saveSession(nextSession = session) {
    setSaving(true);
    setStatus("保存しています...");
    try {
      const response = await fetch(`/api/zap-live/sessions/${encodeURIComponent(sessionId)}`, {
        method: "PUT",
        headers: adminHeaders(adminToken),
        body: JSON.stringify(nextSession)
      });
      const json = await response.json() as SessionResponse & { errors?: string[] };
      if (!response.ok) throw new Error(json.errors?.join(" / ") || "保存できませんでした。");
      setSession(json.session);
      setStatus("保存しました。表示画面に反映されます。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "保存できませんでした。");
    } finally {
      setSaving(false);
    }
  }

  async function createInstantContestant(side: BattleSide) {
    const contestant = session.contestants[side];
    if (!contestant.displayName.trim() || !contestant.lightningAddress.trim()) {
      setStatus("インスタント作成には表示名とLightning Addressが必要です。");
      return;
    }
    setSaving(true);
    setStatus("一時Nostrプロフィールを作成しています...");
    try {
      const { pubkey } = await createTemporaryProfile({ sessionId, contestant });
      const nextSession = updateContestant(session, side, {
        ...contestant,
        nostrPubkey: pubkey,
        temporaryProfile: true
      });
      setSession(nextSession);
      await saveSession(nextSession);
      setStatus("一時Nostrプロフィールを作成し、セッションへ保存しました。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "一時Nostrプロフィールを作成できませんでした。");
    } finally {
      setSaving(false);
    }
  }

  async function cleanupInstantContestant(side: BattleSide) {
    const contestant = session.contestants[side];
    setSaving(true);
    setStatus("一時Nostrプロフィールを空にしています...");
    try {
      const result = await cleanupTemporaryProfile({
        sessionId,
        side,
        expectedPubkey: contestant.temporaryProfile ? contestant.nostrPubkey : undefined
      });
      const nextSession = updateContestant(session, side, {
        ...contestant,
        nostrPubkey: undefined,
        temporaryProfile: false
      });
      setSession(nextSession);
      await saveSession(nextSession);
      setStatus(result === "cleaned"
        ? "一時Nostrプロフィールを空にし、セッションから外しました。"
        : "このブラウザに一時鍵がないため、セッションからのみ外しました。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "一時Nostrプロフィールを空にできませんでした。");
    } finally {
      setSaving(false);
    }
  }

  async function resetBattle() {
    setSaving(true);
    setStatus("リセットしています...");
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
      await saveSession(nextSession);
      setStatus("リセットしました。一時プロフィールは可能な範囲で空にしました。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "リセットできませんでした。");
    } finally {
      setSaving(false);
    }
  }

  async function startBattle() {
    await postAction("start", "開始しました。");
  }

  async function endBattle() {
    setSaving(true);
    setStatus("最終結果を集計しています...");
    try {
      const receipts = session.startsAt
        ? await fetchZapReceiptsOnce({ session, since: Math.max(0, session.startsAt - 60), maxWait: 3500 })
        : [];
      const response = await fetch(`/api/zap-live/sessions/${encodeURIComponent(sessionId)}/end`, {
        method: "POST",
        headers: adminHeaders(adminToken),
        body: JSON.stringify({
          finalResult: createFinalResult(receipts)
        })
      });
      const json = await response.json() as SessionResponse & { errors?: string[] };
      if (!response.ok) throw new Error(json.errors?.join(" / ") || "終了できませんでした。");
      setSession(json.session);
      setStatus("終了しました。表示画面はFinal Resultに切り替わります。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "終了できませんでした。");
    } finally {
      setSaving(false);
    }
  }

  async function postAction(action: "start" | "end", successMessage: string) {
    setSaving(true);
    setStatus(action === "start" ? "開始しています..." : "終了しています...");
    try {
      const response = await fetch(`/api/zap-live/sessions/${encodeURIComponent(sessionId)}/${action}`, {
        method: "POST",
        headers: adminHeaders(adminToken)
      });
      const json = await response.json() as SessionResponse & { errors?: string[] };
      if (!response.ok) throw new Error(json.errors?.join(" / ") || "操作に失敗しました。");
      setSession(json.session);
      setStatus(successMessage);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "操作に失敗しました。");
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
      setStatus("iframeコードをコピーできませんでした。");
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
              <input
                inputMode="numeric"
                min={0}
                onChange={(event) => updateDuration(setSession, "minutes", event.target.value)}
                placeholder="10"
                type="number"
                value={durationParts(session.durationSeconds).minutes || ""}
              />
              <input
                inputMode="numeric"
                max={59}
                min={0}
                onChange={(event) => updateDuration(setSession, "seconds", event.target.value)}
                placeholder="seconds"
                type="number"
                value={durationParts(session.durationSeconds).seconds || ""}
              />
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

      <section className="admin-actions">
        <button className="button primary" type="button" onClick={() => void saveSession()} disabled={saving}>
          {saving ? "Working..." : "Save"}
        </button>
        <button className="button gold" type="button" onClick={() => void startBattle()} disabled={saving}>
          Start
        </button>
        <button className="button" type="button" onClick={() => void endBattle()} disabled={saving}>
          End
        </button>
        <button className="button" type="button" onClick={() => void resetBattle()} disabled={saving}>
          Reset
        </button>
        {!compact ? (
          <Link className="button" href={displayUrl}>
            Open display
          </Link>
        ) : null}
        <button className="button" type="button" onClick={() => void copyIframe()}>
          {iframeCopied ? "Copied" : "Copy iframe"}
        </button>
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
          Create Temp
        </button>
        <button className="button" type="button" onClick={onCleanupTemporaryProfile} disabled={working || !contestant.temporaryProfile}>
          Clear Temp
        </button>
      </div>
      {contestant.temporaryProfile ? <p className="field-note">App-created temporary profile. Reset will publish blank metadata if this browser still has the key.</p> : null}
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

function updateDuration(
  setSession: Dispatch<SetStateAction<ZapBattleSession>>,
  unit: "minutes" | "seconds",
  rawValue: string
) {
  const value = Math.max(0, Number.parseInt(rawValue || "0", 10) || 0);
  setSession((current) => {
    const currentParts = durationParts(current.durationSeconds);
    const minutes = unit === "minutes" ? value : currentParts.minutes;
    const seconds = unit === "seconds" ? Math.min(59, value) : currentParts.seconds;
    return {
      ...current,
      durationSeconds: Math.max(1, minutes * 60 + seconds)
    };
  });
}

function durationParts(durationSeconds: number) {
  const totalSeconds = Math.max(0, Math.round(durationSeconds));
  return {
    minutes: Math.floor(totalSeconds / 60),
    seconds: totalSeconds % 60
  };
}

function createFinalResult(receipts: ZapReceiptItem[]): ZapBattleFinalResult {
  const normalized = receipts
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt);
  const left = calculateStats(normalized, "left");
  const right = calculateStats(normalized, "right");
  const winner = left.totalSats === right.totalSats
    ? "tied"
    : left.totalSats > right.totalSats
      ? "left"
      : "right";
  return {
    capturedAt: Math.floor(Date.now() / 1000),
    winner,
    left,
    right,
    receipts: normalized.slice(0, 80)
  };
}

function calculateStats(items: ZapReceiptItem[], side: BattleSide) {
  const sideItems = items.filter((item) => item.side === side);
  const totalSats = sideItems.reduce((sum, item) => sum + item.amountSats, 0);
  return {
    count: sideItems.length,
    totalSats,
    averageSats: sideItems.length > 0 ? Math.round(totalSats / sideItems.length) : 0
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

function adminTokenStorageKey(sessionId: string): string {
  return `zap-battle:admin-token:${sessionId}`;
}

function globalAdminTokenStorageKey(): string {
  return "zap-battle:admin-token";
}
