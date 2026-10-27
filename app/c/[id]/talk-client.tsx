"use client";

// 1対1トーク画面。
// 開いたとき・送る前に遅延評価（judgeConnection）で期限判定する。
// 表示するメッセージは expires_at > now のものだけ（24時間で見えなくなる）。
// 行自体は残るので、往復数と1日上限のカウントは全行で行う。
import { useCallback, useEffect, useRef, useState } from "react";
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
import { formatRemaining, formatTimeJST } from "../../../lib/format";
import { genreLabel } from "../../../lib/genres";
import { STAMPS, stampSrc } from "../../../lib/stamps";
import { insertRow, rpc, selectOne, selectRows, updateRows } from "../../../lib/supabase";
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
  const [, setTick] = useState(0);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 30_000);
    return () => clearInterval(t);
  }, []);

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
    let judged = conn;
    if (conn.state === "active") {
      const res = judgeConnection(conn, allTurns, rules);
      if (res.changed) {
        judged = res.connection;
        await updateRows("connections", `id=eq.${connId}`, {
          deadline: judged.deadline,
          state: judged.state,
        }).catch(() => undefined);
      }
    }
    setData({ session, me, partner, introducer, conn: judged, rules, turns: allTurns });
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
  const visibleTurns = turns.filter((t) => new Date(t.expires_at).getTime() > now.getTime());
  const { roundTrips } = roundTripsInCurrentWindow(conn, turns, rules);
  const remainToday = remainingTurnsToday(turns, session.userId, rules, now);
  const dayOne = isDayOne(conn, now);
  const unlocked = textUnlocked(conn);
  const textOk = canSendText(conn, now);
  const myOk = conn.user_a === session.userId ? conn.text_ok_a : conn.text_ok_b;
  const partnerOk = conn.user_a === session.userId ? conn.text_ok_b : conn.text_ok_a;

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
    <div className="flex min-h-screen flex-col">
      <header
        className="sticky top-0 z-10 border-b"
        style={{ background: "var(--bg)", borderColor: "var(--line)" }}
      >
        <div className="mx-auto flex w-full max-w-md items-center gap-3 px-4 py-3">
          <Link href="/" className="text-sm" style={{ color: "var(--muted)" }}>
            ←
          </Link>
          {partner?.icon_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={partner.icon_url} alt="" className="h-9 w-9 rounded-full object-cover" />
          ) : (
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold"
              style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
            >
              {(partner?.display_name ?? "?").slice(0, 1)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{partner?.display_name ?? "相手"}</p>
            <p className="truncate text-xs" style={{ color: "var(--muted)" }}>
              {gone
                ? "この繋がりは終わりました"
                : `${formatRemaining(remainingMs(conn, now))} ・ 往復 ${roundTrips}/${rules.quotaRoundTrips} ・ 今日あと${remainToday}ターン`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setReportOpen((v) => !v)}
            className="text-xs underline underline-offset-2"
            style={{ color: "var(--muted)" }}
          >
            通報
          </button>
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

      <main className="mx-auto w-full max-w-md flex-1 px-4 py-4">
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
            {introducer && `${introducer.display_name} さんの紹介で繋がりました`}
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
          {visibleTurns.map((t) => {
            const mine = t.sender_id === session.userId;
            const src = t.kind === "stamp" ? stampSrc(t.stamp_id) : null;
            return (
              <li key={t.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[75%] ${mine ? "text-right" : "text-left"}`}>
                  {t.kind === "stamp" && src ? (
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
                  )}
                  <span
                    className="mt-0.5 block text-[10px]"
                    style={{ color: "var(--muted)" }}
                  >
                    {formatTimeJST(t.created_at)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
        {visibleTurns.length === 0 && (
          <p className="py-8 text-center text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
            {gone
              ? "メッセージは消えました。"
              : "まだメッセージがありません。スタンプで最初のターンを送ってみましょう。\nメッセージは24時間で見えなくなります。"}
          </p>
        )}
        <div ref={bottomRef} />
      </main>

      {!gone && (
        <footer
          className="sticky bottom-0 border-t"
          style={{ background: "var(--bg)", borderColor: "var(--line)" }}
        >
          <div className="mx-auto w-full max-w-md px-4 py-3">
            {!unlocked || dayOne ? (
              <div
                className="mb-3 rounded-xl px-3 py-2 text-xs leading-relaxed"
                style={{ background: "var(--surface)", border: "1px solid var(--line)" }}
              >
                {dayOne ? (
                  <p>初日はスタンプだけの日です。テキストは明日以降、双方の許可がそろうと使えます。</p>
                ) : (
                  <p>テキストは双方の許可がそろうと使えます。</p>
                )}
                <p className="mt-1">
                  あなた：{myOk ? "許可済み" : "未許可"} ／ 相手：{partnerOk ? "許可済み" : "未許可"}
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={toggleMyOk}
                  className="mt-2 rounded-full px-4 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                  style={{ background: "var(--accent)" }}
                >
                  {myOk ? "テキスト許可を取り消す" : "テキストを許可する"}
                </button>
              </div>
            ) : null}
            <div className="grid grid-cols-5 gap-2">
              {STAMPS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  disabled={busy || remainToday <= 0}
                  onClick={() => send("stamp", s.id)}
                  className="rounded-xl p-1 disabled:opacity-40"
                  style={{ background: "var(--surface)", border: "1px solid var(--line)" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.src} alt={s.label} className="w-full" />
                </button>
              ))}
            </div>
            {textOk ? (
              <div className="mt-3 flex items-end gap-2">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, 140))}
                  rows={2}
                  maxLength={140}
                  placeholder="140文字まで"
                  className="flex-1 resize-none rounded-2xl border px-3 py-2 text-sm outline-none"
                  style={{ borderColor: "var(--line)", background: "var(--surface)" }}
                />
                <button
                  type="button"
                  disabled={busy || !text.trim() || remainToday <= 0}
                  onClick={() => send("text", undefined, text.trim())}
                  className="rounded-full px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
                  style={{ background: "var(--accent)" }}
                >
                  送る
                </button>
              </div>
            ) : (
              <p className="mt-2 text-center text-[11px]" style={{ color: "var(--muted)" }}>
                {unlocked && dayOne
                  ? "テキストは明日から使えます"
                  : unlocked
                    ? ""
                    : "テキストは双方の許可がそろうと使えます"}
              </p>
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
