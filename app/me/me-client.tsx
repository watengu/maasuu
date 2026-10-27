"use client";

// プロフィール編集: 基本情報 / カードの追加・削除 / 宣伝ページ ON・OFF と URL /
// 紹介セットの作成（2本で1セット、ジャンル必須。紹介者クールダウン = 前回作成から3日）。
import { useCallback, useEffect, useState } from "react";
import { getSession, type Session } from "../auth-client";
import AppHeader from "../app-header";
import BannedScreen from "../banned-screen";
import {
  generateIntroCode,
  introCooldownRemainingMs,
} from "../../lib/engine";
import { formatDateTimeJST, formatRemaining } from "../../lib/format";
import { GENRE_OPTIONS, genreLabel } from "../../lib/genres";
import {
  deleteRows,
  insertRow,
  selectOne,
  selectRows,
  updateRows,
} from "../../lib/supabase";
import type { Gender, Genre, IntroSet, Profile, ProfileCard } from "../../lib/types";

export default function MeClient() {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Profile | null>(null);
  const [cards, setCards] = useState<ProfileCard[]>([]);
  const [sets, setSets] = useState<IntroSet[]>([]);
  const [joinedNames, setJoinedNames] = useState<Map<string, string>>(new Map());
  const [newGenre, setNewGenre] = useState<Genre>("chat");
  const [phase, setPhase] = useState<"loading" | "error" | "banned" | "ready">("loading");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  // 編集用ローカル状態
  const [name, setName] = useState("");
  const [iconUrl, setIconUrl] = useState("");
  const [statusLine, setStatusLine] = useState("");
  const [gender, setGender] = useState<Gender>("female");

  // カード追加フォーム
  const [cardKind, setCardKind] = useState<"link" | "text">("link");
  const [cardTitle, setCardTitle] = useState("");
  const [cardUrl, setCardUrl] = useState("");

  const load = useCallback(async () => {
    const s = await getSession();
    if (!s) {
      window.location.replace("/");
      return;
    }
    setSession(s);
    const profile = await selectOne<Profile>(`profiles?id=eq.${s.userId}&select=*`);
    if (!profile) {
      window.location.replace("/");
      return;
    }
    if (profile.banned) {
      setPhase("banned");
      return;
    }
    setMe(profile);
    setName(profile.display_name);
    setIconUrl(profile.icon_url ?? "");
    setStatusLine(profile.status_line);
    setGender(profile.gender ?? "female");
    const cs = await selectRows<ProfileCard>(
      `profile_cards?user_id=eq.${s.userId}&order=sort.asc,id.asc&select=*`,
    );
    setCards(cs);
    const ss = await selectRows<IntroSet>(
      `introduction_sets?introducer_id=eq.${s.userId}&order=created_at.desc&select=*`,
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
    setPhase("ready");
  }, []);

  useEffect(() => {
    // セッションは localStorage 保持のため、初回取得は effect から開始する（SSR では取得不可）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((e) => {
      console.error(e);
      setPhase("error");
    });
  }, [load]);

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
  if (phase === "error" || !me || !session) {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-24 text-center">
        <p className="text-sm">読み込みに失敗しました。</p>
      </main>
    );
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const promoUrl = me.promo_code ? `${origin}/p/${me.promo_code}` : "";
  const lastSetAt = sets.length > 0 ? sets[0].created_at : null;
  const cooldownMs = introCooldownRemainingMs(lastSetAt);
  const canCreateSet = cooldownMs <= 0;

  const saveProfile = async () => {
    setBusy(true);
    setNotice("");
    try {
      await updateRows("profiles", `id=eq.${session.userId}`, {
        display_name: name.trim(),
        icon_url: iconUrl.trim() || null,
        status_line: statusLine.trim(),
        gender,
      });
      setNotice("プロフィールを保存しました。");
      await load();
    } catch (e) {
      console.error(e);
      setNotice("保存できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const togglePromo = async () => {
    setBusy(true);
    try {
      await updateRows("profiles", `id=eq.${session.userId}`, { promo_on: !me.promo_on });
      await load();
    } catch (e) {
      console.error(e);
      setNotice("切り替えできませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const addCard = async () => {
    if (!cardTitle.trim()) {
      setNotice("カードのタイトルを入力してください。");
      return;
    }
    if (cardKind === "link" && !/^https?:\/\//.test(cardUrl.trim())) {
      setNotice("リンクカードのURLは https:// から入力してください。");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      await insertRow<ProfileCard>("profile_cards", {
        user_id: session.userId,
        kind: cardKind,
        title: cardTitle.trim(),
        url: cardKind === "link" ? cardUrl.trim() : null,
        sort: cards.length,
      });
      setCardTitle("");
      setCardUrl("");
      await load();
    } catch (e) {
      console.error(e);
      setNotice("カードを追加できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const removeCard = async (id: number) => {
    if (!window.confirm("このカードを削除しますか？")) return;
    setBusy(true);
    try {
      await deleteRows("profile_cards", `id=eq.${id}`);
      await load();
    } catch (e) {
      console.error(e);
      setNotice("削除できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const createSet = async () => {
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
      });
      setNotice("紹介セットを作りました。リンクを2人に1本ずつ渡してください。");
      await load();
    } catch (e) {
      console.error(e);
      setNotice("作成できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const slotStatus = (joinedBy: string | null) =>
    joinedBy ? `参加済み（${joinedNames.get(joinedBy) ?? "参加者"} さん）` : "未参加";

  const inputCls = "w-full rounded-xl border px-3 py-2 text-sm outline-none";
  const inputStyle = { borderColor: "var(--line)", background: "var(--surface)" } as const;
  const sectionCls = "rounded-2xl border p-5";
  const sectionStyle = { borderColor: "var(--line)", background: "var(--surface)" } as const;

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-md flex-1 space-y-4 px-4 py-5">
        {notice && (
          <p
            className="rounded-xl border px-3 py-2 text-center text-xs"
            style={{ borderColor: "var(--line)", background: "var(--surface)" }}
          >
            {notice}
          </p>
        )}

        <section className={sectionCls} style={sectionStyle}>
          <h2 className="text-sm font-bold">基本情報</h2>
          <div className="mt-3 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-bold">名前</label>
              <input className={inputCls} style={inputStyle} value={name} maxLength={30}
                onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold">ステータス（一行）</label>
              <input className={inputCls} style={inputStyle} value={statusLine} maxLength={60}
                onChange={(e) => setStatusLine(e.target.value)} placeholder="いまの気分や状態" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold">アイコン画像URL</label>
              <input className={inputCls} style={inputStyle} value={iconUrl}
                onChange={(e) => setIconUrl(e.target.value)} placeholder="https://..." />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold">性別（自己申告）</label>
              <div className="flex gap-2">
                {(
                  [
                    ["female", "女性"],
                    ["male", "男性"],
                    ["other", "その他"],
                  ] as [Gender, string][]
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setGender(v)}
                    className="flex-1 rounded-xl border px-3 py-2 text-sm"
                    style={
                      gender === v
                        ? {
                            borderColor: "var(--accent)",
                            background: "var(--accent-soft)",
                            color: "var(--accent-strong)",
                            fontWeight: 700,
                          }
                        : { borderColor: "var(--line)", background: "var(--surface)" }
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>
                性別によって繋がりのルールが変わります。なりすましは通報の対象です。
              </p>
            </div>
            <button
              type="button"
              disabled={busy || !name.trim()}
              onClick={saveProfile}
              className="w-full rounded-full py-2.5 text-sm font-bold text-white disabled:opacity-50"
              style={{ background: "var(--accent)" }}
            >
              保存する
            </button>
          </div>
        </section>

        <section className={sectionCls} style={sectionStyle}>
          <h2 className="text-sm font-bold">プロフィールカード</h2>
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            リンクや自己紹介をカードで並べられます。宣伝ページにも同じカードが出ます。
          </p>
          {cards.length > 0 && (
            <ul className="mt-3 space-y-2">
              {cards.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-2 rounded-xl border px-3 py-2"
                  style={{ borderColor: "var(--line)" }}
                >
                  <span className="flex-1 truncate text-sm">
                    <span
                      className="mr-2 rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
                    >
                      {c.kind === "link" ? "リンク" : "テキスト"}
                    </span>
                    {c.title}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => removeCard(c.id)}
                    className="text-xs underline underline-offset-2"
                    style={{ color: "var(--muted)" }}
                  >
                    削除
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 space-y-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCardKind("link")}
                className="flex-1 rounded-xl border px-3 py-2 text-sm"
                style={
                  cardKind === "link"
                    ? { borderColor: "var(--accent)", background: "var(--accent-soft)", fontWeight: 700 }
                    : { borderColor: "var(--line)" }
                }
              >
                リンク
              </button>
              <button
                type="button"
                onClick={() => setCardKind("text")}
                className="flex-1 rounded-xl border px-3 py-2 text-sm"
                style={
                  cardKind === "text"
                    ? { borderColor: "var(--accent)", background: "var(--accent-soft)", fontWeight: 700 }
                    : { borderColor: "var(--line)" }
                }
              >
                テキスト
              </button>
            </div>
            <input className={inputCls} style={inputStyle} value={cardTitle} maxLength={80}
              onChange={(e) => setCardTitle(e.target.value)}
              placeholder={cardKind === "link" ? "リンクのタイトル" : "自己紹介などの文章"} />
            {cardKind === "link" && (
              <input className={inputCls} style={inputStyle} value={cardUrl}
                onChange={(e) => setCardUrl(e.target.value)} placeholder="https://..." />
            )}
            <button
              type="button"
              disabled={busy}
              onClick={addCard}
              className="w-full rounded-full border py-2 text-sm font-bold disabled:opacity-50"
              style={{ borderColor: "var(--accent)", color: "var(--accent-strong)" }}
            >
              カードを追加
            </button>
          </div>
        </section>

        <section className={sectionCls} style={sectionStyle}>
          <h2 className="text-sm font-bold">宣伝ページ</h2>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
            ONにすると、ログインしていない人にも見える公開ページが有効になります。
          </p>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm">{me.promo_on ? "公開中" : "非公開"}</span>
            <button
              type="button"
              disabled={busy}
              onClick={togglePromo}
              className="rounded-full px-4 py-1.5 text-xs font-bold text-white disabled:opacity-50"
              style={{ background: me.promo_on ? "var(--muted)" : "var(--accent)" }}
            >
              {me.promo_on ? "OFFにする" : "ONにする"}
            </button>
          </div>
          {me.promo_on && promoUrl && (
            <p className="mt-2 break-all rounded-xl px-3 py-2 text-xs" style={{ background: "var(--accent-soft)" }}>
              {promoUrl}
            </p>
          )}
        </section>

        <section className={sectionCls} style={sectionStyle}>
          <h2 className="text-sm font-bold">紹介セット（リンク2本で1セット）</h2>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
            紹介は、あなたが2人を繋ぐ「橋渡し」です。セットを作るとリンクが2本できて、
            2人に1本ずつ渡します。両方がリンクを開くと、その2人の繋がりが始まります
            （連動スタート）。あなた自身は繋がりには入りません。
            紹介セットは3日に1つまで作れます。
          </p>
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
          <button
            type="button"
            disabled={busy || !canCreateSet}
            onClick={createSet}
            className="mt-3 w-full rounded-full py-2.5 text-sm font-bold text-white disabled:opacity-40"
            style={{ background: "var(--accent)" }}
          >
            {canCreateSet ? "紹介セットを作る" : `次に作れるまで ${formatRemaining(cooldownMs)}`}
          </button>
          {sets.length > 0 && (
            <ul className="mt-4 space-y-3">
              {sets.map((st) => {
                const both = Boolean(st.joined_by_a && st.joined_by_b);
                return (
                  <li
                    key={st.id}
                    className="rounded-xl border px-3 py-2"
                    style={{ borderColor: "var(--line)" }}
                  >
                    <p className="flex items-center justify-between text-[11px]" style={{ color: "var(--muted)" }}>
                      <span>
                        <span
                          className="mr-2 rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
                        >
                          {genreLabel(st.genre)}
                        </span>
                        {formatDateTimeJST(st.created_at)} 作成
                      </span>
                      <span className="font-bold">{both ? "繋がり成立" : "成立待ち"}</span>
                    </p>
                    <div className="mt-2 space-y-2">
                      <div>
                        <p className="text-[11px] font-bold">
                          リンクA ・ {slotStatus(st.joined_by_a)}
                        </p>
                        <p className="break-all text-xs">{`${origin}/i/${st.code_a}`}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-bold">
                          リンクB ・ {slotStatus(st.joined_by_b)}
                        </p>
                        <p className="break-all text-xs">{`${origin}/i/${st.code_b}`}</p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
