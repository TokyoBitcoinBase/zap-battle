import { BattleLauncher } from "@/src/ui/battle-launcher";

export default function HomePage() {
  return (
    <main className="page">
      <section className="topbar">
        <div className="title">
          <h1>Zap Battle</h1>
          <p>観客からのLightning Zapをリアルタイム集計して、対戦者ごとの応援額を競うバトル用スコアボードです。</p>
        </div>
        <div className="status">
          <span className="status-dot" aria-hidden="true" />
          <strong>setup</strong>
        </div>
      </section>

      <BattleLauncher />
    </main>
  );
}
