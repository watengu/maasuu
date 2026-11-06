"use client";

// 設定画面: プロフィール編集（基本情報 / ホームに載せる内容の追加・削除 / カードを飾る）/
// 公開ページ ON・OFF と URL /
// 招待の作成（段階2調整: 一般ユーザーの招待作成は専用ページ /invite にあり、ここには残さない。
// 橋渡し = リンク2本で2人を繋ぐ形の作成は運営のみ、ここに残す。ジャンル必須。
// クールダウン = 一般ユーザーは前回作成から3日、運営は無制限。Ao 決定 2026-10-28）。
// カードを飾る（段階2調整）: スタンプ飾りは profile_cards に kind='picture' +
// image_url=/stamps/stamp-XX.png の形で保存する（isStampDecoration で判別）。
// 通常カードの一覧・並び替えには混ぜず、飾りだけを対象に insert/delete する。
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
import { STAMPS } from "../../lib/stamps";
import type {
  Gender,
  Genre,
  IntroSet,
  Profile,
  ProfileCard,
  ProfileCardKind,
} from "../../lib/types";
import {
  isMoodCard,
  isStampDecoration,
  moodDescription,
  normalizeCardKind,
  parseMoodDescription,
  type MoodVisibility,
} from "../../lib/types";
import { localDateKey } from "../../lib/lucky";

const CARD_KIND_LABEL: Record<ProfileCardKind, string> = {
  button: "ボタン",
  picture: "画像カード",
  text: "テキスト",
};

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
  const [cardKind, setCardKind] = useState<ProfileCardKind>("button");
  const [cardTitle, setCardTitle] = useState("");
  const [cardUrl, setCardUrl] = useState("");
  const [cardImageUrl, setCardImageUrl] = useState("");
  const [cardDescription, setCardDescription] = useState("");

  // カードを飾る: 選択中のスタンプ（src の配列。並び＝配置順。最大3点）。
  // 保存までは下書きとして持ち、ライブプレビューにも即反映する。
  const [decoSel, setDecoSel] = useState<string[]>([]);

  // 今日の気分: 選択中のスタンプ（src。null=未設定）と公開範囲の下書き。
  // 保存済みの気分行の日付（古い気分の注意書き用。null=保存済みの気分なし）。
  const [moodSel, setMoodSel] = useState<string | null>(null);
  const [moodVis, setMoodVis] = useState<MoodVisibility>("pub");
  const [moodSavedDate, setMoodSavedDate] = useState<string | null>(null);

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
    // 飾りの下書きは保存済みの飾り（sort 順＝選択順）で初期化する
    setDecoSel(
      cs
        .filter(isStampDecoration)
        .slice()
        .sort((a, b) => a.sort - b.sort || a.id - b.id)
        .map((c) => c.image_url ?? "")
        .filter(Boolean),
    );
    // 気分の下書きは保存済みの気分行で初期化する（日付が古くても、選び直して
    // 保存すれば今日の気分として置き換わる）
    const savedMood = cs.find((c) => isMoodCard(c));
    const savedMoodInfo = savedMood
      ? parseMoodDescription(savedMood.description)
      : null;
    setMoodSel(savedMood?.image_url ?? null);
    setMoodVis(savedMoodInfo?.visibility ?? "pub");
    setMoodSavedDate(savedMoodInfo?.date ?? null);
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

  // スタンプ飾りと通常カードは分けて扱う（飾りは通常一覧・並び替えの対象外。
  // sort は飾り同士／通常カード同士の中でそれぞれ通し番号として使う）。
  // 気分行も通常カードには混ぜない（気分セクションだけで扱う）。
  const normalCards = cards.filter(
    (c) => !isStampDecoration(c) && !isMoodCard(c),
  );
  const savedDecos = cards
    .filter(isStampDecoration)
    .slice()
    .sort((a, b) => a.sort - b.sort || a.id - b.id);

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
    const url = cardUrl.trim();
    const imageUrl = cardImageUrl.trim();
    if (cardKind === "text") {
      // テキスト型はタイトル任意・本文が必須
      if (!cardDescription.trim()) {
        setNotice("本文を入力してください。");
        return;
      }
    } else if (!cardTitle.trim()) {
      setNotice("タイトルを入力してください。");
      return;
    }
    if (cardKind === "button" && !/^https?:\/\//.test(url)) {
      setNotice("リンクのURLは https:// から入力してください。");
      return;
    }
    if (cardKind !== "button" && url && !/^https?:\/\//.test(url)) {
      setNotice("URLは https:// から入力してください。");
      return;
    }
    if (cardKind === "picture" && imageUrl && !/^https?:\/\//.test(imageUrl)) {
      setNotice("画像URLは https:// から入力してください。");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      await insertRow<ProfileCard>("profile_cards", {
        user_id: session.userId,
        kind: cardKind,
        title: cardTitle.trim(),
        url: url || null,
        image_url: cardKind === "picture" ? imageUrl || null : null,
        description: cardKind === "button" ? null : cardDescription.trim() || null,
        sort: normalCards.length,
      });
      setCardTitle("");
      setCardUrl("");
      setCardImageUrl("");
      setCardDescription("");
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

  // カードの並び替え: 通常カードの中だけで入れ替える（飾りの sort には触らない）。
  // ローカル state を入れ替えてプレビューへ即反映し、sort を通し番号に付け替えて
  // 保存する（既存の保存方式＝updateRows に合わせる）。
  const moveCard = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= normalCards.length) return;
    const origSort = new Map(normalCards.map((c) => [c.id, c.sort]));
    const next = [...normalCards];
    [next[index], next[target]] = [next[target], next[index]];
    const reordered = next.map((c, i) => ({ ...c, sort: i }));
    const byId = new Map(reordered.map((c) => [c.id, c]));
    setCards(cards.map((c) => byId.get(c.id) ?? c));
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

  // 飾りの選択／解除（下書き。最大3点、選んだ順が配置順）
  const toggleDeco = (src: string) => {
    setDecoSel((prev) => {
      if (prev.includes(src)) return prev.filter((x) => x !== src);
      if (prev.length >= 3) return prev;
      return [...prev, src];
    });
  };

  // 飾りの保存: 飾り行だけを対象に、消えた分は delete・増えた分は insert・
  // 順序が変わった分は sort を更新する。他のカードには触らない。
  const saveDecorations = async () => {
    setBusy(true);
    setNotice("");
    try {
      const kept = savedDecos.filter((c) => c.image_url && decoSel.includes(c.image_url));
      const removed = savedDecos.filter(
        (c) => !(c.image_url && decoSel.includes(c.image_url)),
      );
      for (const c of removed) {
        await deleteRows("profile_cards", `id=eq.${c.id}`);
      }
      for (let i = 0; i < decoSel.length; i++) {
        const src = decoSel[i];
        const existing = kept.find((c) => c.image_url === src);
        if (existing) {
          if (existing.sort !== i) {
            await updateRows("profile_cards", `id=eq.${existing.id}`, { sort: i });
          }
        } else {
          const stamp = STAMPS.find((s) => s.src === src);
          await insertRow<ProfileCard>("profile_cards", {
            user_id: session.userId,
            kind: "picture",
            title: stamp?.label ?? "",
            url: null,
            image_url: src,
            description: null,
            sort: i,
          });
        }
      }
      setNotice("飾りを保存しました。");
      await load();
    } catch (e) {
      console.error(e);
      setNotice("飾りを保存できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  // 今日の気分の選択／解除（下書き。1つだけ。再タップで解除）
  const toggleMood = (src: string) => {
    setMoodSel((prev) => (prev === src ? null : src));
  };

  // 気分の保存: 気分行だけを対象にする（既存の気分行は日付が古いものも含めて
  // すべて置き換える。飾り・通常カードには触らない）。
  // 日付はこの端末のローカル日付で、表示側は「今日」の行だけを出す。
  const saveMood = async () => {
    setBusy(true);
    setNotice("");
    try {
      for (const c of cards.filter(isMoodCard)) {
        await deleteRows("profile_cards", `id=eq.${c.id}`);
      }
      if (moodSel) {
        const stamp = STAMPS.find((s) => s.src === moodSel);
        await insertRow<ProfileCard>("profile_cards", {
          user_id: session.userId,
          kind: "picture",
          title: stamp?.label ?? "",
          url: null,
          image_url: moodSel,
          description: moodDescription(localDateKey(), moodVis),
          sort: 0,
        });
      }
      setNotice(
        moodSel ? "今日の気分を保存しました。" : "今日の気分を外しました。",
      );
      await load();
    } catch (e) {
      console.error(e);
      setNotice("気分を保存できませんでした。");
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

  // ダイレクト招待の作成は紹介ページ（/invite）に移したため、ここには置かない。
  // ここに残すのは運営の橋渡し作成（createSet）だけ。

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

  // 追加フォームで入力中のカードも、下書きとしてプレビューの末尾に即反映する。
  const hasDraftCard = Boolean(
    cardTitle.trim() ||
      cardUrl.trim() ||
      cardImageUrl.trim() ||
      cardDescription.trim(),
  );
  // 飾りの下書き（選択中のスタンプ）も、プレビュー用の疑似カードとして混ぜる。
  // kind='picture' + image_url=スタンプの実パス なので、ProfilePageView 側で
  // isStampDecoration により飾りとして描き分けられる。
  const decoDraftCards: ProfileCard[] = decoSel.map((src, i) => ({
    id: -1000 - i,
    user_id: me.id,
    kind: "picture",
    title: STAMPS.find((s) => s.src === src)?.label ?? "",
    url: null,
    image_url: src,
    description: null,
    sort: i,
    created_at: "",
  }));

  const previewCards: ProfileCard[] = [
    ...normalCards,
    ...(hasDraftCard
      ? [
          {
            id: -1,
            user_id: me.id,
            kind: cardKind,
            title: cardTitle,
            url: cardUrl.trim() || null,
            image_url: cardImageUrl.trim() || null,
            description: cardDescription.trim() || null,
            sort: normalCards.length,
            created_at: "",
          } satisfies ProfileCard,
        ]
      : []),
    ...decoDraftCards,
  ];

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
                cards={previewCards}
                compact
                className="h-full"
                mood={
                  moodSel
                    ? {
                        src: moodSel,
                        label:
                          STAMPS.find((s) => s.src === moodSel)?.label ?? "",
                      }
                    : null
                }
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
          {normalCards.length > 0 && (
            <ul className="mt-3 space-y-2">
              {normalCards.map((c, idx) => (
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
                      {CARD_KIND_LABEL[normalizeCardKind(c.kind)]}
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
                    disabled={busy || idx === normalCards.length - 1}
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
              {(["button", "picture", "text"] as ProfileCardKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setCardKind(k)}
                  className="flex-1 rounded-xl border px-3 py-2 text-sm"
                  style={
                    cardKind === k
                      ? { borderColor: "var(--accent)", background: "var(--accent-soft)", fontWeight: 700 }
                      : { borderColor: "var(--line)" }
                  }
                >
                  {CARD_KIND_LABEL[k]}
                </button>
              ))}
            </div>
            {cardKind === "picture" && (
              <div>
                <label className="mb-1 block text-xs font-bold">
                  画像URL（画像カードの主役です）
                </label>
                <input className={inputCls} style={inputStyle} value={cardImageUrl}
                  onChange={(e) => setCardImageUrl(e.target.value)} placeholder="https://..." />
                <p className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>
                  未設定のときは、テーマの背景にタイトルを表示します。
                </p>
              </div>
            )}
            <input className={inputCls} style={inputStyle} value={cardTitle} maxLength={80}
              onChange={(e) => setCardTitle(e.target.value)}
              placeholder={
                cardKind === "button"
                  ? "リンクのタイトル"
                  : cardKind === "picture"
                    ? "カードのタイトル"
                    : "見出し（任意）"
              } />
            {cardKind !== "button" && (
              <textarea className={inputCls} style={inputStyle} value={cardDescription} rows={3}
                maxLength={500}
                onChange={(e) => setCardDescription(e.target.value)}
                placeholder={cardKind === "picture" ? "説明（任意）" : "自己紹介などの文章"} />
            )}
            <div>
              {cardKind === "text" && (
                <label className="mb-1 block text-xs font-bold">URL（任意）</label>
              )}
              <input className={inputCls} style={inputStyle} value={cardUrl}
                onChange={(e) => setCardUrl(e.target.value)}
                placeholder={cardKind === "picture" ? "リンク先URL（任意）https://..." : "https://..."} />
            </div>
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

        <section className={sectionCls} style={sectionStyle}>
          <h2 className="text-sm font-bold">カードを飾る</h2>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
            スタンプを最大3つまで選んで、あなたのページに浮く飾りにできます。
            選んだ順に、右上・左下・右下へ配置されます。タップで選択／解除、
            上のプレビューで見え方を確認できます。
          </p>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {STAMPS.map((s) => {
              const order = decoSel.indexOf(s.src);
              const selected = order >= 0;
              const full = !selected && decoSel.length >= 3;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={busy || full}
                  onClick={() => toggleDeco(s.src)}
                  aria-pressed={selected}
                  aria-label={`${s.label}を${selected ? "外す" : "飾る"}`}
                  className="relative rounded-xl border p-1.5 disabled:opacity-40"
                  style={
                    selected
                      ? {
                          borderColor: "var(--accent)",
                          background: "var(--accent-soft)",
                        }
                      : { borderColor: "var(--line)", background: "var(--surface)" }
                  }
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.src} alt={s.label} className="mx-auto h-14 w-14 object-contain" />
                  <span className="mt-0.5 block truncate text-center text-[10px]">
                    {s.label}
                  </span>
                  {selected && (
                    <span
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                      style={{ background: "var(--accent)" }}
                    >
                      {order + 1}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px]" style={{ color: "var(--muted)" }}>
            {decoSel.length} / 3 選択中
            {decoSel.length >= 3 && "（いっぱいです。外すと別のスタンプを選べます）"}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={saveDecorations}
            className="mt-3 w-full rounded-full py-2.5 text-sm font-bold text-white disabled:opacity-50"
            style={{ background: "var(--accent)" }}
          >
            飾りを保存する
          </button>
        </section>

        <section className={sectionCls} style={sectionStyle}>
          <h2 className="text-sm font-bold">今日の気分</h2>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
            スタンプを1つ選ぶと、今日だけあなたのページの先頭に出ます。
            日付が変わると自動で出なくなります。飾り（ずっと置くもの）とは別のものです。
          </p>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {STAMPS.map((s) => {
              const selected = moodSel === s.src;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={busy}
                  onClick={() => toggleMood(s.src)}
                  aria-pressed={selected}
                  aria-label={`今日の気分に「${s.label}」を${selected ? "外す" : "選ぶ"}`}
                  className="relative rounded-xl border p-1.5 disabled:opacity-40"
                  style={
                    selected
                      ? {
                          borderColor: "var(--accent)",
                          background: "var(--accent-soft)",
                        }
                      : { borderColor: "var(--line)", background: "var(--surface)" }
                  }
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.src} alt={s.label} className="mx-auto h-14 w-14 object-contain" />
                  <span className="mt-0.5 block truncate text-center text-[10px]">
                    {s.label}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs font-bold">見せる範囲</p>
          <div className="mt-2 flex gap-2">
            {(
              [
                ["pub", "公開ページでも出す"],
                ["priv", "自分のホームだけ"],
              ] as [MoodVisibility, string][]
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                disabled={busy}
                onClick={() => setMoodVis(v)}
                aria-pressed={moodVis === v}
                className="flex-1 rounded-xl border px-3 py-2 text-sm disabled:opacity-50"
                style={
                  moodVis === v
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
            公開ページがオフのときは、「公開ページでも出す」を選んでも公開ページ自体は出ません。
          </p>
          {moodSavedDate && moodSavedDate !== localDateKey() && (
            <p className="mt-2 text-[11px]" style={{ color: "var(--muted)" }}>
              いま保存されているのは {moodSavedDate} の気分です。保存すると今日の気分になります。
            </p>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={saveMood}
            className="mt-3 w-full rounded-full py-2.5 text-sm font-bold text-white disabled:opacity-50"
            style={{ background: "var(--accent)" }}
          >
            {moodSel ? "気分を保存する" : "気分を外して保存する"}
          </button>
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

        {!me.is_guest && !me.is_operator && (
        <section className={sectionCls} style={sectionStyle}>
          <h2 className="text-sm font-bold">招待リンク</h2>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
            招待リンクの作成と管理は、紹介ページに移りました。
          </p>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
            <Link href="/invite" className="underline underline-offset-2">
              紹介ページを開く
            </Link>
          </p>
        </section>
        )}

        {me.is_operator && (
        <section className={sectionCls} style={sectionStyle}>
          <h2 className="text-sm font-bold">2人を繋ぐ招待</h2>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
            あなたが2人を繋ぐ「橋渡し」の招待です。リンクが2本できるので、2人に1本ずつ渡してください。
            両方が開くと、その2人の繋がりが始まります。あなた自身は繋がりには入りません。
            運営アカウントは制限なく作れます。
            あなた自身が相手になる招待（運営用招待）は紹介ページで作ります。
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
          {sets.filter((st) => !st.direct).length > 0 && (
            <ul className="mt-4 space-y-3">
              {sets.filter((st) => !st.direct).map((st) => {
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
