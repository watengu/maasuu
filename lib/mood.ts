// 「今日の気分スタンプ」（ホームの楽しさ第1段）の解決ロジック。
// 保存形式は lib/types.ts の isMoodCard / parseMoodDescription を参照。
// 日付が「今日」の気分行だけが表示対象。公開範囲の判定は呼び出し側の文脈で決める:
// 自分の画面では pub / priv の両方、他人の画面（公開ページなど）では pub のみ。

import { STAMPS, type Stamp } from "./stamps";
import type { ProfileCard } from "./types";
import { isMoodCard, parseMoodDescription, type MoodInfo } from "./types";

export type ResolvedMood = {
  stamp: Stamp;
  info: MoodInfo;
  card: ProfileCard;
};

/**
 * カード群から「今日の気分」を1件解決する。
 * dateKey は表示する端末（または公開ページでは JST）のローカル日付 YYYY-MM-DD。
 * includePriv=false のときは公開（pub）の気分だけを返す。
 */
export function resolveTodaysMood(
  cards: ProfileCard[],
  dateKey: string,
  includePriv: boolean,
): ResolvedMood | null {
  for (const card of cards) {
    if (!isMoodCard(card)) continue;
    const info = parseMoodDescription(card.description);
    if (!info || info.date !== dateKey) continue;
    if (!includePriv && info.visibility !== "pub") continue;
    const stamp = STAMPS.find((s) => s.src === card.image_url);
    if (!stamp) continue;
    return { stamp, info, card };
  }
  return null;
}
