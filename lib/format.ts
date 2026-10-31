// 表示用フォーマッタ

/** 残り時間を「あと◯日◯時間」「あと◯時間◯分」「あと◯分」で返す */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return "終了";
  const totalMin = Math.floor(ms / 60_000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `あと${days}日${hours}時間`;
  if (hours > 0) return `あと${hours}時間${mins}分`;
  return `あと${Math.max(1, mins)}分`;
}

/** ISO 文字列を JST の「M月d日 HH:mm」で返す */
export function formatDateTimeJST(iso: string): string {
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return fmt.format(d);
}

/** ISO 文字列を JST の「HH:mm」で返す（トーク内の時刻表示） */
export function formatTimeJST(iso: string): string {
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return fmt.format(d);
}

/** ISO 文字列の JST 暦日キー（YYYY-MM-DD）。日付区切りの判定用 */
export function dayKeyJST(iso: string): string {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** ISO 文字列を JST の「10月31日（金）」で返す（トークの日付区切り用） */
export function formatDateDividerJST(iso: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    weekday: "short",
  }).format(d);
  return `${get("month")}月${get("day")}日（${weekday}）`;
}
