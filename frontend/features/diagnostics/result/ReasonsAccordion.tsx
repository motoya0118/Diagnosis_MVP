import type { ScoreKey } from "./types";

type ReasonRow = {
  key: ScoreKey;
  label: string;
  color: string;
  score: number | null;
  reason: string | null;
};

export type ReasonItem = {
  id: string;
  rank: number;
  name: string;
  reasons: ReasonRow[];
  hasMeta: boolean;
};

type Props = {
  items: ReasonItem[];
  openId: string | null;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
};

export function ReasonsAccordion({ items, openId, onToggle, onSelect }: Props) {
  if (!items.length) {
    return null;
  }

  return (
    <section className="card reasons-accordion">
      <header className="section-header">
        <h2>おすすめ職種ランキング</h2>
        <p className="section-sub">
          各職種を展開してマッチ理由を確認しましょう。詳しく知りたい職種は「職種詳細を見る」から開けます。
        </p>
      </header>
      <div className="reasons-accordion__list">
        {items.map((item) => {
          const open = openId === item.id;
          return (
            <div key={item.id} className={`reasons-accordion__item${open ? " is-open" : ""}`}>
              <button
                type="button"
                className="reasons-accordion__header"
                onClick={() => onToggle(item.id)}
                aria-expanded={open}
              >
                <span className="reasons-accordion__title">
                  <span className="reasons-accordion__rank">{item.rank}</span>
                  <span className="reasons-accordion__name">{item.name}</span>
                  {item.hasMeta ? <span className="reasons-accordion__meta">詳細あり</span> : null}
                </span>
                <span className="reasons-accordion__icon" aria-hidden="true">
                  {open ? "−" : "＋"}
                </span>
              </button>
              {open ? (
                <div className="reasons-accordion__panel">
                  <button
                    type="button"
                    className="reasons-accordion__open-detail"
                    onClick={() => onSelect(item.id)}
                  >
                    職種詳細を見る
                  </button>
                  <div className="reasons-accordion__table" role="list">
                    {item.reasons.map((reason) => (
                      <div key={reason.key} className="reasons-accordion__row" role="listitem">
                        <div className="reasons-accordion__row-header">
                          <span
                            className="metric-dot"
                            style={{ backgroundColor: reason.color }}
                            aria-hidden="true"
                          />
                          <span className="reasons-accordion__metric-label">{reason.label}</span>
                          <span className="reasons-accordion__metric-score">
                            {reason.score !== null ? Math.round(reason.score) : "—"}
                          </span>
                        </div>
                        <p className="reasons-accordion__metric-reason">
                          {reason.reason ?? "理由は生成されませんでした。"}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
