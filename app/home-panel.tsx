"use client";

// ホームパネル（スライドシェルの右パネル）: 自分のページ。
// 段階2調整で並びを組み替えた。上から順に:
//   1. 今日のマァスゥ（マァとスゥの日替わりひとこと。細い1行。端末内で完結）
//   2. 自分のカード（中心。従来のプロフィール表示）
//   3. いまの繋がり（有効な繋がりを期限が近い順に最大3件。ゼロ件なら出さない）
//   4. 次にやること（状態に応じて1つだけ。分岐ロジックは段階2のまま、
//      紹介への遷移先だけ専用ページ /invite に更新）
// 「いまの繋がり」のデータはシェルが取得した ConnView をそのまま使い、
// 期限・往復の判定は lib/engine の既存ロジック（シェル側で計算済みの値）に従う。
// スタンプ飾り（isStampDecoration）は「カード」には数えない（飾りは
// ProfilePageView が浮く飾りとして描き分ける）。
// ホームの楽しさ第1段（2026-11-06）:
//  - 今日の気分: cards の気分行を解決して ProfilePageView の気分枠に渡す。
//    自分のホームでは pub / priv の両方を出し、未設定なら静かな誘導を出す。
//  - 今日のラッキースタンプ: 日付＋ユーザーIDの決定的計算（lib/lucky）。
//    今日のマァスゥの文案選択も同じ seed。相手と一致したら「今日おそろい」。
//  - 繋がりへのひと押し: 期限が近い（残り24時間未満）相手に、ホームから
//    スタンプを1つ「贈る」。送信はトーク画面と全く同じ経路・判定を使う。
//  - 自分のカードは compact 表示にして、「次にやること」まで一画面に入る
//    高さに寄せる（公開ページ側の表示は変えない）。
// ホームの楽しさ第2段（2026-11-06）:
//  - 映し鏡: 帯に季節・時間帯の情景チップ（lib/atmosphere。端末内で完結）と
//    2匹の様子（状態語）を添え、自分のカードの上部にだけ季節・時間帯の色の
//    細い帯を付ける（公開ページ・設定プレビューには付けない）。
//    状態語は時間帯が基本で、今日の活動が読み込み済みデータで分かる場合だけ
//    「元気」の側へ寄せる。責める表現は入れない。
//  - 掛け合い: 帯の文案は文脈（気分＞飾り＞ラッキー＞季節・時間帯＞通常）を
//    seed で散らして1つ選ぶ（lib/daily-message の homeBanter）。
// 公開ページ（/p/[code]）と同じ見た目（ProfilePageView）で、自分のアイコン・名前・
// 一言・カードを表示する。promo_on の有無にかかわらず本人には常に見える
// （promo_on は「他人から /p で見えるか」だけを決める）。
// 第4弾（2026-10-29）で全面背景に合わせ、パネル全体にページを広げ、
// 公開ページへのリンクや設定導線は背景エリア内の最下部（footer）に置く。
// 操作性修正（2026-11-06）: 設定への常設入り口はシェルのヘッダーに一本化し、
// footer の「設定を開く」は廃止した（状態説明の中の誘導リンクは残す）。
// 公開ページへの入り口は footer の「公開ページを見る」のみ。
// 公開URLのコピー／共有などの操作は設定（/me）に置き、ここはページらしく保つ。
import { useEffect, useState } from "react";
import Link from "next/link";
import ProfilePageView from "./profile-page-view";
import type { ConnView } from "./friends-panel";
import type { Session } from "./auth-client";
import {
  checkSend,
  judgeConnection,
  remainingMs,
  rulesFor,
} from "../lib/engine";
import { formatRemaining } from "../lib/format";
import { AVATAR_CLASS } from "../lib/avatar";
import { homeBanter } from "../lib/daily-message";
import { atmosphereFor, pairStateFor } from "../lib/atmosphere";
import { localDateKey, luckyStampFor } from "../lib/lucky";
import { resolveTodaysMood } from "../lib/mood";
import { STAMPS } from "../lib/stamps";
import { loadHidden } from "../lib/hidden";
import {
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  insertRow,
  selectRows,
  updateRows,
} from "../lib/supabase";
import type { IntroSet, Profile, ProfileCard, Turn } from "../lib/types";
import { isMoodCard, isStampDecoration } from "../lib/types";

// 運営セットの失効（72時間）は invite-section / /me と同じ条件。
const SET_EXPIRE_MS = 72 * 60 * 60 * 1000;

export default function HomePanel({
  session,
  me,
  cards,
  views,
}: {
  session: Session;
  me: Profile;
  cards: ProfileCard[];
  views: ConnView[] | null;
}) {
  // スタンプ飾りと気分行を除いた通常カード（「カード未登録」の判定と footer の出し分け用）
  const normalCards = cards.filter(
    (c) => !isStampDecoration(c) && !isMoodCard(c),
  );
  const [, setTick] = useState(0);
  // 「贈る」導線の状態（接続ごとに1つだけ開く。選ぶ→確認→送信の2段階+結果）
  type GiftState =
    | { connId: string; stage: "pick" }
    | { connId: string; stage: "confirm"; stampId: string }
    | { connId: string; stage: "done" }
    | { connId: string; stage: "error"; message: string };
  const [gift, setGift] = useState<GiftState | null>(null);
  const [giftBusy, setGiftBusy] = useState(false);
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
  // 「カード未登録」はスタンプ飾りを除いた通常カードで判定する。
  type NextAction = { label: string; note: string; href: string };
  let nextAction: NextAction | null = null;
  if (views !== null && hasValidInvite !== null) {
    if (normalCards.length === 0) {
      nextAction = {
        label: "プロフィールカードを作る",
        note: "リンクや短い文を並べると、あなたのページが伝わりやすくなります。",
        href: "/me",
      };
    } else if (!me.is_guest && hasValidInvite === false) {
      nextAction = {
        label: "紹介を作る",
        note: "送れる招待がありません。新しい招待を作って相手に渡しましょう。",
        href: "/invite",
      };
    } else if (urgent) {
      nextAction = {
        label: "トークを開く",
        note: `${urgent.partner?.display_name ?? "相手"} さんとの繋がりの期限が近づいています（残り ${formatRemaining(remainingMs(urgent.conn, now))}）。`,
        href: `/c/${urgent.conn.id}`,
      };
    } else if (!me.is_guest) {
      nextAction = {
        label: "紹介を作る",
        note: "招待を作って、新しい繋がりを始めましょう。",
        href: "/invite",
      };
    } else if (activeViews.length > 0) {
      // ゲストは招待を作れないので、既存の繋がりへ誘導する。
      nextAction = {
        label: "トークを開く",
        note: `${activeViews[0].partner?.display_name ?? "相手"} さんとのトークを開きます。`,
        href: `/c/${activeViews[0].conn.id}`,
      };
    }
  }

  // スタンプを贈る: トーク画面のスタンプ送信と全く同じ経路
  // （最新ターンを取得 → judgeConnection で遅延評価 → checkSend で可否判定 →
  //  turns へ insert → Push 通知）。エンジンの判定ロジック自体は変えない。
  const sendGift = async (v: ConnView, stampId: string) => {
    if (giftBusy) return;
    setGiftBusy(true);
    try {
      const rules = rulesFor(me.gender, v.partner?.gender);
      const turns = await selectRows<Turn>(
        `turns?connection_id=eq.${v.conn.id}&order=created_at.asc&select=*`,
      );
      const judged = judgeConnection(v.conn, turns, rules);
      let conn = v.conn;
      if (judged.changed) {
        conn = judged.connection;
        await updateRows("connections", `id=eq.${v.conn.id}`, {
          deadline: conn.deadline,
          state: conn.state,
        }).catch(() => undefined);
        if (conn.state === "gone") {
          setGift({
            connId: v.conn.id,
            stage: "error",
            message: "この繋がりは終わっていました",
          });
          return;
        }
      }
      const check = checkSend(conn, turns, session.userId, "stamp", rules);
      if (!check.ok) {
        setGift({ connId: v.conn.id, stage: "error", message: check.reason });
        return;
      }
      await insertRow<Turn>("turns", {
        connection_id: v.conn.id,
        sender_id: session.userId,
        kind: "stamp",
        stamp_id: stampId,
        body: null,
      });
      // スタンプ使用回数（端末ローカルのみ。トーク画面と同じキー・用途）
      try {
        const raw = window.localStorage.getItem("maasuu.stampUse.v1");
        const parsed: unknown = raw ? JSON.parse(raw) : {};
        const rec =
          parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : {};
        const cur = typeof rec[stampId] === "number" ? (rec[stampId] as number) : 0;
        window.localStorage.setItem(
          "maasuu.stampUse.v1",
          JSON.stringify({ ...rec, [stampId]: cur + 1 }),
        );
      } catch {
        // 保存できなくても贈る動作は止めない
      }
      // Web Push（fire-and-forget。失敗しても贈る動作は止めない。トーク画面と同じ）
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/push-notify`, {
          method: "POST",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: "Bearer " + session.accessToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ connection_id: v.conn.id }),
        });
      } catch {
        // 通知の失敗は無視する
      }
      setGift({ connId: v.conn.id, stage: "done" });
    } catch (e) {
      console.error(e);
      setGift({ connId: v.conn.id, stage: "error", message: "贈れませんでした" });
    } finally {
      setGiftBusy(false);
    }
  };

  // 今日のマァスゥとラッキースタンプは同じ seed（日付＋自分のID）で決まる
  const myLucky = luckyStampFor(me.id, now);
  // 今日の気分（自分のホームなので pub / priv の両方を出す。未設定なら誘導）
  const myMood = resolveTodaysMood(cards, localDateKey(now), true);
  // 映し鏡: 端末の日時から季節・時間帯の空気を決める（保存なし）
  const atmo = atmosphereFor(now);
  // 2匹の様子: 時間帯が基本。今日の活動が読み込み済みのデータで分かる場合
  // （今日の気分を置いた／この画面でスタンプを贈った）だけ「元気」側へ寄せる。
  // ターンの送信有無はこのパネルの読み込み範囲に無いので、状態には使わない。
  const pairState = pairStateFor(atmo, {
    engagedToday: myMood !== null || gift?.stage === "done",
  });
  // 掛け合い: 文脈（気分・飾り・ラッキー・季節／時間帯・通常）を seed で散らす
  const decorationLabels = cards
    .filter(isStampDecoration)
    .slice()
    .sort((a, b) => a.sort - b.sort || a.id - b.id)
    .map(
      (c) =>
        STAMPS.find((s) => s.src === c.image_url)?.label ??
        (c.title.trim() ? c.title : null),
    )
    .filter((l): l is string => l !== null);
  const today = homeBanter(me.id, now, {
    timeBand: atmo.timeBand,
    season: atmo.season,
    luckyLabel: myLucky.label,
    moodLabel: myMood?.stamp.label ?? null,
    decorationLabels,
  });

  const footer = (
    <div className="text-center text-xs leading-relaxed text-balance">
      {normalCards.length === 0 && (
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
          <p className={normalCards.length === 0 ? "mt-3" : undefined}>
            <Link href={`/p/${me.promo_code}`} className="underline underline-offset-2">
              公開ページを見る
            </Link>
          </p>
        ) : (
          <p className={normalCards.length === 0 ? "mt-3" : undefined}>
            公開ページはOFFです。
            <Link href="/me" className="underline underline-offset-2">
              設定
            </Link>
            でONにできます。
          </p>
        ))}
      {/* 設定への常設入り口はシェルのヘッダーに一本化したため、ここには
          重複する「設定を開く」は置かない（操作性修正 2026-11-06）。
          公開ページへの入り口は上の「公開ページを見る」がホーム内で唯一。 */}
    </div>
  );

  const cardStyle = {
    borderColor: "var(--line)",
    background: "var(--surface)",
  } as const;

  return (
    <div className="flex h-full min-w-0 flex-col">
      {/* 1. 今日のマァスゥ＋今日のラッキースタンプ（操作性修正 2026-11-06:
          帯を1行に圧縮し、ラッキースタンプは行内に小さく収める。
          第2段で季節・時間帯の情景チップ＋2匹の様子を同じ行に添える） */}
      <div className="shrink-0 px-4 pt-3">
        <section
          className="flex items-center gap-2.5 rounded-full py-1.5 pr-2 pl-3.5"
          style={{ background: "var(--accent-soft)" }}
        >
          <span
            className="shrink-0 text-[10px] font-bold whitespace-nowrap"
            style={{ color: "var(--accent-strong)" }}
          >
            今日のマァスゥ
          </span>
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap"
            style={{ background: atmo.chipGradient, color: atmo.chipColor }}
            title={`${atmo.seasonLabel}・${atmo.timeBandLabel}`}
          >
            {atmo.sceneWord}、{pairState}
          </span>
          <span
            className="min-w-0 flex-1 truncate text-xs"
            style={{ color: "var(--text)" }}
          >
            マァ「{today.maa}」 スゥ「{today.suu}」
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={myLucky.src}
            alt={myLucky.label}
            title={`今日のラッキースタンプ：${myLucky.label}`}
            className="h-7 w-7 shrink-0 object-contain"
          />
        </section>
      </div>

      {/* 2. 自分のカード（中心）。ホームでは compact にして少し圧縮し、
          下の「次にやること」まで一画面に入る高さに寄せる */}
      <ProfilePageView
        profile={me}
        cards={cards}
        footer={footer}
        compact
        atmosphereStrip={atmo.stripGradient}
        mood={
          myMood
            ? { src: myMood.stamp.src, label: myMood.stamp.label }
            : null
        }
        showMoodPrompt={!myMood}
        className="min-h-0 min-w-0 flex-1"
      />

      {(activeViews.length > 0 || nextAction) && (
        <div className="shrink-0 space-y-3 px-4 py-3">
        {/* 3. いまの繋がり（ゼロ件なら出さない） */}
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
                // おそろい: 相手のラッキースタンプも同じ式で計算し、一致したら出す
                const partnerId =
                  v.conn.user_a === me.id ? v.conn.user_b : v.conn.user_a;
                const osoroi =
                  luckyStampFor(partnerId, now).id === myLucky.id;
                // 贈る導線は期限が近い（残り24時間未満）相手だけに出す
                const giftEligible = remainMs > 0 && remainMs < 24 * 3_600_000;
                const g = gift && gift.connId === v.conn.id ? gift : null;
                const giftStamp =
                  g && g.stage === "confirm"
                    ? STAMPS.find((s) => s.id === g.stampId)
                    : null;
                return (
                  <li key={v.conn.id}>
                    <div className="rounded-2xl border" style={cardStyle}>
                    <Link
                      href={`/c/${v.conn.id}`}
                      className="flex items-center gap-3 p-2.5"
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
                        {osoroi && (
                          <span
                            className="block truncate text-[11px] font-bold"
                            style={{ color: "var(--accent-strong)" }}
                          >
                            今日おそろい
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
                    {giftEligible && (
                      <div
                        className="border-t px-3 py-2.5"
                        style={{ borderColor: "var(--line)" }}
                      >
                        {!g ? (
                          <button
                            type="button"
                            onClick={() =>
                              setGift({ connId: v.conn.id, stage: "pick" })
                            }
                            className="text-xs font-bold"
                            style={{ color: "var(--accent-strong)" }}
                          >
                            スタンプを贈る
                          </button>
                        ) : g.stage === "pick" ? (
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <p
                                className="text-[11px]"
                                style={{ color: "var(--muted)" }}
                              >
                                贈るスタンプをえらんでください
                              </p>
                              <button
                                type="button"
                                onClick={() => setGift(null)}
                                className="shrink-0 text-[11px] underline underline-offset-2"
                                style={{ color: "var(--muted)" }}
                              >
                                やめる
                              </button>
                            </div>
                            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                              {STAMPS.map((s) => (
                                <button
                                  key={s.id}
                                  type="button"
                                  disabled={giftBusy}
                                  onClick={() =>
                                    setGift({
                                      connId: v.conn.id,
                                      stage: "confirm",
                                      stampId: s.id,
                                    })
                                  }
                                  aria-label={`スタンプ「${s.label}」を贈る`}
                                  className="h-12 w-12 shrink-0 rounded-lg border p-1 disabled:opacity-40"
                                  style={{
                                    borderColor: "var(--line)",
                                    background: "var(--surface)",
                                  }}
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={s.src}
                                    alt={s.label}
                                    className="h-full w-full object-contain"
                                  />
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : g.stage === "confirm" ? (
                          <div className="flex items-center gap-3">
                            {giftStamp && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={giftStamp.src}
                                alt={giftStamp.label}
                                className="h-11 w-11 shrink-0 object-contain"
                              />
                            )}
                            <p className="min-w-0 flex-1 text-xs">
                              このスタンプを贈りますか？
                            </p>
                            <button
                              type="button"
                              disabled={giftBusy}
                              onClick={() =>
                                g.stage === "confirm" &&
                                sendGift(v, g.stampId)
                              }
                              className="shrink-0 rounded-full px-4 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                              style={{ background: "var(--accent)" }}
                            >
                              贈る
                            </button>
                            <button
                              type="button"
                              disabled={giftBusy}
                              onClick={() =>
                                setGift({ connId: v.conn.id, stage: "pick" })
                              }
                              className="shrink-0 text-[11px] underline underline-offset-2 disabled:opacity-50"
                              style={{ color: "var(--muted)" }}
                            >
                              もどる
                            </button>
                          </div>
                        ) : g.stage === "done" ? (
                          <p
                            className="text-xs font-bold"
                            style={{ color: "var(--accent-strong)" }}
                          >
                            贈りました
                          </p>
                        ) : (
                          <p
                            className="text-xs"
                            style={{ color: "var(--muted)" }}
                          >
                            {g.message}
                          </p>
                        )}
                      </div>
                    )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* 4. 次にやること */}
        {nextAction && (
          <section className="rounded-2xl border p-3" style={cardStyle}>
            <h2 className="text-sm font-bold" style={{ color: "var(--muted)" }}>
              次にやること
            </h2>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
              {nextAction.note}
            </p>
            <Link
              href={nextAction.href}
              className="mt-2.5 block rounded-full py-2.5 text-center text-sm font-bold text-white"
              style={{ background: "var(--accent)" }}
            >
              {nextAction.label}
            </Link>
          </section>
        )}

        </div>
      )}
    </div>
  );
}
