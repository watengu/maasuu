"use client";

// 友人一覧パネル（スライドシェルの左パネル）: 自分の繋がり一覧。
// データ取得・期限判定（judgeConnection）はシェル側で行い、ここは表示専用。
// 残り時間表示を進めるため、30秒ごとに再描画する。
import { useEffect, useState } from "react";
import Link from "next/link";
import InviteSection from "./invite-section";
import type { Session } from "./auth-client";
import { remainingMs } from "../lib/engine";
import { formatRemaining } from "../lib/format";
import { genreLabel } from "../lib/genres";
import type { Connection, Profile } from "../lib/types";

export type ConnView = {
  conn: Connection;
  partner: Profile | null;
  introducer: Profile | null;
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
          {sorted.map(({ conn, partner, introducer }) => {
            // 終了表示は gone（期限切れ）と ended（繋がりを切った）で共通にする
            const gone = conn.state !== "active";
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
                      className="h-12 w-12 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold"
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
                    {(conn.genre || introducer) && (
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
                        {introducer && `${introducer.display_name} さんの紹介`}
                      </span>
                    )}
                  </span>
                  <span
                    className="shrink-0 text-xs font-bold"
                    style={{ color: gone ? "var(--muted)" : "var(--accent-strong)" }}
                  >
                    {gone ? "終了" : formatRemaining(remainingMs(conn, now))}
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
