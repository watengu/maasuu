// 「映し鏡マァスゥ」（ホームの楽しさ第2段）の空気の層:
// 端末のローカル日時から 時間帯（あさ／ひる／ゆうがた／よる）と
// 季節（春／夏／秋／冬）を決め、ホームの帯に出す小さな情景チップと、
// 自分のカード上部の細い帯の色を返す。サーバー・保存は一切なしで、
// 同じ端末・同じ時刻では常に同じ結果になる。
// 2匹の様子（状態語）は時間帯で基本が決まる。責める・急かす意味の
// 言葉は使わない（無活動を「さびしい」等とは表現しない）。

export type TimeBand = "asa" | "hiru" | "yugata" | "yoru";
export type Season = "spring" | "summer" | "autumn" | "winter";

export type Atmosphere = {
  timeBand: TimeBand;
  /** あさ／ひる／ゆうがた／よる */
  timeBandLabel: string;
  season: Season;
  /** 春／夏／秋／冬 */
  seasonLabel: string;
  /** 帯のチップに出す短い情景語（例: 「春のあさひ」） */
  sceneWord: string;
  /** チップの背景（CSS グラデーション） */
  chipGradient: string;
  /** チップの文字色 */
  chipColor: string;
  /** 自分のカード上部の細い帯（CSS グラデーション） */
  stripGradient: string;
  /** 2匹の様子の基本（時間帯で決まる） */
  baseState: string;
};

/** 時間帯: あさ 5–10時／ひる 11–15時／ゆうがた 16–18時／よる 19–4時 */
export function timeBandFor(now: Date): TimeBand {
  const h = now.getHours();
  if (h >= 5 && h < 11) return "asa";
  if (h >= 11 && h < 16) return "hiru";
  if (h >= 16 && h < 19) return "yugata";
  return "yoru";
}

/** 季節: 春 3–5月／夏 6–8月／秋 9–11月／冬 12–2月 */
export function seasonFor(now: Date): Season {
  const m = now.getMonth() + 1;
  if (m >= 3 && m <= 5) return "spring";
  if (m >= 6 && m <= 8) return "summer";
  if (m >= 9 && m <= 11) return "autumn";
  return "winter";
}

const SEASON_LABELS: Record<Season, string> = {
  spring: "春",
  summer: "夏",
  autumn: "秋",
  winter: "冬",
};

type TimeBandStyle = {
  label: string;
  /** 情景の名詞（季節名と組み合わせて情景語にする） */
  sceneNoun: string;
  chipGradient: string;
  chipColor: string;
  stripGradient: string;
  baseState: string;
};

// 色はブランドのパレット（紙クリーム／撫子ローズ／深ローズ／墨／灰桜／金）と
// 既存テーマシーンの色味の濃淡だけで組む。新しい画像素材は作らない。
const TIME_BAND_STYLES: Record<TimeBand, TimeBandStyle> = {
  asa: {
    label: "あさ",
    sceneNoun: "あさひ",
    chipGradient: "linear-gradient(90deg, #fdf3d3, #f7c98b)",
    chipColor: "#63384a",
    stripGradient: "linear-gradient(90deg, #f7c98b, #fdf3d3, #f2a56b)",
    baseState: "目覚めたばかり",
  },
  hiru: {
    label: "ひる",
    sceneNoun: "あおぞら",
    chipGradient: "linear-gradient(90deg, #eef6df, #cfe8d2)",
    chipColor: "#44503c",
    stripGradient: "linear-gradient(90deg, #cfe8d2, #e9f3d9, #9cc7a4)",
    baseState: "ごきげん",
  },
  yugata: {
    label: "ゆうがた",
    sceneNoun: "ゆうやけ",
    chipGradient: "linear-gradient(90deg, #fbd9a8, #f2a56b)",
    chipColor: "#63384a",
    stripGradient: "linear-gradient(90deg, #f2a56b, #dd7f63, #c25e7e)",
    baseState: "のんびり",
  },
  yoru: {
    label: "よる",
    sceneNoun: "ほしぞら",
    chipGradient: "linear-gradient(90deg, #2c2a5e, #453a6b)",
    chipColor: "#fdf7f4",
    stripGradient: "linear-gradient(90deg, #16224d, #453a6b, #2c2a5e)",
    baseState: "お昼寝中",
  },
};

/** 端末のローカル日時から、その瞬間の空気を決める */
export function atmosphereFor(now: Date = new Date()): Atmosphere {
  const timeBand = timeBandFor(now);
  const season = seasonFor(now);
  const style = TIME_BAND_STYLES[timeBand];
  const seasonLabel = SEASON_LABELS[season];
  return {
    timeBand,
    timeBandLabel: style.label,
    season,
    seasonLabel,
    sceneWord: `${seasonLabel}の${style.sceneNoun}`,
    chipGradient: style.chipGradient,
    chipColor: style.chipColor,
    stripGradient: style.stripGradient,
    baseState: style.baseState,
  };
}

/**
 * 2匹の様子（状態語）。基本は時間帯で決まる。
 * 利用者の今日の活動が（呼び出し側が既に読み込んでいるデータの範囲で）
 * 分かっているときだけ、「元気」の側へ寄せる。夜のお昼寝は活動が
 * あっても起こさない。活動がないことを責める方向には決して寄せない。
 */
export function pairStateFor(
  atmo: Atmosphere,
  opts?: { engagedToday?: boolean },
): string {
  if (opts?.engagedToday && atmo.timeBand !== "yoru") return "元気";
  return atmo.baseState;
}
