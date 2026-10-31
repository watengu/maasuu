"use client";

// 1対1トーク画面。
// 開いたとき・送る前に遅延評価（judgeConnection）で期限判定する。
// 表示するメッセージは expires_at > now のものだけ（24時間で見えなくなる）。
// 行自体は残るので、往復数と1日上限のカウントは全行で行う。
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getSession, type Session } from "../../auth-client";
import BannedScreen from "../../banned-screen";
import {
  canSendText,
  checkSend,
  isDayOne,
  judgeConnection,
  remainingMs,
  remainingTurnsToday,
  roundTripsInCurrentWindow,
  rulesFor,
  textUnlocked,
  type RuleSet,
} from "../../../lib/engine";
import {
  dayKeyJST,
  formatDateDividerJST,
  formatRemaining,
  formatTimeJST,
} from "../../../lib/format";
import { AVATAR_CLASS } from "../../../lib/avatar";
import { genreLabel } from "../../../lib/genres";
import { STAMPS, stampSrc, suggestStamps } from "../../../lib/stamps";
import {
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  insertRow,
  rpc,
  selectOne,
  selectRows,
  updateRows,
} from "../../../lib/supabase";
import type { Connection, Profile, Turn } from "../../../lib/types";

type Loaded = {
  session: Session;
  me: Profile;
  partner: Profile | null;
  introducer: Profile | null;
  conn: Connection;
  rules: RuleSet;
  turns: Turn[]; // 全行（カウント用）
};

// スタンプの使用回数（端末ローカルのみ。サーバ・DBには送らない＝私的シグナルの分離）
const STAMP_USE_KEY = "maasuu.stampUse.v1";

export default function TalkClient() {
  const params = useParams<{ id: string }>();
  const connId = params.id;
  const [data, setData] = useState<Loaded | null>(null);
  const [phase, setPhase] = useState<"loading" | "error" | "banned" | "ready">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  // スタンプ選択欄は普段は閉じておき、ボタンで下から開く（会話を主役にする。Ao 指示 2026-10-29）
  const [stampOpen, setStampOpen] = useState(false);
  // スタンプ使用回数（localStorage から読み込み。「よく使う順」の並び替えにだけ使う）
  const [stampUse, setStampUse] = useState<Record<string, number>>({});
  const [, setTick] = useState(0);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  // スタンプ使用回数の読み込み（端末ローカルのみ。失敗しても並びは従来順で動く）
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STAMP_USE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const clean: Record<string, number> = {};
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof v === "number" && v > 0) clean[k] = v;
        }
        setStampUse(clean);
      }
    } catch {
      // 読めなければ従来順のまま
    }
  }, []);

  // スタンプ帯の並び: 使用回数の多い順、同数は従来順。未使用だけなら従来順のまま
  const orderedStamps = useMemo(
    () =>
      STAMPS.map((s, i) => ({ s, i }))
        .sort((a, b) => (stampUse[b.s.id] ?? 0) - (stampUse[a.s.id] ?? 0) || a.i - b.i)
        .map(({ s }) => s),
    [stampUse],
  );

  const load = useCallback(async () => {
    const session = await getSession();
    if (!session) {
      window.location.replace("/");
      return;
    }
    const me = await selectOne<Profile>(`profiles?id=eq.${session.userId}&select=*`);
    if (!me) {
      window.location.replace("/");
      return;
    }
    if (me.banned) {
      setPhase("banned");
      return;
    }
    const conn = await selectOne<Connection>(`connections?id=eq.${connId}&select=*`);
    if (!conn || (conn.user_a !== session.userId && conn.user_b !== session.userId)) {
      setErrorMsg("この繋がりは見つかりませんでした。");
      setPhase("error");
      return;
    }
    const partnerId = conn.user_a === session.userId ? conn.user_b : conn.user_a;
    const partner = await selectOne<Profile>(`profiles?id=eq.${partnerId}&select=*`);
    const introducer = conn.introducer_id
      ? await selectOne<Profile>(`profiles?id=eq.${conn.introducer_id}&select=*`)
      : null;
    const rules = rulesFor(me.gender, partner?.gender);
    const allTurns = await selectRows<Turn>(
      `turns?connection_id=eq.${connId}&order=created_at.asc&select=*`,
    );
    // 既読: この画面を開いて相手のターンを取得した時点で、相手の未読分に read_at を立てる。
    // 列追加マイグレーション未適用の環境では更新が失敗するので、その場合は無視して続行する。
    let turnsForState = allTurns;
    if (allTurns.some((t) => t.sender_id === partnerId && !t.read_at)) {
      const readAt = new Date().toISOString();
      try {
        await updateRows(
          "turns",
          `connection_id=eq.${connId}&sender_id=eq.${partnerId}&read_at=is.null`,
          { read_at: readAt },
        );
        turnsForState = allTurns.map((t) =>
          t.sender_id === partnerId && !t.read_at ? { ...t, read_at: readAt } : t,
        );
      } catch {
        // 既読の記録に失敗しても表示は止めない
      }
    }
    let judged = conn;
    if (conn.state === "active") {
      const res = judgeConnection(conn, turnsForState, rules);
      if (res.changed) {
        judged = res.connection;
        await updateRows("connections", `id=eq.${connId}`, {
          deadline: judged.deadline,
          state: judged.state,
        }).catch(() => undefined);
      }
    }
    setData({ session, me, partner, introducer, conn: judged, rules, turns: turnsForState });
    setPhase("ready");
  }, [connId]);

  useEffect(() => {
    // セッションは localStorage 保持のため、初回取得は effect から開始する（SSR では取得不可）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((e) => {
      console.error(e);
      setErrorMsg("読み込みに失敗しました。");
      setPhase("error");
    });
  }, [load]);

  // 新着をゆるく反映する（ポーリング）
  useEffect(() => {
    if (phase !== "ready") return;
    const t = setInterval(() => {
      load().catch(() => undefined);
    }, 20_000);
    return () => clearInterval(t);
  }, [phase, load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.turns.length]);

  if (phase === "loading") {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-24 text-center">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          読み込んでいます…
        </p>
      </main>
    );
  }
  if (phase === "banned") return <BannedScreen />;
  if (phase === "error" || !data) {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-24 text-center">
        <p className="text-sm">{errorMsg || "エラーが発生しました。"}</p>
        <p className="mt-4 text-xs">
          <Link href="/" className="underline">
            繋がり一覧へ戻る
          </Link>
        </p>
      </main>
    );
  }

  const { session, partner, introducer, conn, rules, turns } = data;
  const now = new Date();
  const gone = conn.state === "gone";
  const ended = conn.state === "ended";
  const finished = gone || ended;
  const visibleTurns = turns.filter((t) => new Date(t.expires_at).getTime() > now.getTime());
  const { roundTrips } = roundTripsInCurrentWindow(conn, turns, rules);
  const remainToday = remainingTurnsToday(turns, session.userId, rules, now);
  const dayOne = isDayOne(conn, now);
  const unlocked = textUnlocked(conn);
  const textOk = canSendText(conn, now);
  const myOk = conn.user_a === session.userId ? conn.text_ok_a : conn.text_ok_b;
  const partnerOk = conn.user_a === session.userId ? conn.text_ok_b : conn.text_ok_a;
  // 入力連動サジェスト: テキスト入力がある時だけ、入力文に合うスタンプを候補に出す
  const stampSuggestions = textOk ? suggestStamps(text) : [];

  // Web Push: 送信できたら相手へ通知を投げる（fire-and-forget。失敗しても送信フローは止めない）
  const notifyPush = async () => {
    try {
      const s = await getSession();
      if (!s) return;
      await fetch(`${SUPABASE_URL}/functions/v1/push-notify`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: "Bearer " + s.accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ connection_id: connId }),
      });
    } catch {
      // 通知の失敗は無視する（未設定の環境では 404 等になるだけ）
    }
  };

  const send = async (kind: "stamp" | "text", stampId?: string, body?: string) => {
    if (busy) return;
    setNotice("");
    // 送る前に最新状態で再判定する
    const freshTurns = await selectRows<Turn>(
      `turns?connection_id=eq.${connId}&order=created_at.asc&select=*`,
    ).catch(() => turns);
    const judged = judgeConnection(conn, freshTurns, rules);
    if (judged.changed) {
      await updateRows("connections", `id=eq.${connId}`, {
        deadline: judged.connection.deadline,
        state: judged.connection.state,
      }).catch(() => undefined);
      setData({ ...data, conn: judged.connection, turns: freshTurns });
      if (judged.connection.state === "gone") {
        setNotice("期限までに往復が足りず、この繋がりは終わりました。");
        return;
      }
    }
    const check = checkSend(judged.connection, freshTurns, session.userId, kind, rules);
    if (!check.ok) {
      setNotice(check.reason);
      return;
    }
    setBusy(true);
    try {
      await insertRow<Turn>("turns", {
        connection_id: connId,
        sender_id: session.userId,
        kind,
        stamp_id: stampId ?? null,
        body: body ?? null,
      });
      // スタンプ送信が成功したら端末ローカルの使用回数を増やす（並び替え専用・外部送信なし）
      if (kind === "stamp" && stampId) {
        setStampUse((prev) => {
          const next = { ...prev, [stampId]: (prev[stampId] ?? 0) + 1 };
          try {
            window.localStorage.setItem(STAMP_USE_KEY, JSON.stringify(next));
          } catch {
            // 保存できなくても送信フローは止めない
          }
          return next;
        });
      }
      void notifyPush();
      setText("");
      await load();
    } catch (e) {
      console.error(e);
      setNotice("送信できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const toggleMyOk = async () => {
    const field = conn.user_a === session.userId ? "text_ok_a" : "text_ok_b";
    const next = !myOk;
    setBusy(true);
    try {
      await updateRows("connections", `id=eq.${connId}`, { [field]: next });
      await load();
    } catch (e) {
      console.error(e);
      setNotice("更新できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  // 繋がりを切る: 確認のうえ state='ended' にする。相手側でも終了表示になり、
  // 双方とも送信できなくなる（送信判定は state==='active' のときだけ通る）。
  const endConnection = async () => {
    if (!window.confirm("この繋がりを切りますか？相手とも終了になり、元に戻せません。")) return;
    setBusy(true);
    setNotice("");
    try {
      await updateRows("connections", `id=eq.${connId}`, { state: "ended" });
      await load();
      setNotice("この繋がりを終了しました。");
    } catch (e) {
      console.error(e);
      setNotice("終了できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const report = async (reason: "gender_spoof" | "other") => {
    if (!partner) return;
    if (!window.confirm("この相手を通報しますか？")) return;
    setBusy(true);
    try {
      await rpc<number>("report_user", { p_target: partner.id, p_reason: reason });
      setReportOpen(false);
      setNotice("通報を受け付けました。");
    } catch (e) {
      console.error(e);
      setNotice("通報できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="talk-slide-in flex h-dvh flex-col overflow-x-clip">
      <header
        className="border-b"
        style={{ background: "var(--bg)", borderColor: "var(--line)" }}
      >
        <div className="mx-auto w-full max-w-md px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm" style={{ color: "var(--muted)" }}>
              ←
            </Link>
            {partner?.icon_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={partner.icon_url}
                alt=""
                className={`${AVATAR_CLASS.talkHeader} rounded-full object-cover`}
              />
            ) : (
              <span
                className={`flex ${AVATAR_CLASS.talkHeader} items-center justify-center rounded-full text-sm font-bold`}
                style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
              >
                {(partner?.display_name ?? "?").slice(0, 1)}
              </span>
            )}
            <p className="min-w-0 flex-1 truncate text-sm font-bold">
              {partner?.display_name ?? "相手"}
            </p>
            <div className="flex shrink-0 flex-col items-end gap-1">
            <button
              type="button"
              onClick={() => setReportOpen((v) => !v)}
              className="text-xs underline underline-offset-2"
              style={{ color: "var(--muted)" }}
            >
              通報
            </button>
            {conn.state === "active" && (
              <button
                type="button"
                disabled={busy}
                onClick={endConnection}
                className="text-xs font-bold underline underline-offset-2 disabled:opacity-50"
                style={{ color: "var(--accent-strong)" }}
              >
                繋がりを切る
              </button>
            )}
            </div>
          </div>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
            {ended
              ? "この繋がりは終了しました"
              : gone
                ? "この繋がりは終わりました"
                : `${formatRemaining(remainingMs(conn, now))} ・ 往復 ${roundTrips}/${rules.quotaRoundTrips} ・ 今日あと${remainToday}ターン`}
          </p>
        </div>
        {reportOpen && partner && (
          <div
            className="border-t px-4 py-3"
            style={{ borderColor: "var(--line)", background: "var(--surface)" }}
          >
            <p className="text-xs font-bold">相手を通報する</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => report("gender_spoof")}
                className="rounded-full border px-3 py-1.5 text-xs"
                style={{ borderColor: "var(--line)" }}
              >
                性別なりすまし
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => report("other")}
                className="rounded-full border px-3 py-1.5 text-xs"
                style={{ borderColor: "var(--line)" }}
              >
                その他
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed" style={{ color: "var(--muted)" }}>
              性別なりすましは、別々の3人から通報が集まるとアカウントが停止されます。
            </p>
          </div>
        )}
      </header>

      <main className="mx-auto min-h-0 w-full max-w-md flex-1 overflow-y-auto px-4 py-4">
        {(conn.genre || introducer) && (
          <p className="mb-3 text-center text-[11px]" style={{ color: "var(--muted)" }}>
            {conn.genre && (
              <span
                className="mr-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold"
                style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
              >
                テーマ：{genreLabel(conn.genre)}
              </span>
            )}
            {introducer &&
              // 紹介者が当事者の一方なら直接の招待（ダイレクト）。それ以外は橋渡し経由。
              ((conn.introducer_id === conn.user_a || conn.introducer_id === conn.user_b) && partner
                ? `${partner.display_name} さんと繋がりました`
                : `${introducer.display_name} さんの紹介で繋がりました`)}
          </p>
        )}
        {partner?.status_line && (
          <p
            className="mb-3 rounded-xl px-3 py-2 text-center text-xs"
            style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
          >
            {partner.display_name}：{partner.status_line}
          </p>
        )}
        {notice && (
          <p
            className="mb-3 rounded-xl border px-3 py-2 text-center text-xs"
            style={{ borderColor: "var(--line)", background: "var(--surface)" }}
          >
            {notice}
          </p>
        )}
        <ul className="space-y-3">
          {visibleTurns.map((t, i) => {
            const mine = t.sender_id === session.userId;
            const src = t.kind === "stamp" ? stampSrc(t.stamp_id) : null;
            // 日付区切り: 先頭と、JST の暦日が変わる地点に入れる（表示中メッセージのみで判定）
            const showDateDivider =
              i === 0 || dayKeyJST(visibleTurns[i - 1].created_at) !== dayKeyJST(t.created_at);
            const bubble =
              t.kind === "stamp" && src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt="スタンプ" className="inline-block w-28" />
              ) : (
                <span
                  className="inline-block whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-left text-sm leading-relaxed"
                  style={
                    mine
                      ? { background: "var(--accent)", color: "#fff" }
                      : { background: "var(--surface)", border: "1px solid var(--line)" }
                  }
                >
                  {t.body}
                </span>
              );
            return (
              <Fragment key={t.id}>
                {showDateDivider && (
                  <li className="flex justify-center py-1">
                    <span
                      className="rounded-full border px-3 py-0.5 text-[10px]"
                      style={{
                        borderColor: "var(--line)",
                        background: "var(--surface)",
                        color: "var(--muted)",
                      }}
                    >
                      {formatDateDividerJST(t.created_at)}
                    </span>
                  </li>
                )}
                {mine ? (
                  // 自分: 吹き出しの左下横に 既読（読まれた時のみ）＋時刻を小さく縦積み
                  <li className="flex items-end justify-end gap-1.5">
                    <span
                      className="flex shrink-0 flex-col items-end text-[10px] leading-tight"
                      style={{ color: "var(--muted)" }}
                    >
                      {t.read_at && <span>既読</span>}
                      <span>{formatTimeJST(t.created_at)}</span>
                    </span>
                    <div className="max-w-[70%]">{bubble}</div>
                  </li>
                ) : (
                  // 相手: 左に円形アイコン、吹き出しの右下横に時刻を小さく表示
                  <li className="flex items-start justify-start gap-1.5">
                    {partner?.icon_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={partner.icon_url}
                        alt=""
                        className={`${AVATAR_CLASS.bubble} shrink-0 rounded-full object-cover`}
                      />
                    ) : (
                      <span
                        className={`flex ${AVATAR_CLASS.bubble} shrink-0 items-center justify-center rounded-full text-[11px] font-bold`}
                        style={{
                          background: "var(--accent-soft)",
                          color: "var(--accent-strong)",
                        }}
                      >
                        {(partner?.display_name ?? "?").slice(0, 1)}
                      </span>
                    )}
                    <div className="max-w-[70%]">{bubble}</div>
                    <span
                      className="shrink-0 self-end text-[10px] leading-tight"
                      style={{ color: "var(--muted)" }}
                    >
                      {formatTimeJST(t.created_at)}
                    </span>
                  </li>
                )}
              </Fragment>
            );
          })}
        </ul>
        {visibleTurns.length === 0 && (
          <p
            className="whitespace-pre-wrap py-8 text-center text-xs leading-relaxed text-balance"
            style={{ color: "var(--muted)" }}
          >
            {ended
              ? "この繋がりは終了しました。"
              : gone
                ? "メッセージは消えました。"
                : "まだメッセージがありません。スタンプで最初のターンを送ってみましょう。\nメッセージは24時間で見えなくなります。"}
          </p>
        )}
        <div ref={bottomRef} />
      </main>

      {!finished && (
        <footer
          className="border-t"
          style={{
            background: "var(--bg)",
            borderColor: "var(--line)",
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
        >
          <div className="mx-auto w-full max-w-md px-4 py-3">
            {!unlocked || dayOne ? (
              <div
                className="mb-2 rounded-xl px-3 py-2"
                style={{ background: "var(--surface)", border: "1px solid var(--line)" }}
              >
                <p className="text-[11px] leading-snug" style={{ color: "var(--muted)" }}>
                  {dayOne
                    ? "初日はスタンプのみ。テキストは明日以降、双方の許可がそろうと使えます。"
                    : "テキストは双方の許可がそろうと使えます。"}
                </p>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <p className="text-xs">
                    あなた：{myOk ? "許可済み" : "未許可"} ／ 相手：{partnerOk ? "許可済み" : "未許可"}
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={toggleMyOk}
                    className="shrink-0 rounded-full px-3 py-1 text-[11px] font-bold text-white disabled:opacity-50"
                    style={{ background: "var(--accent)" }}
                  >
                    {myOk ? "テキスト許可を取り消す" : "テキストを許可する"}
                  </button>
                </div>
              </div>
            ) : null}
            {stampSuggestions.length > 0 && (
              <div className="mb-2 flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <span
                  className="shrink-0 text-[10px] font-bold"
                  style={{ color: "var(--muted)" }}
                >
                  候補
                </span>
                {stampSuggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    disabled={busy || remainToday <= 0}
                    onClick={() => send("stamp", s.id)}
                    aria-label={`スタンプ候補：${s.label}`}
                    className="h-12 w-12 shrink-0 rounded-lg p-1 disabled:opacity-40"
                    style={{ background: "var(--surface)", border: "1px solid var(--line)" }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.src} alt={s.label} className="h-full w-full object-contain" />
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-start gap-2">
              <button
                type="button"
                onClick={() => setStampOpen((v) => !v)}
                aria-expanded={stampOpen}
                className="shrink-0 rounded-full border px-4 py-2 text-sm font-bold"
                style={
                  stampOpen
                    ? {
                        borderColor: "var(--accent)",
                        background: "var(--accent-soft)",
                        color: "var(--accent-strong)",
                      }
                    : {
                        borderColor: "var(--line)",
                        background: "var(--surface)",
                        color: "var(--accent-strong)",
                      }
                }
              >
                スタンプ
              </button>
              {textOk ? (
                <>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value.slice(0, 140))}
                    rows={2}
                    maxLength={140}
                    placeholder="140文字まで"
                    className="min-w-0 flex-1 resize-none rounded-2xl border px-3 py-2 text-sm outline-none"
                    style={{ borderColor: "var(--line)", background: "var(--surface)" }}
                  />
                  <button
                    type="button"
                    disabled={busy || !text.trim() || remainToday <= 0}
                    onClick={() => send("text", undefined, text.trim())}
                    className="shrink-0 rounded-full px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
                    style={{ background: "var(--accent)" }}
                  >
                    送る
                  </button>
                </>
              ) : (
                <p className="flex-1 pt-2 text-center text-[11px]" style={{ color: "var(--muted)" }}>
                  {unlocked && dayOne
                    ? "テキストは明日から使えます"
                    : unlocked
                      ? ""
                      : "テキストは双方の許可がそろうと使えます"}
                </p>
              )}
            </div>
            {stampOpen && (
              <div className="mt-3 grid auto-cols-[84px] grid-flow-col grid-rows-2 gap-2 overflow-x-auto pb-1 [mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent_100%)] [scrollbar-width:none] snap-x [&::-webkit-scrollbar]:hidden">
                {orderedStamps.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    disabled={busy || remainToday <= 0}
                    onClick={() => send("stamp", s.id)}
                    className="h-[84px] w-[84px] snap-start rounded-xl p-1.5 disabled:opacity-40"
                    style={{ background: "var(--surface)", border: "1px solid var(--line)" }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.src} alt={s.label} className="h-full w-full object-contain" />
                  </button>
                ))}
              </div>
            )}
            <p className="mt-2 text-center text-[11px]" style={{ color: "var(--muted)" }}>
              今日あと{remainToday}ターン（上限 {rules.dailyCap}）・ メッセージは24時間で見えなくなります
            </p>
          </div>
        </footer>
      )}
    </div>
  );
}
