"use client";

// 友人一覧パネル（スライドシェルの左パネル）: 自分の繋がり一覧。
// データ取得・期限判定（judgeConnection）はシェル側で行い、ここは表示専用。
// 残り時間表示を進めるため、30秒ごとに再描画する。
import { useEffect, useState } from "react";
import Link from "next/link";
import InviteSection from "./invite-section";
import type { Session } from "./auth-client";
import {
  isDayOne,
  remainingMs,
  textUnlockRemainingMs,
  textUnlocked,
} from "../lib/engine";
import { AVATAR_CLASS } from "../lib/avatar";
import HourglassIcon, { DEADLINE_WARN_COLOR } from "./hourglass-icon";
import { formatRemaining } from "../lib/format";
import { genreLabel } from "../lib/genres";
import type { Connection, Profile } from "../lib/types";

export type ConnView = {
  conn: Connection;
  partner: Profile | null;
  introducer: Profile | null;
  /** 現在の窓で必要往復を満たしているか（シェル側で判定。期限警告の抑制に使う） */
  quotaMet?: boolean;
  /** 現在の窓の往復数と必要数（シェル側で判定。進捗行の表示に使う。active のときだけ入る） */
  roundTrips?: number;
  quotaRoundTrips?: number;
};

export default function FriendsPanel({
  session,
  me,
  views,
  pendingPath,
}: {
  session: Session;
  me: Profile;
  views: ConnView[];
  pendingPath: string | null;
}) {
  const [, setTick] = useState(0);

  // 残り時間表示を定期的に進める
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const now = new Date();
  const sorted = [...views].sort((x, y) => {
    if (x.conn.state !== y.conn.state) return x.conn.state === "active" ? -1 : 1;
    return (
      new Date(x.conn.deadline).getTime() - new Date(y.conn.deadline).getTime()
    );
  });

  return (
    <div className="px-4 py-5">
      {pendingPath && (
        <Link
          href={pendingPath}
          className="mb-4 block rounded-2xl border px-4 py-3 text-sm font-bold"
          style={{
            borderColor: "var(--accent)",
            background: "var(--accent-soft)",
            color: "var(--accent-strong)",
          }}
        >
          紹介への参加が途中です。タップして続けてください →
        </Link>
      )}
      <h2 className="text-sm font-bold" style={{ color: "var(--muted)" }}>
        あなたの繋がり
      </h2>
      {sorted.length === 0 ? (
        <div
          className="mt-3 rounded-2xl border p-5 text-sm leading-relaxed"
          style={{ borderColor: "var(--line)", background: "var(--surface)" }}
        >
          <p>まだ繋がりがありません。</p>
          <p className="mt-2">
            マァスゥの繋がりは、紹介から生まれます。
            {me.is_guest
              ? "招待が届くと、ここに繋がりが表示されます。"
              : me.is_operator
                ? "下の「紹介する」から招待リンクを作って、相手に渡してください。"
                : "下の「紹介する」から招待リンクを作って、相手に渡してください（作成は3日に1回まで）。"}
          </p>
        </div>
      ) : (
        <ul className="mt-3 space-y-3">
          {sorted.map(
            ({ conn, partner, introducer, quotaMet, roundTrips, quotaRoundTrips }) => {
            // 終了表示は gone（期限切れ）と ended（繋がりを切った）で共通にする
            const gone = conn.state !== "active";
            const remainMs = remainingMs(conn, now);
            // 進捗行（途中経過の見える化）: 往復の残り＋テキスト解禁までの道のりを1行にまとめる。
            // 終了・切断した接続には出さない。期限の残りは右側に既にあるのでここには入れない。
            const progressParts: string[] = [];
            if (!gone) {
              if (
                roundTrips !== undefined &&
                quotaRoundTrips !== undefined
              ) {
                progressParts.push(
                  roundTrips < quotaRoundTrips
                    ? `あと${quotaRoundTrips - roundTrips}回で${quotaRoundTrips}往復`
                    : `${quotaRoundTrips}往復達成`,
                );
              }
              if (isDayOne(conn, now)) {
                // 解禁の時刻条件（開始+24時間）までの残り。許可の状態は問わない
                // （時間と許可の両方がそろって解禁。許可の進み具合はトーク側のバーで見る）
                progressParts.push(
                  `テキスト解禁まで ${formatRemaining(textUnlockRemainingMs(conn, now))}`,
                );
              } else if (!textUnlocked(conn)) {
                // 24時間は過ぎたので、次の一手は許可だと分かる言い方にする
                progressParts.push("あとはお互いの許可でテキスト解禁");
              }
            }
            // 期限接近の警告: 残り24時間未満 かつ 必要往復が未達のときだけ出す。
            // 往復を満たした接続は期限で延長される（延長確定）ので警告しない。
            const warn =
              !gone && remainMs > 0 && remainMs < 24 * 3_600_000 && quotaMet === false;
            // 紹介ラベルはブリッジ接続（紹介者が第三者）のときだけ出す。
            // ダイレクト接続では紹介者＝当事者の一方なので出さない。
            const isBridge =
              !!conn.introducer_id &&
              conn.introducer_id !== conn.user_a &&
              conn.introducer_id !== conn.user_b;
            return (
              <li key={conn.id}>
                <Link
                  href={`/c/${conn.id}`}
                  className="flex items-center gap-3 rounded-2xl border p-4"
                  style={{
                    borderColor: "var(--line)",
                    background: "var(--surface)",
                    opacity: gone ? 0.55 : 1,
                  }}
                >
                  {partner?.icon_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={partner.icon_url}
                      alt=""
                      className={`${AVATAR_CLASS.list} shrink-0 rounded-full object-cover`}
                    />
                  ) : (
                    <span
                      className={`flex ${AVATAR_CLASS.list} shrink-0 items-center justify-center rounded-full text-base font-bold`}
                      style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
                    >
                      {(partner?.display_name ?? "?").slice(0, 1)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">
                      {partner?.display_name ?? "相手"}
                    </span>
                    <span
                      className="block truncate text-xs"
                      style={{ color: "var(--muted)" }}
                    >
                      {partner?.status_line || " "}
                    </span>
                    {(conn.genre || (introducer && isBridge)) && (
                      <span
                        className="mt-0.5 block truncate text-[11px]"
                        style={{ color: "var(--muted)" }}
                      >
                        {conn.genre && (
                          <span
                            className="mr-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                            style={{
                              background: "var(--accent-soft)",
                              color: "var(--accent-strong)",
                            }}
                          >
                            {genreLabel(conn.genre)}
                          </span>
                        )}
                        {introducer &&
                          isBridge &&
                          `${introducer.display_name} さんの紹介`}
                      </span>
                    )}
                    {!gone && progressParts.length > 0 && (
                      <span
                        className="mt-0.5 block truncate text-[11px]"
                        style={{ color: "var(--muted)" }}
                      >
                        {progressParts.join(" ・ ")}
                      </span>
                    )}
                    {gone && (
                      <span
                        className="mt-1 block text-[11px] leading-snug"
                        style={{ color: "var(--muted)" }}
                      >
                        {conn.state === "gone"
                          ? "期限までに往復が足りず終了しました。同じ相手とは再接続できません。"
                          : "この繋がりは終了しました。同じ相手とは再接続できません。"}
                      </span>
                    )}
                  </span>
                  <span
                    className="flex shrink-0 items-center gap-1 text-xs font-bold"
                    style={{
                      color: gone
                        ? "var(--muted)"
                        : warn
                          ? DEADLINE_WARN_COLOR
                          : "var(--accent-strong)",
                    }}
                  >
                    {warn && <HourglassIcon />}
                    {gone ? "終了" : formatRemaining(remainMs)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {!me.is_guest && <InviteSection session={session} me={me} />}
      <p className="mt-6 text-center text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
        繋がりには期限があります。期限までに往復のやりとりが足りないと、繋がりは消えます。
        <br />
        メッセージは送信から24時間で見えなくなります。
      </p>
    </div>
  );
}
