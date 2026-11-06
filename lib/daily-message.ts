// 「今日のマァスゥ」: マァとスゥの日替わりひとこと（段階2・設計 §3）。
// 固定の文案セットから1件選ぶだけ。サーバー不要・端末内で完結する。
// アプリ内は日本語のみ（スゥの台詞も日本語）。日常の短い一言に限る。
// 選択は「今日のラッキースタンプ」と同じ seed（ローカル日付＋ユーザーIDの
// ハッシュ）を使い、seed % 文案数 で決める（ホームの楽しさ第1段の連動）。

import { localDateKey, luckySeedFor } from "./lucky";
import type { Season, TimeBand } from "./atmosphere";

export type DailyMessage = {
  maa: string;
  suu: string;
};

export const DAILY_MESSAGES: DailyMessage[] = [
  { maa: "おはよう。今日もいい日になるよ。", suu: "ほんと？ じゃあ楽しみ。" },
  { maa: "深呼吸すると、少し元気になるね。", suu: "すー、はー。……なった。" },
  { maa: "温かい飲み物でも飲もうか。", suu: "ココアがいいな。" },
  { maa: "今日は空がきれいだね。", suu: "ほんとだ。見とれちゃう。" },
  { maa: "小さなことでも、できたって言おう。", suu: "わたし、早起きできた。" },
  { maa: "誰かに優しくできたら、それで十分だよ。", suu: "じゃあ、まず隣の人に。" },
  { maa: "雨の日は、雨の音を聞く日にしよう。", suu: "ぽつぽつ、いい音。" },
  { maa: "疲れたら、ちゃんと休むのも仕事だよ。", suu: "じゃあ少しだけ、ごろーん。" },
  { maa: "ありがとうは、早めに言うのがいいね。", suu: "ありがとう。……早かった？" },
  { maa: "今日のごはん、何が楽しみ？", suu: "全部。でもデザートが本命。" },
  { maa: "歩くと、考えがほどけるね。", suu: "一歩ずつでいいんだよね。" },
  { maa: "笑うと、肩の力が抜けるよ。", suu: "にこ。……抜けた気がする。" },
  { maa: "眠る前に、今日のいいことを1つ思い出そう。", suu: "もう思いついた。" },
  { maa: "明日は明日の楽しみがあるね。", suu: "うん。今日は今日で、よかった。" },
];

// ラッキースタンプと同じ seed（日付＋ユーザーID）で1件選ぶ。
// 同じ日・同じユーザーでは常に同じ文案になる。
export function dailyMessage(userId: string, now: Date = new Date()): DailyMessage {
  const seed = luckySeedFor(userId, localDateKey(now));
  return DAILY_MESSAGES[seed % DAILY_MESSAGES.length];
}

// ── 掛け合い（ホームの楽しさ第2段） ─────────────────────────────
// 上の14本（通常）を土台に、文脈で変わる短い掛け合いを足す。
// 文案はすべて新規の日常会話で、要求・催促・責める文体は入れない。
// 帯は1行表示なので、1本は短く保つ（マァの1行＋スゥの短い返し）。

/** 時間帯への反応（各1〜2本） */
export const TIME_BAND_MESSAGES: Record<TimeBand, DailyMessage[]> = {
  asa: [
    { maa: "あさの光、まぶしいね。", suu: "目が覚めてきた。" },
    { maa: "今日はどんな日になるかな。", suu: "いい日だといいね。" },
  ],
  hiru: [
    { maa: "おひさま、ぽかぽかだね。", suu: "お昼寝したくなる。" },
    { maa: "お昼ごはん、何がいいかな。", suu: "おいしいのがいいな。" },
  ],
  yugata: [
    { maa: "空が色づいてきたね。", suu: "きれいだね、ゆうやけ。" },
    { maa: "今日も一日、おつかれさま。", suu: "うん、よくがんばった。" },
  ],
  yoru: [
    { maa: "星が出てきたね。", suu: "数えてたら眠くなりそう。" },
    { maa: "静かな夜だね。", suu: "ゆっくりしよう。" },
  ],
};

/** 季節への反応（各1〜2本） */
export const SEASON_MESSAGES: Record<Season, DailyMessage[]> = {
  spring: [
    { maa: "春の風、やわらかいね。", suu: "お花のにおいがする。" },
    { maa: "さくら、咲いたかな。", suu: "見に行きたいね。" },
  ],
  summer: [
    { maa: "夏の空、まぶしいね。", suu: "かき氷が食べたい。" },
    { maa: "セミの声が聞こえるね。", suu: "夏だなぁ。" },
  ],
  autumn: [
    { maa: "秋の空気、すずしいね。", suu: "おいしいものが多い季節。" },
    { maa: "葉っぱが色づいてきた。", suu: "赤いの、見つけた。" },
  ],
  winter: [
    { maa: "冬の空気は澄んでるね。", suu: "きりっとして、きれい。" },
    { maa: "温かい飲み物が恋しいね。", suu: "ココア、二人分ね。" },
  ],
};

/** スタンプのラベルを差し込むテンプレート（{label} を置き換える） */
type LabelTemplate = { maa: string; suu: string };

function fillLabel(t: LabelTemplate, label: string): DailyMessage {
  return {
    maa: t.maa.replace(/\{label\}/g, label),
    suu: t.suu.replace(/\{label\}/g, label),
  };
}

/** 今日のラッキースタンプへの反応 */
export const LUCKY_MESSAGES: LabelTemplate[] = [
  { maa: "今日のラッキーは「{label}」だって。", suu: "なんだか当たってる気がする。" },
  { maa: "「{label}」が今日の相棒だね。", suu: "よろしくね、相棒。" },
  { maa: "今日は「{label}」の日みたい。", suu: "じゃあ、そんな日にしよう。" },
  { maa: "ラッキースタンプは「{label}」。", suu: "いいことありそう。" },
];

/** 今日の気分スタンプへの反応（どんな気分でも受け止める言い方にする） */
export const MOOD_MESSAGES: LabelTemplate[] = [
  { maa: "今日は「{label}」な気分なんだね。", suu: "うん、そんな日。" },
  { maa: "「{label}」、了解。そばにいるよ。", suu: "ありがとう、助かる。" },
  { maa: "気分は「{label}」か。分かったよ。", suu: "分かってくれるの、うれしい。" },
];

/** カードの飾りスタンプへの反応 */
export const DECORATION_MESSAGES: LabelTemplate[] = [
  { maa: "カードの「{label}」、いい感じだね。", suu: "その人らしさが出てる。" },
  { maa: "飾りの「{label}」が似合ってる。", suu: "うん、ぴったり。" },
  { maa: "今日も「{label}」が飾ってあるね。", suu: "いつもの景色だね。" },
];

export type BanterContext = {
  timeBand: TimeBand;
  season: Season;
  /** 今日のラッキースタンプのラベル */
  luckyLabel: string;
  /** 今日の気分スタンプのラベル（置いていないときは null） */
  moodLabel: string | null;
  /** カードの飾りスタンプのラベル（最大3つ。無いときは空） */
  decorationLabels: string[];
};

/**
 * ホームの帯に出す掛け合いを、その日の seed で決定的に1つ選ぶ。
 * 優先順位は文脈の具体性が高い順（気分＞飾り＞ラッキー＞季節・時間帯＞通常）を
 * 重みとして持たせつつ、seed で散らす（毎日同じ種類ばかりにならない形）。
 * 同じ日・同じユーザー・同じ文脈では常に同じ1本になる。
 */
export function homeBanter(
  userId: string,
  now: Date,
  ctx: BanterContext,
): DailyMessage {
  const seed = luckySeedFor(userId, localDateKey(now));
  type Category = { weight: number; items: DailyMessage[] };
  const cats: Category[] = [];
  if (ctx.moodLabel) {
    const label = ctx.moodLabel;
    cats.push({ weight: 4, items: MOOD_MESSAGES.map((t) => fillLabel(t, label)) });
  }
  if (ctx.decorationLabels.length > 0) {
    const label =
      ctx.decorationLabels[(seed >> 4) % ctx.decorationLabels.length];
    cats.push({
      weight: 3,
      items: DECORATION_MESSAGES.map((t) => fillLabel(t, label)),
    });
  }
  cats.push({
    weight: 3,
    items: LUCKY_MESSAGES.map((t) => fillLabel(t, ctx.luckyLabel)),
  });
  cats.push({
    weight: 2,
    items: [...TIME_BAND_MESSAGES[ctx.timeBand], ...SEASON_MESSAGES[ctx.season]],
  });
  cats.push({ weight: 2, items: DAILY_MESSAGES });

  const total = cats.reduce((a, c) => a + c.weight, 0);
  let r = seed % total;
  let chosen = cats[cats.length - 1];
  for (const c of cats) {
    if (r < c.weight) {
      chosen = c;
      break;
    }
    r -= c.weight;
  }
  return chosen.items[(seed >> 8) % chosen.items.length];
}
