"use client";

// 紹介ページ（段階2調整）: 紹介の本体。段階2で専用タブ化し、その後タブを
// 廃止して専用ルート /invite に移した。中身の3段構成はそのまま。
// 中身は3段に圧縮する: (1) 作る (2) 送る (3) 状態。
// ルールは従来どおり: 一般ユーザーは直接招待を3日に1つまで、運営は無制限、
// ゲストは作成不可（このコンポーネント自体を出さない）。橋渡しセットの作成は
// 設定（/me）だけに置く。ロジックは /me のダイレクト招待と同一。
// 段階1の扱いを維持する: 失効した招待にはリンク・コピー・送る・QRを出さない／
// 全ての自分の招待に「一覧から消す」（端末内のみ。lib/hidden.ts）。
import { useCallback, useEffect, useState } from "react";
import LinkActions from "../link-actions";
import type { Session } from "../auth-client";
import {
  generateIntroCode,
  introCooldownRemainingMs,
} from "../../lib/engine";
import { formatDateTimeJST, formatRemaining } from "../../lib/format";
import { GENRE_OPTIONS, genreLabel } from "../../lib/genres";
import { insertRow, rpc, selectRows } from "../../lib/supabase";
import { hideInvite, loadHidden } from "../../lib/hidden";
import type { Connection, Genre, IntroSet, Profile } from "../../lib/types";

export default function InviteSection({
  session,
  me,
}: {
  session: Session;
  me: Profile;
}) {
  const [sets, setSets] = useState<IntroSet[]>([]);
  const [joinedNames, setJoinedNames] = useState<Map<string, string>>(new Map());
  const [connBySet, setConnBySet] = useState<Map<string, Connection>>(new Map());
  const [newGenre, setNewGenre] = useState<Genre>("chat");
  const [newNote, setNewNote] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  // 失効判定用の現在時刻（取得のたびに更新する。描画中に Date.now() を呼ばないため）
  const [nowMs, setNowMs] = useState(0);
  // 「一覧から消す」（端末内のみ）
  const [hiddenInvites, setHiddenInvites] = useState<string[]>([]);
  useEffect(() => {
    setHiddenInvites(loadHidden(session.userId).invites);
  }, [session.userId]);

  const load = useCallback(async () => {
    const ss = await selectRows<IntroSet>(
      `introduction_sets?introducer_id=eq.${session.userId}&order=created_at.desc&select=*`,
    );
    setSets(ss);
    const joinedIds = Array.from(
      new Set(
        ss.flatMap((x) => [x.joined_by_a, x.joined_by_b]).filter((v): v is string => Boolean(v)),
      ),
    );
    if (joinedIds.length > 0) {
      const ps = await selectRows<Profile>(
        `profiles?id=in.(${joinedIds.join(",")})&select=id,display_name`,
      );
      setJoinedNames(new Map(ps.map((p) => [p.id, p.display_name])));
    } else {
      setJoinedNames(new Map());
    }
    // 状態表示用: 自分が当事者Aの接続（ダイレクト招待の接続）を引いて、
    // セットごとの「繋がりの残り時間」を出せるようにする（既存データの範囲内）。
    const conns = await selectRows<Connection>(
      `connections?user_a=eq.${session.userId}&select=id,intro_set_id,deadline,state`,
    ).catch(() => [] as Connection[]);
    setConnBySet(
      new Map(
        conns
          .filter((c): c is Connection & { intro_set_id: string } => Boolean(c.intro_set_id))
          .map((c) => [c.intro_set_id, c]),
      ),
    );
    setLoaded(true);
  }, [session.userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((e) => {
      console.error(e);
      setLoaded(true);
    });
  }, [load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNowMs(Date.now());
  }, [sets]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  // 取り消したセットはクールダウン計算から除外する（/me と同じ）。
  const lastSetAt = sets.find((x) => !x.voided_at)?.created_at ?? null;
  const cooldownMs = introCooldownRemainingMs(lastSetAt);
  // 運営アカウントには本数縛り（クールダウン）を適用しない（Ao 指示 2026-10-28）。
  const canCreateSet = loaded && (me.is_operator || cooldownMs <= 0) && !me.is_guest;

  // ダイレクト招待: 紹介者自身が当事者Aとして着席済みのセット（/me の createDirectSet と同一）。
  const createDirectSet = async () => {
    if (!canCreateSet) return;
    setBusy(true);
    setNotice("");
    try {
      const codeA = generateIntroCode();
      let codeB = generateIntroCode();
      while (codeB === codeA) codeB = generateIntroCode();
      await insertRow<IntroSet>("introduction_sets", {
        introducer_id: session.userId,
        code_a: codeA,
        code_b: codeB,
        genre: newGenre,
        direct: true,
        joined_by_a: session.userId,
        note: newNote.trim() ? newNote.trim() : null,
      });
      setNewNote("");
      setNotice(
        me.is_operator
          ? "運営用招待を作りました。下の「送る」から招待リンクを友人に渡してください。参加した瞬間に、あなたとの繋がりが始まります。"
          : "招待を作りました。下の「送る」から招待リンクを相手に渡してください。参加した瞬間に、あなたとの繋がりが始まります。",
      );
      await load();
    } catch (e) {
      console.error(e);
      setNotice("作成できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const voidSet = async (st: IntroSet) => {
    if (!window.confirm("この招待を取り消しますか？招待リンクは無効になります。")) return;
    setBusy(true);
    setNotice("");
    try {
      const res = await rpc<{ ok: boolean; reason?: string }>("void_intro_set", {
        p_set_id: st.id,
      });
      if (!res.ok) {
        setNotice(
          res.reason === "already_connected"
            ? "すでに繋がりが成立しているため取り消せません。"
            : "取り消せませんでした。",
        );
      } else {
        setNotice("招待を取り消しました。");
        await load();
      }
    } catch (e) {
      console.error(e);
      setNotice("取り消せませんでした。");
    } finally {
      setBusy(false);
    }
  };

  // 運用の単位は「1URL = 1人分」。URLごとに状態が見える形にする（/me と同じ）。
  const SET_EXPIRE_MS = 72 * 60 * 60 * 1000;
  const setVoidReason = (st: IntroSet): string | null => {
    if (st.voided_at) return "取り消し";
    if (
      me.is_operator &&
      !(st.joined_by_a && st.joined_by_b) &&
      nowMs - new Date(st.created_at).getTime() > SET_EXPIRE_MS
    ) {
      return "期限切れ";
    }
    return null;
  };
  const urlStatus = (st: IntroSet, joinedBy: string | null): string => {
    const vr = setVoidReason(st);
    if (vr) return `失効（${vr}）`;
    if (!joinedBy) return "未使用";
    return st.joined_by_a && st.joined_by_b
      ? `接続済み（${joinedNames.get(joinedBy) ?? "参加者"} さん）`
      : `待機中（${joinedNames.get(joinedBy) ?? "参加者"} さん参加済み）`;
  };

  const directSets = sets.filter((st) => st.direct && !hiddenInvites.includes(st.id));
  // 「送る」に出せる招待: 未使用（相手がまだ参加していない）で失効していないもの。
  const sendableSets = directSets.filter(
    (st) => !st.joined_by_b && !setVoidReason(st),
  );

  const cardStyle = {
    borderColor: "var(--line)",
    background: "var(--surface)",
  } as const;

  return (
    <div className="mt-4 space-y-4">
      {/* 冒頭: 3行要約（全文は畳んで残す） */}
      <div>
        <h2 className="text-sm font-bold" style={{ color: "var(--muted)" }}>
          紹介
        </h2>
        <div
          className="mt-2 space-y-1 text-xs leading-relaxed"
          style={{ color: "var(--muted)" }}
        >
          <p>招待リンクを1本作って相手に渡すと、相手が参加した瞬間に、あなたとの繋がりが始まります。</p>
          <p>初日はスタンプだけ。テキストは24時間が過ぎて、お互いが許可すると使えます。</p>
          <p>繋がりには期限があります。期限までに往復を達成すると、期限が延びます。</p>
        </div>
        <details className="mt-2">
          <summary
            className="cursor-pointer text-xs font-bold underline underline-offset-2"
            style={{ color: "var(--accent-strong)" }}
          >
            繋がり方の流れ（詳しく）
          </summary>
          <div className="mt-2 text-[11px] leading-relaxed" style={{ color: "var(--muted)" }}>
            <p>
              {me.is_operator
                ? "あなた自身が相手になる招待です。リンクは1本だけできて、開いた人が参加した瞬間に、あなたとの繋がりが始まります。運営アカウントは制限なく作れます。"
                : "招待は3日に1つまで作れます。"}
            </p>
            <ul className="mt-2 list-disc space-y-0.5 pl-4">
              <li>初日（24時間）はスタンプだけのやり取りです。</li>
              <li>テキストは、2人とも「テキストを許可」して、24時間が過ぎると使えます。</li>
              <li>メッセージは24時間で見えなくなります。</li>
              <li>
                繋がりには期限があります。期限までに往復ターンを達成すると期限が延びます（異性間は3日で往復3ターン・達成で+3日、同性間は7日で往復2ターン・達成で+7日）。残り時間と往復の進み具合は、トーク画面の上部に表示されます。
              </li>
            </ul>
          </div>
        </details>
      </div>

      {notice && (
        <p
          className="rounded-xl border px-3 py-2 text-center text-xs"
          style={{ borderColor: "var(--line)", background: "var(--surface)" }}
        >
          {notice}
        </p>
      )}

      {/* (1) 作る */}
      <section className="rounded-2xl border p-5" style={cardStyle}>
        <h3 className="text-sm font-bold">1. 作る</h3>
        <p className="mt-3 text-xs font-bold">テーマのジャンル（必須）</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {GENRE_OPTIONS.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => setNewGenre(g.key)}
              className="rounded-xl border px-2 py-2 text-xs"
              style={
                newGenre === g.key
                  ? {
                      borderColor: "var(--accent)",
                      background: "var(--accent-soft)",
                      color: "var(--accent-strong)",
                      fontWeight: 700,
                    }
                  : { borderColor: "var(--line)", background: "var(--surface)" }
              }
            >
              {g.label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs font-bold">送り先メモ（任意）</p>
        <input
          value={newNote}
          onChange={(e) => setNewNote(e.target.value.slice(0, 60))}
          maxLength={60}
          placeholder="例：○○さん用"
          className="mt-2 w-full rounded-xl border px-3 py-2 text-sm outline-none"
          style={{ borderColor: "var(--line)", background: "var(--surface)" }}
        />
        {me.is_operator ? (
          <button
            type="button"
            disabled={busy || !canCreateSet}
            onClick={createDirectSet}
            className="mt-3 w-full rounded-full border py-2.5 text-sm font-bold disabled:opacity-40"
            style={{
              borderColor: "var(--accent)",
              color: "var(--accent-strong)",
              background: "var(--surface)",
            }}
          >
            運営用：自分と繋がる招待を作る
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || !canCreateSet}
            onClick={createDirectSet}
            className="mt-3 w-full rounded-full py-2.5 text-sm font-bold text-white disabled:opacity-40"
            style={{ background: "var(--accent)" }}
          >
            {cooldownMs <= 0
              ? "自分と繋がる招待を作る"
              : `次に作れるまで ${formatRemaining(cooldownMs)}`}
          </button>
        )}
      </section>

      {/* (2) 送る */}
      <section className="rounded-2xl border p-5" style={cardStyle}>
        <h3 className="text-sm font-bold">2. 送る</h3>
        <ul
          className="mt-2 list-disc space-y-0.5 pl-4 text-[11px] leading-relaxed"
          style={{ color: "var(--muted)" }}
        >
          <li>リンクは1人分です。相手ごとに新しい招待を作ってください。</li>
          <li>渡すときに「参加した瞬間に、あなたとの繋がりが始まります」と一言添えると伝わります。</li>
        </ul>
        {sendableSets.length === 0 ? (
          <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
            {loaded
              ? "送れる招待はまだありません。上の「1. 作る」で作れます。"
              : "読み込んでいます…"}
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {sendableSets.map((st) => (
              <li
                key={st.id}
                className="rounded-xl border px-3 py-2"
                style={{ borderColor: "var(--line)" }}
              >
                <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                  <span
                    className="mr-2 rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
                  >
                    {genreLabel(st.genre)}
                  </span>
                  {formatDateTimeJST(st.created_at)} 作成
                </p>
                {st.note && (
                  <p className="mt-1 text-xs font-bold">送り先メモ：{st.note}</p>
                )}
                <p className="mt-2 text-[11px] font-bold">
                  招待リンク ・ {urlStatus(st, st.joined_by_b)}
                </p>
                <p className="break-all text-xs">{`${origin}/i/${st.code_b}`}</p>
                <LinkActions url={`${origin}/i/${st.code_b}`} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* (3) 状態 */}
      <section className="rounded-2xl border p-5" style={cardStyle}>
        <h3 className="text-sm font-bold">3. 状態</h3>
        {directSets.length === 0 ? (
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
            {loaded ? "招待はまだありません。" : "読み込んでいます…"}
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {directSets.map((st) => {
              const both = Boolean(st.joined_by_a && st.joined_by_b);
              const vr = setVoidReason(st);
              const linked = connBySet.get(st.id);
              const statusLabel =
                vr === "取り消し"
                  ? "失効（取り消し済み）"
                  : vr === "期限切れ"
                    ? "期限切れ"
                    : both
                      ? linked?.state === "gone"
                        ? "登録済み（繋がりは終了）"
                        : "登録済み"
                      : "有効";
              const remainLabel =
                both && linked && linked.state === "active"
                  ? `繋がりの残り ${formatRemaining(Math.max(0, new Date(linked.deadline).getTime() - nowMs))}`
                  : !both && !vr && me.is_operator
                    ? `失効まで ${formatRemaining(Math.max(0, new Date(st.created_at).getTime() + SET_EXPIRE_MS - nowMs))}`
                    : null;
              return (
                <li
                  key={st.id}
                  className="rounded-xl border px-3 py-2"
                  style={{ borderColor: "var(--line)" }}
                >
                  <p
                    className="flex items-center justify-between text-[11px]"
                    style={{ color: "var(--muted)" }}
                  >
                    <span>
                      <span
                        className="mr-2 rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
                      >
                        {genreLabel(st.genre)}
                      </span>
                      <span
                        className="mr-2 rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                        style={{ background: "var(--accent)" }}
                      >
                        {me.is_operator ? "運営用招待" : "招待"}
                      </span>
                      {formatDateTimeJST(st.created_at)} 作成
                    </span>
                    <span className="font-bold">{statusLabel}</span>
                  </p>
                  {st.note && (
                    <p className="mt-1.5 text-xs font-bold">送り先メモ：{st.note}</p>
                  )}
                  {remainLabel && (
                    <p className="mt-0.5 text-[11px]" style={{ color: "var(--muted)" }}>
                      {remainLabel}
                    </p>
                  )}
                  {both && st.joined_by_b && (
                    <p className="mt-0.5 text-[11px]" style={{ color: "var(--muted)" }}>
                      相手：{joinedNames.get(st.joined_by_b) ?? "参加者"} さん
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-4">
                    {!both && !st.voided_at && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => voidSet(st)}
                        className="rounded-full border px-4 py-1.5 text-xs font-bold disabled:opacity-50"
                        style={{
                          borderColor: "var(--accent)",
                          background: "var(--surface)",
                          color: "var(--accent-strong)",
                        }}
                      >
                        この招待を取り消す
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setHiddenInvites(hideInvite(session.userId, st.id).invites);
                      }}
                      className="text-xs underline underline-offset-2"
                      style={{ color: "var(--muted)" }}
                    >
                      一覧から消す
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
