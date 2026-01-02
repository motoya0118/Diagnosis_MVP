import { extractContentText, normaliseLlmResult } from "../../../features/diagnostics/result/parser";

describe("normaliseLlmResult", () => {
  it("parses plain JSON content into ranked recommendations", () => {
    const raw = {
      content: [
        {
          text: JSON.stringify({
            1: {
              name: "AIエンジニア",
              total_match: { score: 92.4, reason: "技術スキルが高い" },
              personality_match: { score: 80, reason: "探究心が強い" },
              work_match: { score: 88, reason: "開発実務経験が豊富" },
            },
          }),
        },
      ],
    };

    const result = normaliseLlmResult(raw);
    expect(result.warnings).toHaveLength(0);
    expect(result.rankings).toHaveLength(1);
    const [entry] = result.rankings;
    expect(entry.rank).toBe(1);
    expect(entry.name).toBe("AIエンジニア");
    expect(entry.scores.total_match).toBeCloseTo(92.4);
    expect(entry.reasons.work_match).toBe("開発実務経験が豊富");
  });

  it("parses JSON wrapped in code fences and clamps scores", () => {
    const raw = {
      content: [
        {
          text: [
            "```json\n",
            JSON.stringify({
              1: {
                name: "AI戦略コンサルタント",
                total_match: { score: 120, reason: "ビジネス経験が豊富" },
                personality_match: { score: -15, reason: "社交性が課題" },
                work_match: { score: 75.678, reason: "プロジェクト推進力が高い" },
              },
            }),
            "\n```",
          ].join(""),
        },
      ],
    };

    const result = normaliseLlmResult(raw);
    expect(result.rankings).toHaveLength(1);
    const [entry] = result.rankings;
    expect(entry.scores.total_match).toBe(100);
    expect(entry.scores.personality_match).toBe(0);
    expect(entry.scores.work_match).toBeCloseTo(75.7);
  });

  it("accepts sanitised result payloads directly", () => {
    const raw = {
      1: {
        name: "生成AIプロダクトマネージャー",
        total_match: { score: 95, reason: "生成AIサービス企画経験が豊富" },
        personality_match: { score: 91, reason: "探索志向が強い" },
        work_match: { score: 88, reason: "プロダクト開発チームと連携できる" },
      },
      2: {
        name: "AIリサーチエンジニア",
        total_match: { score: 89, reason: "研究成果の実装経験がある" },
        personality_match: { score: 86, reason: "仮説検証へ粘り強く取り組む" },
        work_match: { score: 82, reason: "論文調査と実装を行った実績がある" },
      },
    };

    const result = normaliseLlmResult(raw);
    expect(result.warnings).toHaveLength(0);
    expect(result.rankings).toHaveLength(2);
    expect(result.rankings[0].name).toBe("生成AIプロダクトマネージャー");
    expect(result.rankings[1].scores.work_match).toBe(82);
  });

  it("returns warnings when JSON parsing fails", () => {
    const raw = {
      content: [{ text: "not-json" }],
    };
    const result = normaliseLlmResult(raw);
    expect(result.rankings).toHaveLength(0);
    expect(result.warnings).not.toHaveLength(0);
  });

  it("recovers partial rankings when the JSON output is truncated", () => {
    const raw = {
      content: [
        {
          text: [
            "```json\n",
            "{\n",
            '  "1": {\n',
            '    "name": "AIリサーチャー",\n',
            '    "total_match": { "score": 92, "reason": "研究への情熱" },\n',
            '    "personality_match": { "score": 90, "reason": "創造性が高い" },\n',
            '    "work_match": { "score": 88, "reason": "探求志向が強い" }\n',
            "  },\n",
            '  "2": {\n',
            '    "name": "データサイエンティスト",\n',
            '    "total_match": { "score": 87, "reason": "分析力が高い" },\n',
            '    "personality_match": { "score": 85, "reason": "論理的である" },\n',
            '    "work_match": { "score": 82, "reason": "実務経験が豊富" }\n',
            "  },\n",
            '  "3": {\n',
            '    "name": "AIプロダクトマネージャー",\n',
            '    "total_match": { "score": 84, "reason": "技術とビジネスの橋渡し" },\n',
            '    "personality_match": { "score": 80, "reason": "共感力が高い" },\n',
            '    "work_match": { "score": 81, "reason": "リーダー経験がある',
          ].join(""),
        },
      ],
    };

    const result = normaliseLlmResult(raw);
    expect(result.rankings).toHaveLength(2);
    expect(result.rankings[0].name).toBe("AIリサーチャー");
    expect(result.warnings).toContain("LLMの結果が途中で途切れていたため、一部のみ復元しました。");
  });

  it("parses Gemini candidate payloads", () => {
    const raw = {
      parsed: null,
      candidates: [
        {
          content: {
            role: "model",
            parts: [
              {
                text: [
                  "```json\n",
                  JSON.stringify({
                    1: {
                      name: "AI品質保証・テストエンジニア",
                      total_match: { score: 96, reason: "品質と倫理に強い関心がある" },
                      personality_match: { score: 98, reason: "慎重で支援的な性格" },
                      work_match: { score: 97, reason: "リスク管理と品質保証の経験がある" },
                    },
                    2: {
                      name: "AI UXデザイナー（体験設計重視）",
                      total_match: { score: 89, reason: "人間中心の支援に関心がある" },
                      personality_match: { score: 92, reason: "共感力が高い" },
                      work_match: { score: 88, reason: "UX研究とサービスデザインの経験がある" },
                    },
                  }),
                  "\n```",
                ].join(""),
              },
            ],
          },
        },
      ],
    };

    const result = normaliseLlmResult(raw);
    expect(result.rankings).toHaveLength(2);
    expect(result.rankings[0].name).toBe("AI品質保証・テストエンジニア");
    expect(result.warnings).toHaveLength(0);
  });
});

describe("extractContentText", () => {
  it("returns null when content is missing", () => {
    expect(extractContentText(null)).toBeNull();
    expect(extractContentText({})).toBeNull();
  });

  it("extracts text from Gemini candidates", () => {
    const payload = {
      candidates: [
        {
          index: 0,
          content: {
            role: "model",
            parts: [
              { text: "```json\n{\"1\":{\"name\":\"AI UX\"}}\n```" },
            ],
          },
        },
      ],
    };

    expect(extractContentText(payload)).toContain("\"AI UX\"");
  });
});
