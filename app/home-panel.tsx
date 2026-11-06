"use client";

// ホームパネル（スライドシェルの右パネル）: 自分のページ。
// 段階2（設計 §3）で上部に3つのブロックを追加した。上から順に:
//   1. いまの繋がり（有効な繋がりを期限が近い順に最大3件。ゼロ件なら出さない）
//   2. 次にやること（状態に応じて1つだけ）
//   3. 今日のマァスゥ（マァとスゥの日替わりひとこと。端末内で完結）
//   4. 自分のカード（従来のプロフィール表示をそのまま下に残す）
// 「いまの繋がり」のデータはシェルが取得した ConnView をそのまま使い、
// 期限・往復の判定は lib/engine の既存ロジック（シェル側で計算済みの値）に従う。
// 公開ページ（/p/[code]）と同じ見た目（ProfilePageView）で、自分のアイコン・名前・
// 一言・カードを表示する。promo_on の有無にかかわらず本人には常に見える
// （promo_on は「他人から /p で見えるか」だけを決める）。
// 第4弾（2026-10-29）で全面背景に合わせ、パネル全体にページを広げ、
// 公開ページへのリンクや設定導線は背景エリア内の最下部（footer）に置く。
// 公開URLのコピー／共有などの操作は設定（/me）に置き、ここはページらしく保つ。
import { useEffect, useState } from "react";
import Link from "next/link";
import ProfilePageView from "./profile-page-view";
import type { ConnView } from "./friends-panel";
import type { Session } from "./auth-client";
import { remainingMs } from "../lib/engine";
import { formatRemaining } from "../lib/format";
import { AVATAR_CLASS } from "../lib/avatar";
import { dailyMessage } from "../lib/daily-message";
import { loadHidden } from "../lib/hidden";
import { selectRows } from "../lib/supabase";
import type { IntroSet, Profile, ProfileCard } from "../lib/types";

// 運営セットの失効（72時間）は invite-section / /me と同じ条件。
const SET_EXPIRE_MS = 72 * 60 * 60 * 1000;

export default function HomePanel({
  session,
  me,
  cards,
  views,
  onGoInvite,
}: {
  session: Session;
  me: Profile;
  cards: ProfileCard[];
  views: ConnView[] | null;
  onGoInvite: () => void;
}) {
  const [, setTick] = useState(0);
  // 「次にやること」の判定用: 有効な招待（送れる招待）があるか。
  // null = 取得前。ゲストは招待を作れないので判定対象外（true 扱いで読み込み待ちにしない）。
  const [hasValidInvite, setHasValidInvite] = useState<boolean | null>(
    me.is_guest ? true : null,
  );

  // 残り時間表示を定期的に進める（友人一覧パネルと同じ30秒）
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (me.is_guest) return;
    let cancelled = false;
    (async () => {
      const ss = await selectRows<IntroSet>(
        `introduction_sets?introducer_id=eq.${session.userId}&order=created_at.desc&select=*`,
      ).catch(() => [] as IntroSet[]);
      if (cancelled) return;
      const hidden = loadHidden(session.userId).invites;
      const nowMs = Date.now();
      const valid = ss.some(
        (st) =>
          st.direct &&
          !st.voided_at &&
          !st.joined_by_b &&
          !hidden.includes(st.id) &&
          !(
            me.is_operator &&
            nowMs - new Date(st.created_at).getTime() > SET_EXPIRE_MS
          ),
      );
      setHasValidInvite(valid);
    })();
    return () => {
      cancelled = true;
    };
  }, [session.userId, me.is_guest, me.is_operator]);

  const now = new Date();
  const activeViews = (views ?? [])
    .filter((v) => v.conn.state === "active")
    .sort(
      (a, b) =>
        new Date(a.conn.deadline).getTime() - new Date(b.conn.deadline).getTime(),
    );
  const urgent = activeViews.find((v) => {
    const r = remainingMs(v.conn, now);
    return r > 0 && r < 24 * 3_600_000;
  });

  // 次にやること（1つだけ）。優先順は設計 §3:
  // カード未登録 → プロフィールカードを作る／有効な招待が無い → 紹介を作る／
  // 期限24時間未満の繋がりあり → トークを開く／どれでもない → 紹介を作る。
  type NextAction =
    | { kind: "link"; label: string; note: string; href: string }
    | { kind: "invite"; label: string; note: string };
  let nextAction: NextAction | null = null;
  if (views !== null && hasValidInvite !== null) {
    if (cards.length === 0) {
      nextAction = {
        kind: "link",
        label: "プロフィールカードを作る",
        note: "リンクや短い文を並べると、あなたのページが伝わりやすくなります。",
        href: "/me",
      };
    } else if (!me.is_guest && hasValidInvite === false) {
      nextAction = {
        kind: "invite",
        label: "紹介を作る",
        note: "送れる招待がありません。新しい招待を作って相手に渡しましょう。",
      };
    } else if (urgent) {
      nextAction = {
        kind: "link",
        label: "トークを開く",
        note: `${urgent.partner?.display_name ?? "相手"} さんとの繋がりの期限が近づいています（残り ${formatRemaining(remainingMs(urgent.conn, now))}）。`,
        href: `/c/${urgent.conn.id}`,
      };
    } else if (!me.is_guest) {
      nextAction = {
        kind: "invite",
        label: "紹介を作る",
        note: "招待を作って、新しい繋がりを始めましょう。",
      };
    } else if (activeViews.length > 0) {
      // ゲストは招待を作れないので、既存の繋がりへ誘導する。
      nextAction = {
        kind: "link",
        label: "トークを開く",
        note: `${activeViews[0].partner?.display_name ?? "相手"} さんとのトークを開きます。`,
        href: `/c/${activeViews[0].conn.id}`,
      };
    }
  }

  const today = dailyMessage(now);

  const footer = (
    <div className="text-center text-xs leading-relaxed text-balance">
      {cards.length === 0 && (
        <p className="opacity-85">
          リンクや短い文を並べて、あなたのページと公開ページに出すものです。
          <Link href="/me" className="underline underline-offset-2">
            設定
          </Link>
          から追加できます。
        </p>
      )}
      {!me.is_guest &&
        (me.promo_on && me.promo_code ? (
          <p className={cards.length === 0 ? "mt-3" : undefined}>
            <Link href={`/p/${me.promo_code}`} className="underline underline-offset-2">
              公開ページを見る
            </Link>
          </p>
        ) : (
          <p className={cards.length === 0 ? "mt-3" : undefined}>
            公開ページはOFFです。
            <Link href="/me" className="underline underline-offset-2">
              設定
            </Link>
            でONにできます。
          </p>
        ))}
      <p className="mt-3">
        <Link href="/me" className="underline underline-offset-2">
          設定を開く
        </Link>
      </p>
    </div>
  );

  const cardStyle = {
    borderColor: "var(--line)",
    background: "var(--surface)",
  } as const;

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="shrink-0 space-y-4 px-4 py-5">
        {/* 1. いまの繋がり（ゼロ件なら出さない） */}
        {views !== null && activeViews.length > 0 && (
          <section>
            <h2 className="text-sm font-bold" style={{ color: "var(--muted)" }}>
              いまの繋がり
            </h2>
            <ul className="mt-2 space-y-2">
              {activeViews.slice(0, 3).map((v) => {
                const remainMs = remainingMs(v.conn, now);
                const progress =
                  v.roundTrips !== undefined && v.quotaRoundTrips !== undefined
                    ? v.roundTrips < v.quotaRoundTrips
                      ? `あと${v.quotaRoundTrips - v.roundTrips}回で${v.quotaRoundTrips}往復`
                      : `${v.quotaRoundTrips}往復達成`
                    : null;
                return (
                  <li key={v.conn.id}>
                    <Link
                      href={`/c/${v.conn.id}`}
                      className="flex items-center gap-3 rounded-2xl border p-3"
                      style={cardStyle}
                    >
                      {v.partner?.icon_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={v.partner.icon_url}
                          alt=""
                          className={`${AVATAR_CLASS.list} shrink-0 rounded-full object-cover`}
                        />
                      ) : (
                        <span
                          className={`flex ${AVATAR_CLASS.list} shrink-0 items-center justify-center rounded-full text-base font-bold`}
                          style={{
                            background: "var(--accent-soft)",
                            color: "var(--accent-strong)",
                          }}
                        >
                          {(v.partner?.display_name ?? "?").slice(0, 1)}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">
                          {v.partner?.display_name ?? "相手"}
                        </span>
                        {progress && (
                          <span
                            className="block truncate text-[11px]"
                            style={{ color: "var(--muted)" }}
                          >
                            {progress}
                          </span>
                        )}
                      </span>
                      <span
                        className="shrink-0 text-xs font-bold"
                        style={{ color: "var(--accent-strong)" }}
                      >
                        残り {formatRemaining(remainMs)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* 2. 次にやること */}
        {nextAction && (
          <section className="rounded-2xl border p-4" style={cardStyle}>
            <h2 className="text-sm font-bold" style={{ color: "var(--muted)" }}>
              次にやること
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
              {nextAction.note}
            </p>
            {nextAction.kind === "link" ? (
              <Link
                href={nextAction.href}
                className="mt-3 block rounded-full py-2.5 text-center text-sm font-bold text-white"
                style={{ background: "var(--accent)" }}
              >
                {nextAction.label}
              </Link>
            ) : (
              <button
                type="button"
                onClick={onGoInvite}
                className="mt-3 w-full rounded-full py-2.5 text-sm font-bold text-white"
                style={{ background: "var(--accent)" }}
              >
                {nextAction.label}
              </button>
            )}
          </section>
        )}

        {/* 3. 今日のマァスゥ */}
        <section
          className="rounded-2xl border p-4"
          style={{ borderColor: "var(--line)", background: "var(--accent-soft)" }}
        >
          <h2 className="text-sm font-bold" style={{ color: "var(--accent-strong)" }}>
            今日のマァスゥ
          </h2>
          <div className="mt-2 space-y-1.5 text-sm leading-relaxed">
            <p>
              <span className="mr-2 text-xs font-bold" style={{ color: "var(--accent-strong)" }}>
                マァ
              </span>
              {today.maa}
            </p>
            <p>
              <span className="mr-2 text-xs font-bold" style={{ color: "var(--accent-strong)" }}>
                スゥ
              </span>
              {today.suu}
            </p>
          </div>
        </section>
      </div>

      {/* 4. 自分のカード（従来のプロフィール表示） */}
      <ProfilePageView
        profile={me}
        cards={cards}
        footer={footer}
        className="min-h-0 min-w-0 flex-1"
      />
    </div>
  );
}
