"use client";

import { useEffect, useState } from "react";
import { readBrowserStorage, writeBrowserStorage } from "@/src/browser-storage";
import { BattleLauncher, type BattleLauncherLocale } from "@/src/ui/battle-launcher";
import { LightningMark } from "@/src/ui/lightning-mark";

const HOME_COPY = {
  en: {
    description: "Collect audience Lightning Zaps live. Compare two contestants in Battle mode, or support one performer in Solo mode.",
    language: "Language",
    setup: "setup"
  },
  ja: {
    description: "観客からのLightning Zapをリアルタイム集計。二人で競うバトルにも、一人を応援するソロライブにも使えます。",
    language: "言語",
    setup: "セットアップ"
  }
} satisfies Record<BattleLauncherLocale, {
  description: string;
  language: string;
  setup: string;
}>;

const LOCALE_STORAGE_KEY = "zap-battle:locale";

export default function HomePage() {
  const [locale, setLocale] = useState<BattleLauncherLocale>("ja");
  const copy = HOME_COPY[locale];

  useEffect(() => {
    const stored = readBrowserStorage(LOCALE_STORAGE_KEY, ["local"]);
    if (stored === "ja" || stored === "en") setLocale(stored);
  }, []);

  function selectLocale(nextLocale: BattleLauncherLocale) {
    setLocale(nextLocale);
    writeBrowserStorage(LOCALE_STORAGE_KEY, nextLocale, ["local"]);
  }

  return (
    <main className="page">
      <section className="topbar home-topbar">
        <div className="title">
          <p className="home-kicker">LIVE LIGHTNING · BATTLE & SOLO</p>
          <h1 className="home-wordmark"><LightningMark />Zap Battle</h1>
          <p>{copy.description}</p>
        </div>
        <div className="home-top-actions">
          <div className="language-switch" role="group" aria-label={copy.language}>
            <button
              aria-pressed={locale === "ja"}
              className={`language-option ${locale === "ja" ? "active" : ""}`}
              onClick={() => selectLocale("ja")}
              type="button"
            >
              日本語
            </button>
            <button
              aria-pressed={locale === "en"}
              className={`language-option ${locale === "en" ? "active" : ""}`}
              onClick={() => selectLocale("en")}
              type="button"
            >
              English
            </button>
          </div>
          <div className="status">
            <span className="status-dot" aria-hidden="true" />
            <strong>{copy.setup}</strong>
          </div>
        </div>
      </section>

      <BattleLauncher locale={locale} />
    </main>
  );
}
