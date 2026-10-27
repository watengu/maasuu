// マァスゥ ルールエンジン（build-plan-2026-10-26.md「判定ロジック」に対応）
// 方針: サーバーレス・遅延評価。判定はクライアントが「開いたとき・送るとき」に実行し、
// 結果（deadline の延長 / state=gone）だけを DB に書き戻す。定期ジョブは持たない。
// メッセージ行は 24h で「表示」から消えるが、行自体は残るので、ターン数の数え上げは
// expires_at ではなく created_at の窓で行う。

import type { Connection, Gender, Turn } from "./types";

/** ターン数の数え上げに必要な最小フィールド（判定は created_at と sender_id だけで行う） */
export type TurnCount = Pick<Turn, "sender_id" | "created_at">;

export type PairKind = "same" | "cross";

export type RuleSet = {
  /** 最初の猶予（日数） */
  windowDays: number;
  /** 窓ごとに必要な往復数 */
  quotaRoundTrips: number;
  /** 1人・1接続・1日あたりのターン上限 */
  dailyCap: number;
  /** ノルマ達成で足す日数（窓の再アンカーのため windowDays と同値にする） */
  extendDays: number;
};

// 仮定（仕様の緩和値提案 2026-10-26）:
//   異性間 = 3日 / 往復3 / 1日8ターン
//   同性間 = 7日 / 往復2 / 1日12ターン
export const RULES: Record<PairKind, RuleSet> = {
  cross: { windowDays: 3, quotaRoundTrips: 3, dailyCap: 8, extendDays: 3 },
  same: { windowDays: 7, quotaRoundTrips: 2, dailyCap: 12, extendDays: 7 },
};

const DAY_MS = 86_400_000;

/**
 * 同性判定の仮定: 両者の性別が一致し、かつ 'female' / 'male' のどちらかである場合のみ「同性」。
 * 'other' または未設定（null）が片方でも含まれる場合は「異性間」ルール（厳しい方）を適用する。
 * 性別は自己申告（profiles.gender）に基づく。
 */
export function pairKindOf(
  a: Gender | null | undefined,
  b: Gender | null | undefined,
): PairKind {
  if ((a === "female" || a === "male") && a === b) return "same";
  return "cross";
}

export function rulesFor(a: Gender | null | undefined, b: Gender | null | undefined): RuleSet {
  return RULES[pairKindOf(a, b)];
}

/** 接続開始時刻から最初の deadline を作る */
export function initialDeadline(startedAt: Date, rules: RuleSet): Date {
  return new Date(startedAt.getTime() + rules.windowDays * DAY_MS);
}

/** 現在の窓の開始時刻（deadline − windowDays）。延命時は窓がそのまま後ろへずれる前提 */
export function windowStartOf(conn: Connection, rules: RuleSet): number {
  return new Date(conn.deadline).getTime() - rules.windowDays * DAY_MS;
}

function countInWindow(turns: TurnCount[], senderId: string, fromMs: number, toMs: number): number {
  let n = 0;
  for (const t of turns) {
    if (t.sender_id !== senderId) continue;
    const c = new Date(t.created_at).getTime();
    if (c >= fromMs && c < toMs) n++;
  }
  return n;
}

/** 現在の窓における往復数（= 両者の送信数のうち少ない方）と内訳 */
export function roundTripsInCurrentWindow(
  conn: Connection,
  turns: TurnCount[],
  rules: RuleSet,
): { a: number; b: number; roundTrips: number } {
  const to = new Date(conn.deadline).getTime();
  const from = to - rules.windowDays * DAY_MS;
  const a = countInWindow(turns, conn.user_a, from, to);
  const b = countInWindow(turns, conn.user_b, from, to);
  return { a, b, roundTrips: Math.min(a, b) };
}

export type JudgeResult = {
  /** 判定後の接続（deadline / state が変わりうる） */
  connection: Connection;
  /** DB へ書き戻す必要があるか */
  changed: boolean;
};

/**
 * 締切判定（遅延評価）。now が deadline を過ぎていれば、過ぎた窓ごとに
 * 「窓内の往復数 >= ノルマ」を見て、達成なら deadline を extendDays 進め、
 * 未達なら state='gone' にする。複数窓ぶん過ぎている場合も遡って処理する。
 */
export function judgeConnection(
  conn: Connection,
  turns: TurnCount[],
  rules: RuleSet,
  now: Date = new Date(),
): JudgeResult {
  if (conn.state !== "active") return { connection: conn, changed: false };
  let deadlineMs = new Date(conn.deadline).getTime();
  const nowMs = now.getTime();
  let changed = false;
  let guard = 0;
  while (nowMs > deadlineMs && guard++ < 366) {
    const from = deadlineMs - rules.windowDays * DAY_MS;
    const a = countInWindow(turns, conn.user_a, from, deadlineMs);
    const b = countInWindow(turns, conn.user_b, from, deadlineMs);
    if (Math.min(a, b) >= rules.quotaRoundTrips) {
      deadlineMs += rules.extendDays * DAY_MS;
      changed = true;
    } else {
      return {
        connection: { ...conn, state: "gone", deadline: new Date(deadlineMs).toISOString() },
        changed: true,
      };
    }
  }
  if (changed) {
    return {
      connection: { ...conn, deadline: new Date(deadlineMs).toISOString() },
      changed: true,
    };
  }
  return { connection: conn, changed: false };
}

/** 初日 = 接続開始から 24 時間以内（スタンプのみ） */
export function isDayOne(conn: Connection, now: Date = new Date()): boolean {
  return now.getTime() < new Date(conn.started_at).getTime() + DAY_MS;
}

/** テキスト解禁 = 双方の許可がそろっていること */
export function textUnlocked(conn: Connection): boolean {
  return conn.text_ok_a && conn.text_ok_b;
}

/** テキストを送れる状態か（解禁済み かつ 初日を過ぎている） */
export function canSendText(conn: Connection, now: Date = new Date()): boolean {
  return conn.state === "active" && textUnlocked(conn) && !isDayOne(conn, now);
}

/** JST の「今日」の範囲 [start, end) を epoch ms で返す */
export function jstDayRange(now: Date = new Date()): { startMs: number; endMs: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.format(now).split("-").map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  // JST 00:00 = UTC 前日 15:00
  const startMs = Date.UTC(y, m - 1, d) - 9 * 3_600_000;
  return { startMs, endMs: startMs + DAY_MS };
}

/** 今日（JST）そのユーザーがこの接続で送ったターン数 */
export function turnsSentToday(turns: TurnCount[], senderId: string, now: Date = new Date()): number {
  const { startMs, endMs } = jstDayRange(now);
  let n = 0;
  for (const t of turns) {
    if (t.sender_id !== senderId) continue;
    const c = new Date(t.created_at).getTime();
    if (c >= startMs && c < endMs) n++;
  }
  return n;
}

/** 今日あと何ターン送れるか */
export function remainingTurnsToday(
  turns: TurnCount[],
  senderId: string,
  rules: RuleSet,
  now: Date = new Date(),
): number {
  return Math.max(0, rules.dailyCap - turnsSentToday(turns, senderId, now));
}

export type SendCheck = { ok: true } | { ok: false; reason: string };

/** 送信可否の共通判定（バン判定は呼び出し側でプロフィールを見て行う） */
export function checkSend(
  conn: Connection,
  turns: TurnCount[],
  senderId: string,
  kind: "stamp" | "text",
  rules: RuleSet,
  now: Date = new Date(),
): SendCheck {
  if (conn.state !== "active") return { ok: false, reason: "この繋がりは終わっています" };
  if (now.getTime() > new Date(conn.deadline).getTime()) {
    return { ok: false, reason: "期限を過ぎています" };
  }
  if (remainingTurnsToday(turns, senderId, rules, now) <= 0) {
    return { ok: false, reason: "今日のターン上限に達しています" };
  }
  if (kind === "text" && !canSendText(conn, now)) {
    if (isDayOne(conn, now)) {
      return { ok: false, reason: "初日はスタンプだけです" };
    }
    return { ok: false, reason: "テキストは双方の許可がそろうと使えます" };
  }
  return { ok: true };
}

/** 残り時間（ms）。過ぎていれば負値 */
export function remainingMs(conn: Connection, now: Date = new Date()): number {
  return new Date(conn.deadline).getTime() - now.getTime();
}

/** 紹介クールダウン (rule 14): 最後に紹介セットを作ってから 3 日間は次のセットを作れない */
export const INTRO_COOLDOWN_MS = 3 * DAY_MS;

export function introCooldownRemainingMs(
  lastSetCreatedAt: string | null,
  now: Date = new Date(),
): number {
  if (!lastSetCreatedAt) return 0;
  const until = new Date(lastSetCreatedAt).getTime() + INTRO_COOLDOWN_MS;
  return Math.max(0, until - now.getTime());
}

/** 紹介リンクのコード生成（紛らわしい文字を除いた 10 文字） */
export function generateIntroCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

/** 宣伝ページ用コード生成（12 文字の小文字英数字） */
export function generatePromoCode(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}
