"use client";

import Link from "next/link";
import { useEffect, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";

const DIAGNOSTIC_ROUTE = "/diagnostics/common_qa?diagnostic_code=ai_career";

type SummaryItem = {
  label: string;
  value: string;
  full?: boolean;
};

const SUMMARY_ITEMS: readonly SummaryItem[] = [
  { label: "所要時間", value: "約3分" },
  { label: "質問数", value: "12問（選択式）" },
  { label: "結果の出力形式", value: "ITキャリアタイプ / 推奨スキル / 推奨アクション" },
  {
    label: "個人情報の扱い",
    value: "回答は診断結果の提供とサービス改善にのみ利用し、許可なく第三者へ提供しません。",
    full: true,
  },
];

const FAQ_ITEMS = [
  {
    question: "診断結果はどのように活用できますか？",
    answer:
      "強みと伸ばしたい領域が整理され、学ぶべきスキルや次に取るアクションが明確になります。面談や学習計画づくりにも活用できます。",
  },
  {
    question: "どのような方におすすめですか？",
    answer:
      "IT領域でキャリアを築きたい方はもちろん、企画・営業・管理など非エンジニア職種でITスキルを伸ばしたい方にも最適です。現在の役割に合わせて提案内容が変わります。",
  },
  {
    question: "診断結果は後から見返せますか？",
    answer:
      "会員登録後はマイページに履歴が保存され、成長の変化を時系列で振り返れます。必要に応じていつでも再診断が可能です。",
  },
] as const;

export default function ItCareerDiagnosticTopPage() {
  const router = useRouter();
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    router.prefetch?.(DIAGNOSTIC_ROUTE);
  }, [router]);

  const handleStart = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (isTransitioning) {
      return;
    }

    setIsTransitioning(true);
    window.setTimeout(() => {
      router.push(DIAGNOSTIC_ROUTE);
    }, 180);
  };

  return (
    <main className={`diagnostic-top${isTransitioning ? " is-fading" : ""}`}>
      <section className="lp-hero diagnostic-hero">
        <div className="container">
          <p className="lp-eyebrow">ITキャリア診断</p>
          <h1 className="lp-title">いまの経験から、ITキャリアの可能性を導き出す</h1>
          <p className="lp-sub">
            質問に答えるだけで、強み・伸ばすべきスキル・次のアクションが分かる診断です。
            キャリアの方向性に迷ったときのコンパスとしてご活用ください。
          </p>
          <div className="lp-cta">
            <Link
              className="btn btn-cta"
              href={DIAGNOSTIC_ROUTE}
              onClick={handleStart}
              data-loading={isTransitioning}
            >
              診断を開始
            </Link>
            <span className="lp-note">ログイン不要・回答の編集は後からでも可能です</span>
          </div>
        </div>
      </section>

      <section className="diagnostic-summary">
        <div className="container">
          <h2 className="lp-h2">診断概要</h2>
          <p className="summary-intro">
            あなたのキャリア資産とITスキルの親和性を多角的に分析します。回答内容からおすすめのロールや学習テーマを提示し、具体的な行動に繋げられるレポートを提供します。
          </p>
          <div className="meta-grid">
            {SUMMARY_ITEMS.map(({ label, value, full }) => (
              <div className={`meta-item${full ? " full" : ""}`} key={label}>
                <p className="meta-label">{label}</p>
                <p className="meta-value">{value}</p>
              </div>
            ))}
          </div>
          <ul className="diagnostic-highlights">
            <li>
              <h3>キャリアタイプを可視化</h3>
              <p>現在の役割や志向性をもとに、IT領域で伸びるポジションを複数提示します。</p>
            </li>
            <li>
              <h3>推奨スキルを優先度付きで提案</h3>
              <p>伸ばすべきスキルを緊急度・重要度で整理。学習計画の土台づくりに役立ちます。</p>
            </li>
            <li>
              <h3>アクションプランを自動生成</h3>
              <p>毎日の学習タスクやチームへの提案アイデアなど、実践的な次の一手を提示します。</p>
            </li>
            <li>
              <h3>レポート共有もワンクリック</h3>
              <p>結果はPDFとして出力でき、上司やメンターとの対話に活かせます。</p>
            </li>
          </ul>
        </div>
      </section>

      <section className="diagnostic-faq">
        <div className="container">
          <h2 className="lp-h2">よくある質問</h2>
          <ul className="diagnostic-faq-list">
            {FAQ_ITEMS.map(({ question, answer }) => (
              <li key={question}>
                <h3>{question}</h3>
                <p>{answer}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="lp-cta-band">
        <div className="container">
          <h2 className="lp-h2">診断からキャリアのアップデートを始めましょう</h2>
          <p className="lp-sub small">
            診断結果はいつでも見返せます。変化を確認しながら、ITキャリアを育てましょう。
          </p>
          <Link
            className="btn btn-cta"
            href={DIAGNOSTIC_ROUTE}
            onClick={handleStart}
            data-loading={isTransitioning}
          >
            診断を開始
          </Link>
        </div>
      </section>
    </main>
  );
}
