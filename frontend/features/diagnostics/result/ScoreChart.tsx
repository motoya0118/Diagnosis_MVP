import type { ScoreKey } from "./types";

export type SeriesDefinition = {
  key: ScoreKey;
  label: string;
  color: string;
};

export type ChartSegment = {
  key: ScoreKey;
  value: number;
  width: number;
  reason: string | null;
  color: string;
  label: string;
};

export type ChartRow = {
  id: string;
  label: string;
  name: string;
  segments: ChartSegment[];
  total: number;
};

type Props = {
  rows: ChartRow[];
  series: SeriesDefinition[];
  visibility: Record<ScoreKey, boolean>;
  onToggle: (key: ScoreKey) => void;
  onHover: (payload: { label: string; reason: string | null } | null) => void;
  onSelect: (id: string) => void;
};

export function ScoreChart({ rows, series, visibility, onToggle, onHover, onSelect }: Props) {
  if (!rows.length) {
    return null;
  }

  const activeCount = series.filter(({ key }) => visibility[key]).length;

  return (
    <section className="card score-chart">
      <header className="section-header">
        <h2>スコア比較グラフ</h2>
        <p className="section-sub">凡例を切り替えると各指標を表示/非表示できます。</p>
      </header>

      <div className="score-chart__legend" role="tablist" aria-label="スコア指標の表示切替">
        {series.map((entry) => {
          const active = visibility[entry.key];
          const disabled = active && activeCount === 1;
          return (
            <button
              key={entry.key}
              type="button"
              className={`score-chart__legend-button${active ? " is-active" : ""}`}
              onClick={() => {
                if (disabled) return;
                onToggle(entry.key);
              }}
              aria-pressed={active}
              aria-disabled={disabled}
            >
              <span
                className="metric-dot"
                style={{ backgroundColor: entry.color }}
                aria-hidden="true"
              />
              {entry.label}
            </button>
          );
        })}
      </div>

      <div className="score-chart__rows">
        {rows.map((row) => (
          <div key={row.id} className="score-chart__row">
            <button
              type="button"
              className="score-chart__label"
              onClick={() => onSelect(row.id)}
            >
              {row.label}
            </button>
            <div className="score-chart__bar" role="presentation">
              {row.segments.map((segment) => (
                <div
                  key={segment.key}
                  className="score-chart__segment"
                  style={{
                    width: `${segment.width}%`,
                    backgroundColor: segment.color,
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`${row.label} ${segment.label} ${Math.round(segment.value)}点`}
                  onMouseEnter={() =>
                    onHover({
                      label: `${row.label} – ${segment.label}`,
                      reason: segment.reason,
                    })
                  }
                  onMouseLeave={() => onHover(null)}
                  onFocus={() =>
                    onHover({
                      label: `${row.label} – ${segment.label}`,
                      reason: segment.reason,
                    })
                  }
                  onBlur={() => onHover(null)}
                >
                  <span className="score-chart__segment-value">
                    {Math.round(segment.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
