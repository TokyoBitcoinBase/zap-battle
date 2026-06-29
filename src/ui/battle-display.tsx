"use client";

import QRCode from "qrcode";
import { useEffect, useMemo, useRef, useState } from "react";
import { encodeLnurl } from "@/src/lnurl";
import { fetchZapReceiptsOnce, subscribeToZapReceipts } from "@/src/nostr-zap-receipts";
import type { BattleSide, Contestant, ZapBattleSession, ZapReceiptItem } from "@/src/types";
import { BattleAdminEditor } from "@/src/ui/battle-admin-editor";

type ConfettiPiece = {
  id: string;
  x: string;
  y: string;
  dx: string;
  dy: string;
  r: string;
  color: string;
};

type CelebrationTarget = BattleSide | "center";
type CelebrationQueueItem = {
  side: CelebrationTarget;
  withSound: boolean;
};

type Locale = "en" | "ja";

const CONFETTI_COLORS = ["#ffd238", "#20d4ff", "#ff3e88", "#20f0b0", "#ffffff", "#ff8a1f"];
const FEED_ITEMS_PER_SIDE = 40;
const SOUND_ENABLED_STORAGE_KEY = "zap-battle:sound-enabled";

const COPY = {
  en: {
    admin: "Admin",
    close: "Close",
    draw: "Draw",
    finalResult: "Final Result",
    finalScore: "Final Score",
    finalZaps: "Final Zaps",
    noZaps: "No zaps in this battle.",
    paused: "Paused",
    qrNotReady: "QR not ready",
    sound: "Sound",
    totalReceived: "Total Received",
    waiting: "Waiting for zaps...",
    winner: "Winner",
    zaps: "zaps",
    lightningMissing: "Lightning Address not set",
    demoZap: "Demo Received Zap",
    tied: "Tied",
    leads: "leads",
    tiedBattle: "Tied Battle",
    bothSidesLevel: "Both sides finished level.",
    realtimeZaps: "Realtime Zaps",
    avgSats: "avg sats",
    finalizing: "Finalizing",
    overtime: "Overtime",
    ready: "Ready",
    timeLeft: "Time Left"
  },
  ja: {
    admin: "管理",
    close: "閉じる",
    draw: "引き分け",
    finalResult: "最終結果",
    finalScore: "最終スコア",
    finalZaps: "最終Zap",
    noZaps: "このバトルのZapはありません。",
    paused: "停止中",
    qrNotReady: "QR未準備",
    sound: "音",
    totalReceived: "受け取り合計",
    waiting: "Zap待機中...",
    winner: "勝者",
    zaps: "zaps",
    lightningMissing: "Lightning Address未設定",
    demoZap: "デモZap受信",
    tied: "同点",
    leads: "リード",
    tiedBattle: "同点バトル",
    bothSidesLevel: "両者同点で終了しました。",
    realtimeZaps: "リアルタイムZap",
    avgSats: "平均sats",
    finalizing: "集計中",
    overtime: "延長",
    ready: "開始待ち",
    timeLeft: "残り時間"
  }
} satisfies Record<Locale, Record<string, string>>;

type SessionResponse = {
  session: ZapBattleSession;
  errors?: string[];
};

export function BattleDisplay({
  adminEnabled = false,
  onSessionChange,
  session
}: {
  adminEnabled?: boolean;
  onSessionChange?(session: ZapBattleSession): void;
  session: ZapBattleSession;
}) {
  const [items, setItems] = useState<ZapReceiptItem[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [locale, setLocale] = useState<Locale>("en");
  const [adminOpen, setAdminOpen] = useState(false);
  const [utilityOpen, setUtilityOpen] = useState(false);
  const [adminActionStatus, setAdminActionStatus] = useState("");
  const [adminWorking, setAdminWorking] = useState(false);
  const [hasAdminToken, setHasAdminToken] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [celebrationNonce, setCelebrationNonce] = useState(0);
  const [confetti, setConfetti] = useState<ConfettiPiece[]>([]);
  const seenReceiptIdsRef = useRef<Set<string>>(new Set());
  const latestReceiptCreatedAtRef = useRef(0);
  const previousStartsAtRef = useRef<number | null>(session.startsAt);
  const timeUpSessionRef = useRef<string | null>(null);
  const finalizedSessionRef = useRef<string | null>(null);
  const finalSoundSessionRef = useRef<string | null>(session.status === "ended" ? `${session.id}:${session.startsAt ?? "ended"}` : null);
  const soundEnabledRef = useRef(false);
  const celebrationTimerRef = useRef<number | undefined>(undefined);
  const celebrationQueueRef = useRef<CelebrationQueueItem[]>([]);
  const celebrationActiveRef = useRef(false);
  const [celebrationSide, setCelebrationSide] = useState<CelebrationTarget>("center");
  const finalItems = session.status === "ended" && session.finalResult ? session.finalResult.receipts : null;
  const displayItems = finalItems ?? items;
  const leftFeedItems = displayItems.filter((item) => item.side === "left").slice(0, FEED_ITEMS_PER_SIDE);
  const rightFeedItems = displayItems.filter((item) => item.side === "right").slice(0, FEED_ITEMS_PER_SIDE);
  const copy = COPY[locale];
  const showDemoControls = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_DEMO_ZAPS === "true";

  const leftStats = useMemo(() => (
    session.status === "ended" && session.finalResult ? session.finalResult.left : calculateStats(items, "left")
  ), [items, session.finalResult, session.status]);
  const rightStats = useMemo(() => (
    session.status === "ended" && session.finalResult ? session.finalResult.right : calculateStats(items, "right")
  ), [items, session.finalResult, session.status]);
  const total = leftStats.totalSats + rightStats.totalSats;
  const leftRatio = total > 0 ? Math.round((leftStats.totalSats / total) * 100) : 50;
  const leader = session.status === "ended" && session.finalResult
    ? session.finalResult.winner
    : leftStats.totalSats === rightStats.totalSats
    ? "tied"
    : leftStats.totalSats > rightStats.totalSats
      ? "left"
      : "right";

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    if (!utilityOpen) return;
    const closeUtility = () => setUtilityOpen(false);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeUtility();
    };
    window.addEventListener("click", closeUtility);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("click", closeUtility);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [utilityOpen]);

  useEffect(() => {
    return () => window.clearTimeout(celebrationTimerRef.current);
  }, []);

  useEffect(() => {
    if (session.startsAt && session.status !== "draft") return;
    seenReceiptIdsRef.current.clear();
    latestReceiptCreatedAtRef.current = 0;
    setItems([]);
  }, [session.startsAt, session.status]);

  useEffect(() => {
    if (previousStartsAtRef.current === session.startsAt) return;
    previousStartsAtRef.current = session.startsAt;
    timeUpSessionRef.current = null;
    finalizedSessionRef.current = null;
    seenReceiptIdsRef.current.clear();
    latestReceiptCreatedAtRef.current = 0;
    setItems([]);
  }, [session.startsAt]);

  useEffect(() => {
    if (session.status !== "live" || !session.startsAt) return;
    const startsAt = session.startsAt;
    const timeUpKey = `${session.id}:${startsAt}`;
    const checkTimeUp = () => {
      if (timeUpSessionRef.current === timeUpKey) return;
      const endAt = startsAt + session.durationSeconds;
      if (currentSeconds() < endAt) return;
      timeUpSessionRef.current = timeUpKey;
      enqueueCelebration("center", false);
      if (soundEnabled) void playTimeUpSound();
    };
    checkTimeUp();
    const intervalId = window.setInterval(checkTimeUp, 250);
    return () => window.clearInterval(intervalId);
  }, [session.durationSeconds, session.id, session.startsAt, session.status, soundEnabled]);

  useEffect(() => {
    if (session.status !== "ended" || !session.finalResult) return;
    const finalSoundKey = `${session.id}:${session.startsAt ?? session.finalResult.capturedAt}`;
    if (finalSoundSessionRef.current === finalSoundKey) return;
    finalSoundSessionRef.current = finalSoundKey;
    if (soundEnabled) void playTimeUpSound();
  }, [session.finalResult, session.id, session.startsAt, session.status, soundEnabled]);

  useEffect(() => {
    if (!adminEnabled || session.status !== "live" || !session.startsAt) return;
    const finalizeKey = `${session.id}:${session.startsAt}`;
    if (finalizedSessionRef.current === finalizeKey) return;
    const endAt = session.endsAt ?? session.startsAt + session.durationSeconds;
    const finalizeAt = endAt + session.graceSeconds;
    const delayMs = Math.max(0, (finalizeAt - currentSeconds()) * 1000);
    const timeoutId = window.setTimeout(() => {
      if (finalizedSessionRef.current === finalizeKey) return;
      if (!currentAdminToken(session.id)) return;
      finalizedSessionRef.current = finalizeKey;
      void finalizeBattle();
    }, delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [adminEnabled, session.durationSeconds, session.endsAt, session.graceSeconds, session.id, session.startsAt, session.status]);

  useEffect(() => {
    if (!session.startsAt) return;
    if (session.status === "ended" && session.finalResult) return;
    function addReceipts(receipts: ZapReceiptItem[]) {
      if (receipts.length === 0) return;
      const newReceiptSides: BattleSide[] = [];
      receipts.forEach((item) => {
        if (seenReceiptIdsRef.current.has(item.id)) return;
        seenReceiptIdsRef.current.add(item.id);
        newReceiptSides.push(item.side);
      });
      setItems((current) => {
        const byId = new Map(current.map((item) => [item.id, item]));
        receipts.forEach((item) => {
          byId.set(item.id, mergeZapReceiptItem(byId.get(item.id), item));
        });
        return Array.from(byId.values())
          .sort((a, b) => b.createdAt - a.createdAt);
      });
      enqueueCelebrations(newReceiptSides, soundEnabledRef.current);
      receipts.forEach((item) => {
        latestReceiptCreatedAtRef.current = Math.max(latestReceiptCreatedAtRef.current, item.createdAt);
      });
    }

    if (session.status === "ended") {
      void fetchZapReceiptsOnce({
        session,
        since: session.startsAt
      }).then(addReceipts);
      return;
    }

    const unsubscribe = subscribeToZapReceipts({
      session,
      onReceipt(item) {
        addReceipts([item]);
      }
    });

    let cancelled = false;
    let catchupRunning = false;
    async function catchUp() {
      if (cancelled || catchupRunning || document.visibilityState === "hidden") return;
      catchupRunning = true;
      try {
        const newestSeen = latestReceiptCreatedAtRef.current || session.startsAt || 0;
        const receipts = await fetchZapReceiptsOnce({
          session,
          since: Math.max(0, newestSeen - 90)
        });
        if (!cancelled) addReceipts(receipts);
      } finally {
        catchupRunning = false;
      }
    }

    const intervalId = window.setInterval(() => void catchUp(), 5_000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void catchUp();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    void catchUp();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      unsubscribe();
    };
  }, [session]);

  useEffect(() => {
    const stored = localStorage.getItem("zap-battle:locale");
    if (stored === "ja" || stored === "en") setLocale(stored);
    setSoundEnabled(localStorage.getItem(SOUND_ENABLED_STORAGE_KEY) === "true");
  }, []);

  useEffect(() => {
    if (!adminEnabled) return;
    const syncAdminToken = () => setHasAdminToken(Boolean(currentAdminToken(session.id)));
    syncAdminToken();
    const intervalId = window.setInterval(syncAdminToken, 1000);
    window.addEventListener("focus", syncAdminToken);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", syncAdminToken);
    };
  }, [adminEnabled, session.id]);

  function addDemoZap(side: BattleSide) {
    const amount = [500, 1000, 2100, 3000, 5000][Math.floor(Math.random() * 5)] ?? 1000;
    const names = ["anonymous", "bboy", "bgirl", "npub...dance", "floor side"];
    const comments = ["🔥", "go!", "nice move", "finish it", "最高"];
    setItems((current) => [
      {
        id: `demo-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        side,
        senderName: names[Math.floor(Math.random() * names.length)] ?? "anonymous",
        amountSats: amount,
        comment: comments[Math.floor(Math.random() * comments.length)] ?? "",
        createdAt: Math.floor(Date.now() / 1000)
      },
      ...current
    ].slice(0, 20));
    enqueueCelebration(side, soundEnabledRef.current);
  }

  function enqueueCelebrations(sides: BattleSide[], withSound: boolean) {
    if (sides.length === 0) return;
    celebrationQueueRef.current.push(...sides.map((side) => ({ side, withSound })));
    runNextCelebration();
  }

  function enqueueCelebration(side: CelebrationTarget, withSound: boolean) {
    celebrationQueueRef.current.push({ side, withSound });
    runNextCelebration();
  }

  function runNextCelebration() {
    if (celebrationActiveRef.current) return;
    const next = celebrationQueueRef.current.shift();
    if (!next) return;

    celebrationActiveRef.current = true;
    setCelebrationNonce((current) => current + 1);
    setCelebrationSide(next.side);
    setConfetti(createConfetti(next.side));
    setCelebrating(true);
    if (next.withSound) void playZapSound();

    window.clearTimeout(celebrationTimerRef.current);
    celebrationTimerRef.current = window.setTimeout(() => {
      setCelebrating(false);
      setConfetti([]);
      celebrationActiveRef.current = false;
      if (celebrationQueueRef.current.length > 0) {
        celebrationTimerRef.current = window.setTimeout(runNextCelebration, 80);
      }
    }, 980);
  }

  function toggleLocale() {
    setLocale((current) => {
      const next = current === "en" ? "ja" : "en";
      localStorage.setItem("zap-battle:locale", next);
      return next;
    });
  }

  function toggleSound() {
    setSoundEnabled((current) => {
      const next = !current;
      localStorage.setItem(SOUND_ENABLED_STORAGE_KEY, String(next));
      if (next) void primeZapSound().then(() => playSoundEnabledCue());
      return next;
    });
  }

  async function startBattle() {
    await postAdminAction("start", { session });
  }

  async function togglePauseBattle() {
    await postAdminAction("pause");
  }

  async function endBattle() {
    const confirmed = window.confirm("End this battle now? The timer will keep running unless you confirm.");
    if (!confirmed) return;
    await finalizeBattle();
  }

  async function finalizeBattle() {
    const receipts = session.startsAt
      ? await fetchZapReceiptsOnce({ session, since: session.startsAt, maxWait: 3500 })
      : [];
    const finalReceipts = mergeZapReceiptItems([...items, ...receipts]);
    await postAdminAction("end", {
      finalResult: createFinalResult(finalReceipts)
    });
  }

  async function postAdminAction(action: "start" | "pause" | "end", body?: unknown) {
    setAdminWorking(true);
    setAdminActionStatus(action === "start" ? "Starting..." : action === "pause" ? session.status === "paused" ? "Resuming..." : "Pausing..." : "Ending...");
    try {
      const adminToken = currentAdminToken(session.id);
      const response = await fetch(`/api/zap-live/sessions/${encodeURIComponent(session.id)}/${action}`, {
        method: "POST",
        headers: adminHeaders(adminToken),
        body: body ? JSON.stringify(body) : undefined
      });
      const json = await response.json() as SessionResponse;
      if (!response.ok) {
        setAdminActionStatus(action === "start" && json.errors?.length ? "Setup incomplete" : "Action failed");
        return;
      }
      onSessionChange?.(json.session);
      setAdminActionStatus(action === "start" ? "Started" : action === "pause" ? json.session.status === "live" ? "Resumed" : "Paused" : "Ended");
      window.setTimeout(() => setAdminActionStatus(""), 1600);
    } catch (error) {
      setAdminActionStatus(error instanceof Error ? error.message : "Admin action failed.");
    } finally {
      setAdminWorking(false);
    }
  }

  return (
    <main className="battle-shell">
      {celebrating ? (
        <div className={`celebration ${celebrationSide}`} aria-hidden="true" key={celebrationNonce}>
          <div className="burst-text">{celebrationSide === "center" ? "TIME UP!" : "ZAP!"}</div>
          {confetti.map((piece) => (
            <span
              className="confetti"
              key={piece.id}
              style={{
                "--x": piece.x,
                "--y": piece.y,
                "--dx": piece.dx,
                "--dy": piece.dy,
                "--r": piece.r,
                "--color": piece.color
              } as React.CSSProperties}
            />
          ))}
        </div>
      ) : null}

      <header className="battle-top">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">⚡</span>
          <h1>Zap Battle</h1>
        </div>

        <div className="battle-head-center">
          <span className="vs-title">V S</span>
          <div className="balance" aria-hidden="true">
            <span style={{ width: `${leftRatio}%` }} />
          </div>
          <p className="leader-text">
            {leader === "tied"
              ? `${copy.tied} ⚡`
              : leader === "left"
                ? `${displayContestantName(session.contestants.left)} ${copy.leads}`
                : `${displayContestantName(session.contestants.right)} ${copy.leads}`}
          </p>
          <BattleTimer session={session} copy={copy} />
        </div>

        <div className="top-actions">
          {adminEnabled && hasAdminToken ? (
            <div className="display-admin-actions">
              <button className="button gold" type="button" onClick={() => void startBattle()} disabled={adminWorking || session.status === "live" || session.status === "paused"}>
                Start
              </button>
              <button className="button gold" type="button" onClick={() => void togglePauseBattle()} disabled={adminWorking || (session.status !== "live" && session.status !== "paused")}>
                {session.status === "paused" ? "Resume" : "Pause"}
              </button>
              <button className="button" type="button" onClick={() => void endBattle()} disabled={adminWorking || session.status === "ended"}>
                End
              </button>
              {adminActionStatus ? <span>{adminActionStatus}</span> : null}
            </div>
          ) : null}
          <div className={`utility-menu ${utilityOpen ? "open" : ""}`} onClick={(event) => event.stopPropagation()}>
            <button className="button utility-trigger" type="button" onClick={() => setUtilityOpen((current) => !current)}>
              Settings
            </button>
            {utilityOpen ? (
              <div className="utility-menu-panel">
                <button className="button" type="button" onClick={() => {
                  toggleLocale();
                  setUtilityOpen(false);
                }}>
                  {locale === "en" ? "日本語" : "English"}
                </button>
                <button className="button gold" type="button" onClick={() => {
                  toggleSound();
                  setUtilityOpen(false);
                }}>
                  {copy.sound} {soundEnabled ? "On" : "Off"}
                </button>
                <a
                  className="button"
                  href={`/zap-battle/${encodeURIComponent(session.id)}/display`}
                  rel="noopener noreferrer"
                  target="_blank"
                  onClick={() => setUtilityOpen(false)}
                >
                  Display tab
                </a>
                {adminEnabled ? (
                  <button className="button" type="button" onClick={() => {
                    setUtilityOpen(false);
                    setAdminOpen(true);
                  }}>
                    {copy.admin}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className={`status ${session.status === "live" ? "live" : ""}`}>
            <span className="status-dot" aria-hidden="true" />
            <strong>{session.status === "live" ? "Live" : session.status === "ended" ? "Ended" : session.status === "paused" ? copy.paused : copy.ready}</strong>
          </div>
          {showDemoControls ? (
            <div className="demo-actions" aria-label="Demo Zap controls">
              <button className="button primary" type="button" onClick={() => addDemoZap("left")}>
                {copy.demoZap}: {displayContestantName(session.contestants.left)}
              </button>
              <button className="button primary" type="button" onClick={() => addDemoZap("right")}>
                {copy.demoZap}: {displayContestantName(session.contestants.right)}
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {adminOpen ? (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-label="Zap Battle Admin">
          <div className="admin-modal">
            <div className="admin-modal-bar">
              <strong>Zap Battle Admin</strong>
              <button className="button" type="button" onClick={() => setAdminOpen(false)}>
                {copy.close}
              </button>
            </div>
            <BattleAdminEditor compact locale={locale} onSessionChange={onSessionChange} sessionId={session.id} />
          </div>
        </div>
      ) : null}

      {session.status === "ended" ? (
        <>
          <FinalResultStage
            left={session.contestants.left}
            leftStats={leftStats}
            right={session.contestants.right}
            rightStats={rightStats}
            winner={leader}
            copy={copy}
          />
          <ZapFeed
            copy={copy}
            emptyText={copy.noZaps}
            left={session.contestants.left}
            leftItems={leftFeedItems}
            right={session.contestants.right}
            rightItems={rightFeedItems}
            title={copy.finalZaps}
            variant="final"
          />
        </>
      ) : (
        <>
          <section className="arena" aria-label="Zap Battle scoreboard">
            <ContestantStage
              sessionId={session.id}
              sessionStartsAt={session.startsAt}
              contestant={session.contestants.left}
              copy={copy}
              stats={leftStats}
            />
            <ContestantStage
              sessionId={session.id}
              sessionStartsAt={session.startsAt}
              contestant={session.contestants.right}
              copy={copy}
              stats={rightStats}
            />
          </section>
          <ZapFeed
            copy={copy}
            emptyText={copy.waiting}
            left={session.contestants.left}
            leftItems={leftFeedItems}
            right={session.contestants.right}
            rightItems={rightFeedItems}
            title={copy.realtimeZaps}
          />
        </>
      )}
    </main>
  );
}

function ZapFeed({
  copy,
  emptyText,
  left,
  leftItems,
  right,
  rightItems,
  title,
  variant
}: {
  copy: typeof COPY[Locale];
  emptyText: string;
  left: Contestant;
  leftItems: ZapReceiptItem[];
  right: Contestant;
  rightItems: ZapReceiptItem[];
  title: string;
  variant?: "final";
}) {
  return (
    <section className={`feed-dock ${variant === "final" ? "final" : ""}`} aria-label={title}>
      <h2>{title}</h2>
      <div className="feed-lanes">
        <FeedLane contestant={left} copy={copy} emptyText={emptyText} items={leftItems} />
        <FeedLane contestant={right} copy={copy} emptyText={emptyText} items={rightItems} />
      </div>
    </section>
  );
}

function FeedLane({
  contestant,
  copy,
  emptyText,
  items
}: {
  contestant: Contestant;
  copy: typeof COPY[Locale];
  emptyText: string;
  items: ZapReceiptItem[];
}) {
  return (
    <div className={`feed-lane ${contestant.side}`}>
      <h3>{displayContestantName(contestant)}</h3>
      {items.length > 0 ? (
        <ol className="feed-list">
          {items.map((item) => (
            <li className="feed-item" key={item.id}>
              <div>
                <p>
                  <span className="feed-sender">{item.senderName}</span>
                  <span className="feed-arrow" aria-hidden="true">-&gt;</span>
                  <span className="feed-target">{displayContestantName(contestant)}</span>
                </p>
                {item.comment.trim() ? <small className="feed-comment">{item.comment}</small> : null}
              </div>
              <strong>{item.amountSats.toLocaleString()} sats</strong>
            </li>
          ))}
        </ol>
      ) : (
        <p className="feed-empty">{emptyText}</p>
      )}
    </div>
  );
}

function FinalResultStage({
  left,
  leftStats,
  right,
  rightStats,
  winner,
  copy
}: {
  left: Contestant;
  leftStats: ReturnType<typeof calculateStats>;
  right: Contestant;
  rightStats: ReturnType<typeof calculateStats>;
  winner: BattleSide | "tied";
  copy: typeof COPY[Locale];
}) {
  const winnerName = winner === "tied"
    ? copy.tiedBattle
    : winner === "left"
      ? displayContestantName(left)
      : displayContestantName(right);
  const winnerStats = winner === "right" ? rightStats : leftStats;

  return (
    <section className="final-stage" aria-label="Final result">
      <div className="final-hero">
        <span>{copy.finalResult}</span>
        <h2>{winner === "tied" ? copy.draw : copy.winner}</h2>
        <strong>{winnerName}</strong>
        <p>{winner === "tied" ? copy.bothSidesLevel : `${winnerStats.totalSats.toLocaleString()} sats`}</p>
      </div>

      <div className="final-scoreboard">
        <FinalSideCard contestant={left} copy={copy} stats={leftStats} winner={winner === "left"} />
        <div className="final-vs">VS</div>
        <FinalSideCard contestant={right} copy={copy} stats={rightStats} winner={winner === "right"} />
      </div>
    </section>
  );
}

function FinalSideCard({
  contestant,
  copy,
  stats,
  winner
}: {
  contestant: Contestant;
  copy: typeof COPY[Locale];
  stats: ReturnType<typeof calculateStats>;
  winner: boolean;
}) {
  return (
    <article className={`final-card ${contestant.side} ${winner ? "winner" : ""}`}>
      <span>{winner ? copy.winner : copy.finalScore}</span>
      <h3>{displayContestantName(contestant)}</h3>
      <strong>{stats.totalSats.toLocaleString()}</strong>
      <small>sats</small>
      <div className="metric-row">
        <span>↓ {stats.count} zaps</span>
        <span>⚡ {stats.averageSats.toLocaleString()} {copy.avgSats}</span>
      </div>
    </article>
  );
}

function ContestantStage({
  sessionId,
  sessionStartsAt,
  contestant,
  copy,
  stats
}: {
  sessionId: string;
  sessionStartsAt: number | null;
  contestant: Contestant;
  copy: typeof COPY[Locale];
  stats: ReturnType<typeof calculateStats>;
}) {
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrStatus, setQrStatus] = useState("");
  const qrContestant = useMemo(() => ({
    side: contestant.side,
    displayName: contestant.displayName,
    lightningAddress: contestant.lightningAddress
  }), [contestant.side, contestant.displayName, contestant.lightningAddress]);

  useEffect(() => {
    let cancelled = false;
    async function createQr() {
      try {
        setQrStatus("");
        const payload = await qrPayloadForContestant(sessionId, sessionStartsAt, qrContestant);
        const dataUrl = await QRCode.toDataURL(payload, {
          errorCorrectionLevel: "L",
          margin: 2,
          width: 640,
          color: {
            dark: "#050505",
            light: "#ffffff"
          }
        });
        if (!cancelled) setQrDataUrl(dataUrl);
      } catch (error) {
        if (!cancelled) {
          setQrStatus(error instanceof Error ? error.message : copy.qrNotReady);
          setQrDataUrl("");
        }
      }
    }
    void createQr();
    return () => {
      cancelled = true;
    };
  }, [copy.qrNotReady, qrContestant, sessionId, sessionStartsAt]);

  return (
    <article className={`side ${contestant.side}`}>
      <div className="player-head">
        <h2>{displayContestantName(contestant)}</h2>
        <div className="score-mini">
          <div>
            <strong>{stats.totalSats.toLocaleString()}</strong>
            <small>sats</small>
          </div>
          <span>↓ {stats.count} zaps / ⚡ {stats.averageSats.toLocaleString()} {copy.avgSats}</span>
        </div>
      </div>

      <div className="qr-zone">
        <div className="qr-frame">
          {qrDataUrl ? <img src={qrDataUrl} alt={`${displayContestantName(contestant)} QR`} /> : null}
          {!qrDataUrl ? <span className="qr-empty">{qrStatus || "QR"}</span> : null}
        </div>
        <div className="lightning-address">{contestant.lightningAddress || copy.lightningMissing}</div>
      </div>

    </article>
  );
}

function BattleTimer({ session, copy }: { session: ZapBattleSession; copy: typeof COPY[Locale] }) {
  const [now, setNow] = useState(() => currentSeconds());

  useEffect(() => {
    if (session.status === "ended") return;
    const intervalId = window.setInterval(() => setNow(currentSeconds()), 1000);
    return () => window.clearInterval(intervalId);
  }, [session.status]);

  const timer = timerState(session, now, copy);

  return (
    <div className={`timer-badge ${timer.phase}`} aria-live="polite">
      <span>{timer.label}</span>
      <strong>{timer.value}</strong>
    </div>
  );
}

async function qrPayloadForContestant(sessionId: string, sessionStartsAt: number | null, contestant: Contestant): Promise<string> {
  if (!contestant.lightningAddress.trim()) return `lightning:${displayContestantName(contestant)}`;
  const response = await fetch("/api/zap-live/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sessionId,
      side: contestant.side,
      startsAt: sessionStartsAt ?? undefined
    })
  });
  const json = await response.json().catch(() => ({})) as { lnurlPayUrl?: string; reason?: string; error?: string };
  if (!response.ok) throw new Error(json.reason || json.error || "Failed to create LNURL token.");
  if (!json.lnurlPayUrl) throw new Error("LNURL token response is missing lnurlPayUrl.");
  return `lightning:${encodeLnurl(json.lnurlPayUrl)}`;
}

function timerState(session: ZapBattleSession, now: number, copy: typeof COPY[Locale]): { label: string; value: string; phase: string } {
  if (session.status === "ended") {
    return { label: copy.finalResult, value: "00:00", phase: "ended" };
  }

  if (session.status === "paused") {
    return { label: copy.paused, value: formatDuration(session.durationSeconds), phase: "ready" };
  }

  if (!session.startsAt || session.status !== "live") {
    return { label: copy.ready, value: formatDuration(session.durationSeconds), phase: "ready" };
  }

  const endAt = session.endsAt ?? session.startsAt + session.durationSeconds;
  const remaining = endAt - now;
  if (remaining > 0) {
    return { label: copy.timeLeft, value: formatDuration(remaining), phase: remaining <= 30 ? "urgent" : "live" };
  }

  return { label: copy.finalizing, value: "00:00", phase: "urgent" };
}

function formatDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function currentSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function displayContestantName(contestant: Contestant): string {
  if (contestant.displayName.trim()) return contestant.displayName.trim();
  return contestant.side === "left" ? "PLAYER 1" : "PLAYER 2";
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

function createFinalResult(receipts: ZapReceiptItem[]) {
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
    capturedAt: currentSeconds(),
    winner,
    left,
    right,
    receipts: normalized.slice(0, 80)
  };
}

function mergeZapReceiptItems(receipts: ZapReceiptItem[]): ZapReceiptItem[] {
  const byId = new Map<string, ZapReceiptItem>();
  receipts.forEach((item) => {
    byId.set(item.id, mergeZapReceiptItem(byId.get(item.id), item));
  });
  return Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt);
}

function mergeZapReceiptItem(existing: ZapReceiptItem | undefined, incoming: ZapReceiptItem): ZapReceiptItem {
  if (!existing) return incoming;
  if (isShortPubkeyName(incoming.senderName) && !isShortPubkeyName(existing.senderName)) {
    return {
      ...incoming,
      senderName: existing.senderName
    };
  }
  return incoming;
}

function isShortPubkeyName(value: string): boolean {
  return /^[0-9a-f]{8}\.\.\.[0-9a-f]{4}$/i.test(value);
}

function adminHeaders(adminToken: string): HeadersInit {
  return {
    "content-type": "application/json",
    ...(adminToken.trim() ? { "x-admin-token": adminToken.trim() } : {})
  };
}

function currentAdminToken(sessionId: string): string {
  const keys = [adminTokenStorageKey(sessionId), globalAdminTokenStorageKey()];
  for (const key of keys) {
    const value = sessionStorage.getItem(key) ?? localStorage.getItem(key);
    if (value) return value;
  }
  return "";
}

function adminTokenStorageKey(sessionId: string): string {
  return `zap-battle:admin-token:${sessionId}`;
}

function globalAdminTokenStorageKey(): string {
  return "zap-battle:admin-token";
}

function createConfetti(target: CelebrationTarget): ConfettiPiece[] {
  const centerX = target === "left" ? 25 : target === "right" ? 75 : 50;
  const centerY = target === "center" ? 42 : 36;
  return Array.from({ length: 72 }, (_, index) => {
    const side = index % 2 === 0 ? -1 : 1;
    const spread = 80 + Math.random() * 260;
    return {
      id: `${Date.now()}-${index}`,
      x: `${centerX - 4 + Math.random() * 8}%`,
      y: `${centerY - 6 + Math.random() * 12}%`,
      dx: `${side * spread}px`,
      dy: `${-220 + Math.random() * 420}px`,
      r: `${Math.random() * 360}deg`,
      color: CONFETTI_COLORS[index % CONFETTI_COLORS.length] ?? "#ffd238"
    };
  });
}

async function playZapSound() {
  const context = getAudioContext();
  if (!context) return;
  await resumeAudioContext(context);
  const now = context.currentTime;
  const output = context.createGain();
  output.gain.setValueAtTime(0.0001, now);
  output.gain.exponentialRampToValueAtTime(0.24, now + 0.02);
  output.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
  output.connect(context.destination);

  [520, 784, 1046].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = index === 0 ? "triangle" : "square";
    oscillator.frequency.setValueAtTime(frequency, now + index * 0.055);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.16, now + index * 0.055 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.055 + 0.22);
    oscillator.connect(gain);
    gain.connect(output);
    oscillator.start(now + index * 0.055);
    oscillator.stop(now + index * 0.055 + 0.26);
  });

}

async function playTimeUpSound() {
  const context = getAudioContext();
  if (!context) return;
  await resumeAudioContext(context);
  const now = context.currentTime;
  const output = context.createGain();
  output.gain.setValueAtTime(0.0001, now);
  output.gain.exponentialRampToValueAtTime(0.28, now + 0.03);
  output.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
  output.connect(context.destination);

  [880, 660, 440, 220].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const startAt = now + index * 0.12;
    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.14, startAt + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.16);
    oscillator.connect(gain);
    gain.connect(output);
    oscillator.start(startAt);
    oscillator.stop(startAt + 0.18);
  });

}

async function primeZapSound() {
  const context = getAudioContext();
  if (!context) return;
  await resumeAudioContext(context);
}

async function resumeAudioContext(context: AudioContext): Promise<void> {
  if (context.state === "suspended") await context.resume().catch(() => undefined);
}

function playSoundEnabledCue() {
  const context = getAudioContext();
  if (!context) return;
  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(660, now);
  oscillator.frequency.exponentialRampToValueAtTime(880, now + 0.12);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.2);
}

let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!sharedAudioContext || sharedAudioContext.state === "closed") {
    sharedAudioContext = new AudioContextClass();
  }
  return sharedAudioContext;
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
