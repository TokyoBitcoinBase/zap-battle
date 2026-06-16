"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export function BattleLauncher() {
  const [battleId, setBattleId] = useState("demo");
  const [adminToken, setAdminToken] = useState("");
  const [verified, setVerified] = useState(false);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState("");
  const normalizedId = useMemo(() => normalizeBattleId(battleId), [battleId]);
  const displayPath = `/zap-battle/${encodeURIComponent(normalizedId)}/display`;
  const operatorPath = `${displayPath}?admin=1`;

  useEffect(() => {
    const stored = localStorage.getItem(globalAdminTokenStorageKey()) ?? "";
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
      localStorage.setItem(globalAdminTokenStorageKey(), token.trim());
      setVerified(true);
      setStatus("Admin token verified.");
    } catch (error) {
      setVerified(false);
      setStatus(error instanceof Error ? error.message : "Admin token is invalid.");
    } finally {
      setChecking(false);
    }
  }

  function rememberSessionToken() {
    localStorage.setItem(globalAdminTokenStorageKey(), adminToken.trim());
    localStorage.setItem(adminTokenStorageKey(normalizedId), adminToken.trim());
  }

  return (
    <section className="launcher">
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
      <button className="button gold" disabled={checking} onClick={() => void verifyToken()} type="button">
        {checking ? "Checking..." : "Unlock Battle Setup"}
      </button>
      {status ? <p className="admin-status">{status}</p> : null}

      {verified ? (
        <>
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
          <div className="launcher-preview">
            <span>Public URL</span>
            <code>{displayPath}</code>
          </div>
          <div className="home-actions">
            <Link className="button primary" href={operatorPath} onClick={rememberSessionToken}>
              Open Operator Display
            </Link>
            <Link className="button" href={displayPath} onClick={rememberSessionToken}>
              Open Public Display
            </Link>
          </div>
        </>
      ) : null}
    </section>
  );
}

function normalizeBattleId(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return normalized || "demo";
}

function adminHeaders(adminToken: string): HeadersInit {
  return {
    "content-type": "application/json",
    ...(adminToken.trim() ? { "x-admin-token": adminToken.trim() } : {})
  };
}

function globalAdminTokenStorageKey(): string {
  return "zap-battle:admin-token";
}

function adminTokenStorageKey(sessionId: string): string {
  return `zap-battle:admin-token:${sessionId}`;
}
