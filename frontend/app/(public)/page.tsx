import Link from "next/link";

export default function TopPage() {
  return (
    <main>
      <section className="lp-hero">
        <div className="container">
          <p className="lp-eyebrow">IT人材のためのキャリア支援</p>
          <h1 className="lp-title">ITキャリアの次の一歩を、確かな道筋に。</h1>
          <p className="lp-sub">
            ITはすべての業界の基盤に。私たちは“ITで成果を出す人材”が育ち、流通し、活躍できる環境をつくります。
          </p>
          <div className="lp-cta">
            <Link className="btn btn-cta" href="/register">無料で会員登録</Link>
            <Link className="btn secondary" href="/diagnostics/ai_career">3分でキャリア診断</Link>
          </div>
          <div className="lp-kpis">
            <div className="kpi"><strong>10階層</strong><span>キャリア診断</span></div>
            <div className="kpi"><strong>＋</strong><span>スキルタグ成長</span></div>
            <div className="kpi"><strong>→</strong><span>推奨アクション提案</span></div>
          </div>
        </div>
      </section>

      <section className="lp-vision">
        <div className="container">
          <div className="vision-card">
            <h2 className="lp-h2">ビジョン</h2>
            <p>ITはすでに特別な存在ではなく、社会やビジネスに溶け込み、日常の一部となりつつあります。この変化の波は、すべての事業、すべての職種に及び、私たちの働き方や価値のつくり方を根底から変えていきます。</p>
            <p>私たちは、過渡期にある時代の変化を可能性として受け止め、企業と人が共に進化できる環境をつくります。スキルや経験だけでなく、ITで成果を実行できる“IT人材”を育成・流通させ、社会全体の競争力を高めることが私たちの使命です。</p>
            <p>ITを軸にした時代の変化は、挑戦の時であり、成長の機会です。私たちは、必要とされる場で、必要とされる人が最大限に力を発揮できる社会を実現します。</p>
          </div>
        </div>
      </section>

      <section className="lp-benefits">
        <div className="container">
          <h2 className="lp-h2">Avantiでできること</h2>
          <div className="lp-grid">
            <div className="lp-card">
              <h3>精度の高いキャリア診断</h3>
              <p>10階層の多角診断とスキルタグで、強み/伸びしろを可視化。学ぶ優先順位が明確になります。</p>
            </div>
            <div className="lp-card">
              <h3>キャリア伴走サポート</h3>
              <p>推奨アクションを継続的に提示。学習/実務/転職活動を一気通貫で支援します。</p>
            </div>
            <div className="lp-card">
              <h3>機会へのアクセス</h3>
              <p>ITロールの情報や実務に近い要件/スキルを整理。あなたの価値を最大化する場へ導きます。</p>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-cta-band">
        <div className="container">
          <h2 className="lp-h2">今すぐはじめよう</h2>
          <p className="lp-sub small">登録後も無料で使えます。まずは可能性を可視化し、次の一歩へ。</p>
          <div className="lp-cta" style={{justifyContent:'center'}}>
            <Link className="btn btn-cta" href="/register">無料で会員登録</Link>
            <Link className="btn secondary" href="/diagnostics/ai_career">3分でキャリア診断</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
