"use client";

import { useEffect, type ReactElement } from "react";

import type { RankedRecommendation, ScoreKey } from "./types";

type OutcomeMeta = Record<string, unknown> | null;

type Props = {
  open: boolean;
  ranking: RankedRecommendation | null;
  meta: OutcomeMeta;
  onClose: () => void;
  series: Record<ScoreKey, { label: string; color: string }>;
};

type MetaSection = {
  key: string;
  label: string;
  type: "text" | "list" | "links";
};

const META_SECTIONS: MetaSection[] = [
  { key: "role_summary", label: "職種概要", type: "text" },
  { key: "avg_salary_jpy", label: "想定年収", type: "text" },
  { key: "target_phase", label: "対象フェーズ", type: "list" },
  { key: "main_role", label: "主な役割", type: "list" },
  { key: "collaboration_style", label: "関わり方", type: "list" },
  { key: "strength_areas", label: "活躍が期待される領域", type: "list" },
  { key: "description", label: "業務詳細", type: "text" },
  { key: "core_skills", label: "必要スキル", type: "list" },
  { key: "deliverables", label: "主な成果物", type: "list" },
  { key: "pathway_detail", label: "キャリアパス", type: "text" },
  { key: "ai_tools", label: "推奨AIツール", type: "list" },
  { key: "advice", label: "キャリアアドバイス", type: "text" },
];

function normaliseListValue(value: unknown): string[] | null {
  if (Array.isArray(value)) {
    const strings = value
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (item && typeof item === "object" && "name" in item && typeof item.name === "string") {
          return item.name.trim();
        }
        return "";
      })
      .filter(Boolean);
    return strings.length ? strings : null;
  }

  if (typeof value === "string") {
    const parts = value
      .split(/\r?\n|、|,|\u3001|\u30fb/)
      .map((part) => part.trim())
      .filter(Boolean);
    return parts.length ? parts : null;
  }

  return null;
}

function normaliseLinks(value: unknown): { label: string; url: string }[] | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    const links = value
      .map((item) => {
        if (typeof item === "string") {
          return { label: item, url: item };
        }
        if (
          item &&
          typeof item === "object" &&
          "label" in item &&
          "url" in item &&
          typeof item.label === "string" &&
          typeof item.url === "string"
        ) {
          return { label: item.label, url: item.url };
        }
        return null;
      })
      .filter((entry): entry is { label: string; url: string } => Boolean(entry));
    return links.length ? links : null;
  }

  if (typeof value === "string") {
    return [{ label: value, url: value }];
  }

  return null;
}

function renderMetaSection(section: MetaSection, meta: OutcomeMeta) {
  if (!meta) return null;
  const value = meta[section.key];
  if (value === undefined || value === null || value === "") {
    return null;
  }

  switch (section.type) {
    case "text": {
      if (typeof value !== "string") {
        return null;
      }
      const paragraphs = value
        .split(/\r?\n+/)
        .map((part) => part.trim())
        .filter(Boolean);
      if (!paragraphs.length) {
        return null;
      }
      return (
        <div key={section.key} className="modal-section">
          <h3>{section.label}</h3>
          {paragraphs.map((paragraph, index) => (
            <p key={`${section.key}-${index}`}>{paragraph}</p>
          ))}
        </div>
      );
    }
    case "list": {
      const items = normaliseListValue(value);
      if (!items) return null;
      return (
        <div key={section.key} className="modal-section">
          <h3>{section.label}</h3>
          <ul className="modal-list">
            {items.map((item, index) => (
              <li key={`${section.key}-${index}`}>{item}</li>
            ))}
          </ul>
        </div>
      );
    }
    case "links": {
      const links = normaliseLinks(value);
      if (!links) return null;
      return (
        <div key={section.key} className="modal-section">
          <h3>{section.label}</h3>
          <ul className="modal-list">
            {links.map((link, index) => (
              <li key={`${section.key}-${index}`}>
                <a href={link.url} target="_blank" rel="noreferrer">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    default:
      return null;
  }
}

export function OutcomeModal({ open, ranking, meta, onClose, series }: Props) {
  useEffect(() => {
    if (!open) return undefined;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open || !ranking) {
    return null;
  }

  const category =
    meta && typeof meta.category === "string" && meta.category.trim() ? (meta.category as string).trim() : null;

  const metaSections = META_SECTIONS.map((section) => renderMetaSection(section, meta)).filter(
    (section): section is ReactElement => Boolean(section),
  );

  const hasMetaContent = metaSections.length > 0;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="閉じる">
          ×
        </button>

        <header className="modal-header">
          <h2 id="modal-title">{ranking.name}</h2>
          {category ? <p className="modal-subtitle">{category}</p> : null}
          <p className="modal-subtitle">診断結果の詳細情報</p>
        </header>

        <section className="modal-section">
          <h3>スコア概要</h3>
          <ul className="modal-score-list">
            {Object.entries(series).map(([key, definition]) => {
              const typedKey = key as ScoreKey;
              const score = ranking.scores[typedKey];
              const reason = ranking.reasons[typedKey];
              return (
                <li key={typedKey}>
                  <span
                    className="metric-dot"
                    style={{ backgroundColor: definition.color }}
                    aria-hidden="true"
                  />
                  <span className="modal-score-label">{definition.label}</span>
                  <span className="modal-score-value">
                    {score !== null ? Math.round(score) : "—"}
                  </span>
                  <p className="modal-score-reason">
                    {reason ?? "理由は生成されませんでした。"}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>

        {hasMetaContent ? (
          metaSections
        ) : (
          <section className="modal-section">
            <h3>追加情報</h3>
            <p>
              職種メタ情報が見つからなかったため、LLMの理由のみを表示しています。上記の各スコア理由をご確認ください。
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
