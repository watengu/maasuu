// 内蔵スタンプ（まぁ＆すぅ セット。素材は LINE スタンプ制作ラインと同一）
export type Stamp = { id: string; src: string; label: string };

export const STAMPS: Stamp[] = [
  { id: "stamp-01", src: "/stamps/stamp-01.png", label: "強い言葉はつかわないで" },
  { id: "stamp-02", src: "/stamps/stamp-02.png", label: "やるじゃん" },
  { id: "stamp-03", src: "/stamps/stamp-03.png", label: "ぷい・ウケる" },
  { id: "stamp-04", src: "/stamps/stamp-04.png", label: "であるかっ" },
  { id: "stamp-05", src: "/stamps/stamp-05.png", label: "キリッ" },
  { id: "stamp-06", src: "/stamps/stamp-06.png", label: "だが断る" },
  { id: "stamp-07", src: "/stamps/stamp-07.png", label: "おはよう" },
  { id: "stamp-08", src: "/stamps/stamp-08.png", label: "ねぇねぇ" },
  { id: "stamp-09", src: "/stamps/stamp-09.png", label: "ウマッ" },
];

export function stampSrc(id: string | null): string | null {
  if (!id) return null;
  const s = STAMPS.find((x) => x.id === id);
  return s ? s.src : null;
}

// 入力連動サジェスト用のキーワード対応。
// 入力した文章の意図とスタンプの意味が明確に対応するものだけを割り当てる。
// stamp-01（相手の強い言葉への反応）・stamp-04（であるかっ）・stamp-05（キリッ）は
// 入力文からは意図が判別できないため割り当てない。
export const STAMP_SUGGEST_KEYWORDS: Record<string, string[]> = {
  "stamp-02": ["やった", "できた", "すご", "成功", "うまくいった"], // やるじゃん（称賛）
  "stamp-03": ["ウケる", "おもしろ", "笑", "わら", "爆笑"], // ぷい・ウケる
  "stamp-06": ["断る", "むり", "無理", "いやだ", "やだ"], // だが断る
  "stamp-07": ["おはよう", "おはよ", "おは"], // おはよう
  "stamp-08": ["ねぇ", "ねえ", "きいて", "聞いて"], // ねぇねぇ
  "stamp-09": ["おいしい", "おいし", "うまい", "美味しい", "ごはん"], // ウマッ
};

// 入力文にキーワードが含まれるスタンプを、従来順のまま最大 limit 件返す。
export function suggestStamps(text: string, limit = 4): Stamp[] {
  const t = text.trim();
  if (!t) return [];
  const out: Stamp[] = [];
  for (const s of STAMPS) {
    const words = STAMP_SUGGEST_KEYWORDS[s.id];
    if (!words) continue;
    if (words.some((w) => t.includes(w))) out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}
