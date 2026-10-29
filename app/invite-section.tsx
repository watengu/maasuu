"use client";

// 友人一覧パネル内の「紹介する」導線（Ao 決定 2026-10-29）。
// 非ゲスト全員が、ここで直接招待の作成（ジャンル選択＋作成）と、自分の直接招待の
// 一覧（コピー/送る/QR・取消つき）を扱える。ルールは設定（/me）と同じ:
// 一般ユーザーは3日に1つまで、運営は無制限、ゲストは作成不可（このセクション自体を出さない）。
// 橋渡しセットの作成は設定（/me）だけに置く。ロジックは /me のダイレクト招待と同一。
import { useCallback, useEffect, useState } from "react";
import LinkActions from "./link-actions";
import type { Session } from "./auth-client";
import {
  generateIntroCode,
  introCooldownRemainingMs,
} from "../lib/engine";
import { formatDateTimeJST, formatRemaining } from "../lib/format";
import { GENRE_OPTIONS, genreLabel } from "../lib/genres";
import { insertRow, rpc, selectRows } from "../lib/supabase";
import type { Connection, Genre, IntroSet, Profile } from "../lib/types";

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
    // ダッシュボード表示用: 自分が当事者Aの接続（ダイレクト招待の接続）を引いて、
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
          ? "運営用招待を作りました。「招待リンク」を友人に渡してください。参加した瞬間に、あなたとの繋がりが始まります。"
          : "招待を作りました。「招待リンク」を相手に渡してください。参加した瞬間に、あなたとの繋がりが始まります。",
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

  const directSets = sets.filter((st) => st.direct);

  return (
    <section
      className="mt-6 rounded-2xl border p-5"
      style={{ borderColor: "var(--line)", background: "var(--surface)" }}
    >
      <h2 className="text-sm font-bold">紹介する</h2>
      <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
        {me.is_operator
          ? "あなた自身が相手になる招待です。リンクは1本だけできて、開いた人が参加した瞬間に、あなたとの繋がりが始まります。運営アカウントは制限なく作れます。"
          : "招待リンクを1本作って相手に渡すと、相手が参加した瞬間に、あなたとの繋がりが始まります。招待は3日に1つまで作れます。"}
      </p>
      <p className="mt-3 text-[11px] font-bold">繋がったあとの流れ</p>
      <ul
        className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] leading-relaxed"
        style={{ color: "var(--muted)" }}
      >
        <li>初日（24時間）はスタンプだけのやり取りです。</li>
        <li>テキストは、2人とも「テキストを許可」して、24時間が過ぎると使えます。</li>
        <li>メッセージは24時間で見えなくなります。</li>
        <li>
          繋がりには期限があります。期限までに往復ターンを達成すると期限が延びます（異性間は3日で往復3ターン・達成で+3日、同性間は7日で往復2ターン・達成で+7日）。残り時間と往復の進み具合は、トーク画面の上部に表示されます。
        </li>
      </ul>
      {notice && (
        <p
          className="mt-3 rounded-xl border px-3 py-2 text-center text-xs"
          style={{ borderColor: "var(--line)", background: "var(--surface)" }}
        >
          {notice}
        </p>
      )}
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
      {directSets.length > 0 && (
        <ul className="mt-4 space-y-3">
          {directSets.map((st) => {
            const both = Boolean(st.joined_by_a && st.joined_by_b);
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
                  <span className="font-bold">
                    {both ? "繋がり成立" : setVoidReason(st) ? "失効" : "成立待ち"}
                  </span>
                </p>
                {(() => {
                  const vr = setVoidReason(st);
                  const linked = connBySet.get(st.id);
                  const statusLabel =
                    vr === "取り消し"
                      ? "失効（取り消し済み）"
                      : vr === "期限切れ"
                        ? "期限切れ"
                        : both
                          ? linked?.state === "gone"
                            ? "接続済み（終了）"
                            : "接続済み"
                          : "未使用";
                  const remainLabel =
                    both && linked && linked.state === "active"
                      ? `繋がりの残り ${formatRemaining(Math.max(0, new Date(linked.deadline).getTime() - nowMs))}`
                      : !both && !vr && me.is_operator
                        ? `失効まで ${formatRemaining(Math.max(0, new Date(st.created_at).getTime() + SET_EXPIRE_MS - nowMs))}`
                        : null;
                  return (
                    <div className="mt-2">
                      {st.note && (
                        <p className="text-xs font-bold">送り先メモ：{st.note}</p>
                      )}
                      <p className="mt-0.5 text-[11px]" style={{ color: "var(--muted)" }}>
                        状態：{statusLabel}
                        {remainLabel && ` ・ ${remainLabel}`}
                      </p>
                    </div>
                  );
                })()}
                <div className="mt-2">
                  <p className="text-[11px] font-bold">
                    招待リンク ・ {urlStatus(st, st.joined_by_b)}
                  </p>
                  <p className="break-all text-xs">{`${origin}/i/${st.code_b}`}</p>
                  <LinkActions url={`${origin}/i/${st.code_b}`} />
                </div>
                {!both && !st.voided_at && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => voidSet(st)}
                    className="mt-2 text-xs underline underline-offset-2 disabled:opacity-50"
                    style={{ color: "var(--muted)" }}
                  >
                    この招待を取り消す
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
