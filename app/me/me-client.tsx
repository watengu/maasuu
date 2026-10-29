"use client";

// 設定画面: プロフィール編集（基本情報 / ホームに載せる内容の追加・削除）/ 公開ページ ON・OFF と URL /
// 招待の作成（一般ユーザーは直接招待のみ = リンク1本で本人と相手が直接繋がる。
// 橋渡し = リンク2本で2人を繋ぐ形は運営のみ。ジャンル必須。
// クールダウン = 一般ユーザーは前回作成から3日、運営は無制限。Ao 決定 2026-10-28）。
// 自分のページの見た目はトップ（ホームパネル）と公開ページ側が担い、ここは設定に専念する。
// 基本情報セクションの先頭には ProfilePageView のライブプレビューを置き、
// 入力・テーマ選択・カード並び替えがその場で仕上がりに反映される（第4弾 2026-10-29）。
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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
  rpc,
  selectOne,
  selectRows,
  updateRows,
} from "../../lib/supabase";
import LinkActions from "../link-actions";
import ProfilePageView, { PROFILE_THEMES } from "../profile-page-view";
import PushSection from "./push-section";
import type { Gender, Genre, IntroSet, Profile, ProfileCard } from "../../lib/types";

export default function MeClient() {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Profile | null>(null);
  const [cards, setCards] = useState<ProfileCard[]>([]);
  const [sets, setSets] = useState<IntroSet[]>([]);
  const [joinedNames, setJoinedNames] = useState<Map<string, string>>(new Map());
  const [newGenre, setNewGenre] = useState<Genre>("chat");
  const [newNote, setNewNote] = useState("");
  const [phase, setPhase] = useState<"loading" | "error" | "banned" | "ready">("loading");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  // 繋がり成立済みの招待行は折りたたむ（詳細はボタンで開く。Ao 指示 2026-10-29）
  const [expandedDone, setExpandedDone] = useState<Set<string>>(new Set());
  const toggleDone = (id: string) =>
    setExpandedDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // 編集用ローカル状態
  const [name, setName] = useState("");
  const [iconUrl, setIconUrl] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [theme, setTheme] = useState("default");
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
    setCoverUrl(profile.cover_url ?? "");
    setTheme(
      profile.theme && PROFILE_THEMES[profile.theme] ? profile.theme : "default",
    );
    setStatusLine(profile.status_line);
    setGender(profile.gender ?? "female");
    // カードと紹介セットは互いに独立（どちらも userId のみに依存）なので並列取得する。
    const [cs, ss] = await Promise.all([
      selectRows<ProfileCard>(
        `profile_cards?user_id=eq.${s.userId}&order=sort.asc,id.asc&select=*`,
      ),
      selectRows<IntroSet>(
        `introduction_sets?introducer_id=eq.${s.userId}&order=created_at.desc&select=*`,
      ),
    ]);
    setCards(cs);
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
  // 取り消したセットはクールダウン計算から除外する（再発行が阻まれないため）。
  // ゲストは紹介セットを作れない（SQL ポリシーでも遮断している）。
  const lastSetAt = sets.find((x) => !x.voided_at)?.created_at ?? null;
  const cooldownMs = introCooldownRemainingMs(lastSetAt);
  // 運営アカウントには本数縛り（クールダウン）を適用しない（Ao 指示 2026-10-28）。
  const canCreateSet = (me.is_operator || cooldownMs <= 0) && !me.is_guest;

  const saveProfile = async () => {
    setBusy(true);
    setNotice("");
    try {
      await updateRows("profiles", `id=eq.${session.userId}`, {
        display_name: name.trim(),
        icon_url: iconUrl.trim() || null,
        cover_url: coverUrl.trim() || null,
        theme,
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
      setNotice("タイトルを入力してください。");
      return;
    }
    if (cardKind === "link" && !/^https?:\/\//.test(cardUrl.trim())) {
      setNotice("リンクのURLは https:// から入力してください。");
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
      setNotice("追加できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const removeCard = async (id: number) => {
    if (!window.confirm("これを削除しますか？")) return;
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

  // カードの並び替え: ローカル state を入れ替えてプレビューへ即反映し、
  // sort を通し番号に付け替えて保存する（既存の保存方式＝updateRows に合わせる）。
  const moveCard = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= cards.length) return;
    const origSort = new Map(cards.map((c) => [c.id, c.sort]));
    const next = [...cards];
    [next[index], next[target]] = [next[target], next[index]];
    const reordered = next.map((c, i) => ({ ...c, sort: i }));
    setCards(reordered);
    setBusy(true);
    setNotice("");
    try {
      await Promise.all(
        reordered
          .filter((c) => origSort.get(c.id) !== c.sort)
          .map((c) => updateRows("profile_cards", `id=eq.${c.id}`, { sort: c.sort })),
      );
      await load();
    } catch (e) {
      console.error(e);
      setNotice("並び替えを保存できませんでした。");
      await load();
    } finally {
      setBusy(false);
    }
  };

  // 橋渡しセット（リンク2本）の作成は運営のみ（Ao 決定 2026-10-28: ユーザーは橋渡ししない）。
  const createSet = async () => {
    if (!canCreateSet || !me.is_operator) return;
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
        note: newNote.trim() ? newNote.trim() : null,
      });
      setNewNote("");
      setNotice("招待を作りました。リンクを2人に1本ずつ渡してください。");
      await load();
    } catch (e) {
      console.error(e);
      setNotice("作成できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  // ダイレクト招待: 紹介者自身が当事者Aとして着席済みのセット。
  // 相手は code_b のリンク1本だけを受け取り、参加した瞬間に紹介者との繋がりが始まる。
  // 一般ユーザーの紹介はこの形だけ（橋渡しは運営のみ）。クールダウンは canCreateSet が
  // 一般ユーザーにのみ適用する（運営は無制限）。
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
    if (
      !window.confirm(
        st.direct
          ? "この招待を取り消しますか？招待リンクは無効になります。"
          : "この招待を取り消しますか？リンクは両方とも無効になります。",
      )
    )
      return;
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

  // 運用の単位は「1URL = 1人分」。URLごとに状態が見える形にする。
  const SET_EXPIRE_MS = 72 * 60 * 60 * 1000;
  const setVoidReason = (st: IntroSet): string | null => {
    if (st.voided_at) return "取り消し";
    // サーバー側の失効条件と一致させる: 運営セットは「接続が成立しないまま72時間」で失効
    // （ダイレクト招待は joined_by_a が最初から入っているため、両方 null の条件では失効しない）。
    if (
      me.is_operator &&
      !(st.joined_by_a && st.joined_by_b) &&
      Date.now() - new Date(st.created_at).getTime() > SET_EXPIRE_MS
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

  // ライブプレビュー用: フォームの現在値で上書きしたプロフィール。
  // 入力・テーマ選択のたびに再描画され、仕上がりがその場で確認できる。
  const previewProfile: Profile = {
    ...me,
    display_name: name.trim() || me.display_name,
    icon_url: iconUrl.trim() || null,
    cover_url: coverUrl.trim() || null,
    theme,
    status_line: statusLine,
  };

  const inputCls = "w-full rounded-xl border px-3 py-2 text-sm outline-none";
  const inputStyle = { borderColor: "var(--line)", background: "var(--surface)" } as const;
  const sectionCls = "rounded-2xl border p-5";
  const sectionStyle = { borderColor: "var(--line)", background: "var(--surface)" } as const;

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-md flex-1 space-y-4 px-4 py-5">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-sm" style={{ color: "var(--muted)" }}>
            ←
          </Link>
          <h1 className="text-base font-bold">設定</h1>
        </div>
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
          <div
            className="mt-3 overflow-hidden rounded-[24px] border"
            style={{ borderColor: "var(--line)" }}
          >
            <div className="h-[430px]">
              <ProfilePageView
                profile={previewProfile}
                cards={cards}
                compact
                className="h-full"
              />
            </div>
          </div>
          <p className="mt-1.5 text-[11px]" style={{ color: "var(--muted)" }}>
            プレビュー： 名前・アイコン・背景などの入力がその場で反映されます。
          </p>
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
              <label className="mb-1 block text-xs font-bold">背景画像URL（プリセットより優先）</label>
              <input className={inputCls} style={inputStyle} value={coverUrl}
                onChange={(e) => setCoverUrl(e.target.value)} placeholder="https://..." />
              <p className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>
                あなたのホームと公開ページの背景いっぱいに表示されます。
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold">テーマ（背景の情景）</label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(PROFILE_THEMES).map(([key, t]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTheme(key)}
                    className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
                    style={
                      theme === key
                        ? {
                            borderColor: "var(--accent)",
                            background: "var(--accent-soft)",
                            color: "var(--accent-strong)",
                            fontWeight: 700,
                          }
                        : { borderColor: "var(--line)", background: "var(--surface)" }
                    }
                  >
                    <span
                      className="h-4 w-4 shrink-0 rounded-full border border-white shadow"
                      style={{ backgroundImage: t.gradient }}
                    />
                    {t.label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>
                背景画像URLを設定している場合は、テーマより背景画像が優先されます。
              </p>
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

        <PushSection session={session} />

        <section className={sectionCls} style={sectionStyle}>
          <h2 className="text-sm font-bold">ホームに載せる内容</h2>
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            リンクや短い文を並べて、あなたのホームと公開ページに出すものです。
          </p>
          {cards.length > 0 && (
            <ul className="mt-3 space-y-2">
              {cards.map((c, idx) => (
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
                    disabled={busy || idx === 0}
                    onClick={() => moveCard(idx, -1)}
                    aria-label="上へ"
                    className="px-1 text-sm disabled:opacity-30"
                    style={{ color: "var(--muted)" }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={busy || idx === cards.length - 1}
                    onClick={() => moveCard(idx, 1)}
                    aria-label="下へ"
                    className="px-1 text-sm disabled:opacity-30"
                    style={{ color: "var(--muted)" }}
                  >
                    ↓
                  </button>
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
              追加する
            </button>
          </div>
        </section>

        {me.is_guest && (
          <section className={sectionCls} style={sectionStyle}>
            <h2 className="text-sm font-bold">ゲストで参加中です</h2>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
              あなたは「ログインなし」で参加しています。情報はこの端末のブラウザに
              保存されているため、別の端末やブラウザでは開けません。
              ゲストの間は、招待の作成と公開ページは使えません。
            </p>
          </section>
        )}

        {!me.is_guest && (
        <section className={sectionCls} style={sectionStyle}>
          <h2 className="text-sm font-bold">公開ページ</h2>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
            オンにすると、ログインしていない人にも見える、あなたの公開ページが有効になります。
          </p>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm font-bold">
              公開ページ：{me.promo_on ? "オン" : "オフ"}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={me.promo_on}
              aria-label="公開ページのオン・オフ"
              disabled={busy}
              onClick={togglePromo}
              className="relative h-7 w-12 shrink-0 rounded-full disabled:opacity-50"
              style={{ background: me.promo_on ? "var(--accent)" : "var(--line)" }}
            >
              <span
                className="absolute top-0.5 h-6 w-6 rounded-full shadow"
                style={{
                  background: "var(--surface)",
                  left: me.promo_on ? "1.375rem" : "0.125rem",
                }}
              />
            </button>
          </div>
          {me.promo_on && promoUrl && (
            <>
              <p className="url-break mt-3 rounded-xl px-3 py-2 text-xs" style={{ background: "var(--accent-soft)" }}>
                {promoUrl}
              </p>
              <LinkActions url={promoUrl} />
            </>
          )}
        </section>
        )}

        {!me.is_guest && (
        <section className={sectionCls} style={sectionStyle}>
          <h2 className="text-sm font-bold">
            {me.is_operator ? "2人を繋ぐ招待" : "招待リンク"}
          </h2>
          {me.is_operator ? (
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
              あなたが2人を繋ぐ「橋渡し」の招待です。リンクが2本できるので、2人に1本ずつ渡してください。
              両方が開くと、その2人の繋がりが始まります。あなた自身は繋がりには入りません。
              運営アカウントは制限なく作れます。
            </p>
          ) : (
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
              紹介は、あなたと相手が直接繋がる「招待」です。招待リンクを1本作って相手に渡すと、
              相手が参加した瞬間に、あなたとの繋がりが始まります。
              招待は3日に1つまで作れます。
            </p>
          )}
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
          {me.is_operator && (
            <button
              type="button"
              disabled={busy || !canCreateSet}
              onClick={createSet}
              className="mt-3 w-full rounded-full py-2.5 text-sm font-bold text-white disabled:opacity-40"
              style={{ background: "var(--accent)" }}
            >
              {canCreateSet ? "2人を繋ぐ招待を作る" : `次に作れるまで ${formatRemaining(cooldownMs)}`}
            </button>
          )}
          {me.is_operator ? (
            <>
              <button
                type="button"
                disabled={busy || !canCreateSet}
                onClick={createDirectSet}
                className="mt-2 w-full rounded-full border py-2.5 text-sm font-bold disabled:opacity-40"
                style={{ borderColor: "var(--accent)", color: "var(--accent-strong)", background: "var(--surface)" }}
              >
                運営用：自分と繋がる招待を作る
              </button>
              <p className="mt-1 text-[11px] leading-relaxed" style={{ color: "var(--muted)" }}>
                運営用招待は、あなた自身が相手になる招待です。リンクは1本だけできて、
                開いた人が参加した瞬間に、あなたとの繋がりが始まります（橋渡しではありません）。
                運営用招待に本数の制限はありません。
              </p>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={busy || !canCreateSet}
                onClick={createDirectSet}
                className="mt-3 w-full rounded-full py-2.5 text-sm font-bold text-white disabled:opacity-40"
                style={{ background: "var(--accent)" }}
              >
                {canCreateSet ? "自分と繋がる招待を作る" : `次に作れるまで ${formatRemaining(cooldownMs)}`}
              </button>
              <p className="mt-1 text-[11px] leading-relaxed" style={{ color: "var(--muted)" }}>
                招待リンクは1本だけできて、開いた人が参加した瞬間に、あなたとの繋がりが始まります。
              </p>
            </>
          )}
          {sets.length > 0 && (
            <ul className="mt-4 space-y-3">
              {sets.map((st) => {
                const both = Boolean(st.joined_by_a && st.joined_by_b);
                const collapsed = both && !expandedDone.has(st.id);
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
                        {st.direct && (
                          <span
                            className="mr-2 rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                            style={{ background: "var(--accent)" }}
                          >
                            {me.is_operator ? "運営用招待" : "招待"}
                          </span>
                        )}
                        {formatDateTimeJST(st.created_at)} 作成
                      </span>
                      <span className="font-bold">
                        {both ? "繋がり成立" : setVoidReason(st) ? "失効" : "成立待ち"}
                      </span>
                    </p>
                    {both && (
                      <button
                        type="button"
                        onClick={() => toggleDone(st.id)}
                        aria-expanded={!collapsed}
                        className="mt-2 text-xs font-bold underline underline-offset-2"
                        style={{ color: "var(--accent-strong)" }}
                      >
                        {collapsed ? "詳細をひらく" : "詳細をとじる"}
                      </button>
                    )}
                    {!collapsed && (
                      <>
                    {st.note && (
                      <p className="mt-1.5 text-xs font-bold">送り先メモ：{st.note}</p>
                    )}
                    <div className="mt-2 space-y-2">
                      {st.direct ? (
                        <div>
                          <p className="text-[11px] font-bold">
                            招待リンク ・ {urlStatus(st, st.joined_by_b)}
                          </p>
                          <p className="break-all text-xs">{`${origin}/i/${st.code_b}`}</p>
                          <LinkActions url={`${origin}/i/${st.code_b}`} />
                        </div>
                      ) : (
                        <>
                          <div>
                            <p className="text-[11px] font-bold">
                              1人目用リンク ・ {urlStatus(st, st.joined_by_a)}
                            </p>
                            <p className="break-all text-xs">{`${origin}/i/${st.code_a}`}</p>
                            <LinkActions url={`${origin}/i/${st.code_a}`} />
                          </div>
                          <div>
                            <p className="text-[11px] font-bold">
                              2人目用リンク ・ {urlStatus(st, st.joined_by_b)}
                            </p>
                            <p className="break-all text-xs">{`${origin}/i/${st.code_b}`}</p>
                            <LinkActions url={`${origin}/i/${st.code_b}`} />
                          </div>
                        </>
                      )}
                    </div>
                    {!both && !st.voided_at && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => voidSet(st)}
                        className="mt-3 rounded-full border px-4 py-1.5 text-xs font-bold disabled:opacity-50"
                        style={{
                          borderColor: "var(--accent)",
                          background: "var(--surface)",
                          color: "var(--accent-strong)",
                        }}
                      >
                        この招待を取り消す
                      </button>
                    )}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        )}
      </main>
    </div>
  );
}
