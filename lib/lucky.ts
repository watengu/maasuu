// 「今日のラッキースタンプ」（ホームの楽しさ第1段）:
// ローカル日付（YYYY-MM-DD）とユーザーIDのハッシュで、32点のうち1点を
// 決定的に選ぶ。保存なし・端末内計算のみ。同じ式で相手の分も計算できるため、
// 「今日おそろい」も保存なしで判定できる。
// 「今日のマァスゥ」の文案選択も同じ seed を使う（lib/daily-message.ts）。

import { STAMPS, type Stamp } from "./stamps";

/** 端末のローカル日付を YYYY-MM-DD で返す */
export function localDateKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** サーバー側（公開ページ）で使う JST の日付キー YYYY-MM-DD */
export function jstDateKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** FNV-1a ハッシュ（決定的・端末内で完結） */
export function luckySeedFor(userId: string, dateKey: string): number {
  const s = `${dateKey}:${userId}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** その日のラッキースタンプ（同じ日・同じユーザーでは常に同じ1点） */
export function luckyStampFor(userId: string, now: Date = new Date()): Stamp {
  const seed = luckySeedFor(userId, localDateKey(now));
  return STAMPS[seed % STAMPS.length];
}
