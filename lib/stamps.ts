// 内蔵スタンプ（まぁ＆すぅ セット。素材は LINE スタンプ制作ラインと同一）
export type Stamp = { id: string; src: string; label: string };

// 配列順＝スタンプ帯の基礎順（使用回数が同点・未使用時の並び）。
// 設計書 stamp-expansion-design-2026-11-01 第8章の3段（頻出→会話継続→感情・状況）。
// 頻出: 了解です/わかった/ありがとう/おはよう/おつかれさま/いいね/おねがい/はじめまして
// 会話継続: うんうん/ねぇねぇ/なにしてる？/なに？/どう？/話そう/大丈夫？/ごめん
// 感情・状況: ぷい・ウケる/であるかっ/キリッ/だが断る/ウマッ/むりむり/今は話せない/
//   ここまで/やめて/強い言葉はつかわないで/やるじゃん/かわいい/うれしい/おやすみ/またね
// ※ stamp-24（かなしい）は生成側の都合で未制作のため未収録（制作でき次第、
//   感情・状況の「うれしい」の後ろに差し込む）。
export const STAMPS: Stamp[] = [
  { id: "stamp-19", src: "/stamps/stamp-19.png", label: "了解です" },
  { id: "stamp-12", src: "/stamps/stamp-12.png", label: "わかった" },
  { id: "stamp-11", src: "/stamps/stamp-11.png", label: "ありがとう" },
  { id: "stamp-07", src: "/stamps/stamp-07.png", label: "おはよう" },
  { id: "stamp-10", src: "/stamps/stamp-10.png", label: "おつかれさま" },
  { id: "stamp-21", src: "/stamps/stamp-21.png", label: "いいね" },
  { id: "stamp-22", src: "/stamps/stamp-22.png", label: "おねがい" },
  { id: "stamp-18", src: "/stamps/stamp-18.png", label: "はじめまして" },
  { id: "stamp-20", src: "/stamps/stamp-20.png", label: "うんうん" },
  { id: "stamp-08", src: "/stamps/stamp-08.png", label: "ねぇねぇ" },
  { id: "stamp-27", src: "/stamps/stamp-27.png", label: "なにしてる？" },
  { id: "stamp-25", src: "/stamps/stamp-25.png", label: "なに？" },
  { id: "stamp-26", src: "/stamps/stamp-26.png", label: "どう？" },
  { id: "stamp-28", src: "/stamps/stamp-28.png", label: "話そう" },
  { id: "stamp-14", src: "/stamps/stamp-14.png", label: "大丈夫？" },
  { id: "stamp-13", src: "/stamps/stamp-13.png", label: "ごめん" },
  { id: "stamp-03", src: "/stamps/stamp-03.png", label: "ぷい・ウケる" },
  { id: "stamp-04", src: "/stamps/stamp-04.png", label: "であるかっ" },
  { id: "stamp-05", src: "/stamps/stamp-05.png", label: "キリッ" },
  { id: "stamp-06", src: "/stamps/stamp-06.png", label: "だが断る" },
  { id: "stamp-09", src: "/stamps/stamp-09.png", label: "ウマッ" },
  { id: "stamp-16", src: "/stamps/stamp-16.png", label: "むりむり" },
  { id: "stamp-31", src: "/stamps/stamp-31.png", label: "今は話せない" },
  { id: "stamp-29", src: "/stamps/stamp-29.png", label: "ここまで" },
  { id: "stamp-30", src: "/stamps/stamp-30.png", label: "やめて" },
  { id: "stamp-01", src: "/stamps/stamp-01.png", label: "強い言葉はつかわないで" },
  { id: "stamp-02", src: "/stamps/stamp-02.png", label: "やるじゃん" },
  { id: "stamp-15", src: "/stamps/stamp-15.png", label: "かわいい" },
  { id: "stamp-23", src: "/stamps/stamp-23.png", label: "うれしい" },
  { id: "stamp-17", src: "/stamps/stamp-17.png", label: "おやすみ" },
  { id: "stamp-32", src: "/stamps/stamp-32.png", label: "またね" },
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
  "stamp-10": ["おつかれ"], // おつかれさま
  "stamp-11": ["ありがとう"], // ありがとう
  "stamp-13": ["ごめん"], // ごめん
  "stamp-17": ["おやすみ"], // おやすみ
  "stamp-18": ["はじめまして"], // はじめまして
  "stamp-19": ["りょうかい"], // 了解です
  "stamp-21": ["いいね"], // いいね
};

// 入力文にキーワードが含まれるスタンプを、STAMPS の基礎順のまま最大 limit 件返す。
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
