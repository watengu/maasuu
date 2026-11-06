// 「今日のマァスゥ」: マァとスゥの日替わりひとこと（段階2・設計 §3）。
// 固定の文案セットを日付で回すだけ。サーバー不要・端末内で完結する。
// アプリ内は日本語のみ（スゥの台詞も日本語）。日常の短い一言に限る。

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

// 端末のローカル日付で1件選ぶ（同じ日は同じ文案）。
export function dailyMessage(now: Date = new Date()): DailyMessage {
  const dayIndex = Math.floor(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000,
  );
  const idx =
    ((dayIndex % DAILY_MESSAGES.length) + DAILY_MESSAGES.length) %
    DAILY_MESSAGES.length;
  return DAILY_MESSAGES[idx];
}
