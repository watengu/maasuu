"use client";

// スライドシェル（トップ画面）: 友人一覧 ⇔ ホーム の2パネルを横スライドで切り替える。
// セッション解決とデータ取得はシェルで1回だけ行い、両パネルへ props で配る
// （セッション確認の集約）。パネルは両方ともマウントしたままにし、スライドしても
// 状態は保持される。各パネルはデータが届くまでスケルトンを表示する。
// 切替は下部タブバー（つながり／ホーム）のタップが主で、スワイプ（ポインタの横
// ドラッグ＋スナップ）も併設する。上部セグメントは廃止し、ナビは下部タブに一本化
// （Ao 指示 2026-10-29: 上下で名前が揃っていなかったため）。
// 縦スクロールとは touch-action: pan-y と縦方向の動き優先の判定で喧嘩させない。
import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import {
  getSession,
  signOut,
  takePendingPath,
  type Session,
} from "./auth-client";
import LandingScreen from "./landing";
import BannedScreen from "./banned-screen";
import ProfileCreateForm from "./profile-create-form";
import FriendsPanel, { type ConnView } from "./friends-panel";
import HomePanel from "./home-panel";
import { judgeConnection, rulesFor, type TurnCount } from "../lib/engine";
import { rpc, selectOne, selectRows, updateRows } from "../lib/supabase";
import type { Connection, Profile, ProfileCard } from "../lib/types";

type Phase =
  // 初期描画（セッション未確認）。全員まず入口ページを描くことで、サーバー
  // HTML にも表紙が乗り、未ログインの人に「読み込んでいます…」を見せない。
  // セッションがある人だけ effect 側で loading に進める（表紙は一瞬の
  // スプラッシュとして見えるだけ）。
  | { kind: "splash" }
  | { kind: "loading" }
  | { kind: "loggedOut" }
  | { kind: "needProfile"; session: Session }
  | { kind: "needInvite" }
  | { kind: "banned" }
  | { kind: "ready"; session: Session; me: Profile };

// 下部タブバーのラベル（タップ切替が主、スワイプは補助。Ao 決定 2026-10-29）
const TAB_LABELS = ["つながり", "ホーム"] as const;

export default function ShellClient() {
  const [phase, setPhase] = useState<Phase>({ kind: "splash" });
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [views, setViews] = useState<ConnView[] | null>(null);
  const [cards, setCards] = useState<ProfileCard[] | null>(null);
  const [panel, setPanel] = useState(0);
  const [dragDx, setDragDx] = useState<number | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await getSession();
      if (cancelled) return;
      if (!session) {
        setPhase({ kind: "loggedOut" });
        return;
      }
      // セッションがある人だけ、ここから従来の読み込み表示に進める。
      setPhase({ kind: "loading" });
      const pending = takePendingPath();
      if (pending) setPendingPath(pending);
      // 自分のカードは他の取得と独立なので、ホームパネル用に並行して先行取得する。
      // 失敗してもシェル全体は落とさず、カードなしとして表示する。
      selectRows<ProfileCard>(
        `profile_cards?user_id=eq.${session.userId}&order=sort.asc,id.asc&select=*`,
      )
        .catch(() => [] as ProfileCard[])
        .then((cs) => {
          if (!cancelled) setCards(cs);
        });
      try {
        // プロフィールと繋がり一覧は互いに独立（どちらも userId のみに依存）なので並列取得する。
        // 元の逐次版の結果を変えないため allSettled を使う: 未作成/バンの判定は繋がり取得の
        // 成否に影響されず、プロフィール取得の失敗と（プロフィール正常時の）繋がり取得の
        // 失敗は、元の通り全体の catch へ投げる。
        const [meRes, connsRes] = await Promise.allSettled([
          selectOne<Profile>(`profiles?id=eq.${session.userId}&select=*`),
          selectRows<Connection>(
            `connections?or=(user_a.eq.${session.userId},user_b.eq.${session.userId})&order=created_at.desc&select=*`,
          ),
        ]);
        if (cancelled) return;
        if (meRes.status === "rejected") throw meRes.reason;
        const me = meRes.value;
        if (!me) {
          // 登録ゲート（2026-10-29）: 紹介リンク経由で登録資格（entitlement）が
          // 付いた人だけプロフィール作成フォームに進める。資格がなければ
          // 「紹介が必要です」画面を出す。RPC 自体が例外（関数未作成など）の
          // 移行期は、安全策として従来どおりフォームを出す。
          let entitled = true;
          try {
            entitled = await rpc<boolean>("has_invite_entitlement", {});
          } catch {
            entitled = true;
          }
          if (cancelled) return;
          setPhase(
            entitled ? { kind: "needProfile", session } : { kind: "needInvite" },
          );
          return;
        }
        if (me.banned) {
          setPhase({ kind: "banned" });
          return;
        }
        // プロフィールが確定した時点でシェルを描く（各パネルはデータ到着までスケルトン）。
        setPhase({ kind: "ready", session, me });
        if (connsRes.status === "rejected") throw connsRes.reason;
        const conns = connsRes.value;
        const relatedIds = Array.from(
          new Set(
            conns.flatMap((c) => [
              c.user_a === session.userId ? c.user_b : c.user_a,
              ...(c.introducer_id ? [c.introducer_id] : []),
            ]),
          ),
        );
        const related =
          relatedIds.length > 0
            ? await selectRows<Profile>(`profiles?id=in.(${relatedIds.join(",")})&select=*`)
            : [];
        const profileById = new Map(related.map((p) => [p.id, p]));
        const built: ConnView[] = [];
        for (const c of conns) {
          const partner = profileById.get(
            c.user_a === session.userId ? c.user_b : c.user_a,
          ) ?? null;
          const introducer = c.introducer_id
            ? (profileById.get(c.introducer_id) ?? null)
            : null;
          let conn = c;
          if (c.state === "active") {
            const turns = await selectRows<TurnCount>(
              `turns?connection_id=eq.${c.id}&select=sender_id,created_at`,
            );
            const rules = rulesFor(me.gender, partner?.gender);
            const judged = judgeConnection(c, turns, rules);
            if (judged.changed) {
              conn = judged.connection;
              await updateRows("connections", `id=eq.${c.id}`, {
                deadline: conn.deadline,
                state: conn.state,
              }).catch(() => undefined);
            }
          }
          built.push({ conn, partner, introducer });
        }
        if (cancelled) return;
        setViews(built);
      } catch (e) {
        console.error(e);
        if (!cancelled) setPhase({ kind: "loggedOut" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 横ドラッグでパネルを追従させ、離した位置でスナップする。
  // リンクのクリックと競合しないよう、実際にドラッグした直後のクリックだけ抑止する。
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const start = { x: e.clientX, y: e.clientY, dx: 0, engaged: false, cancelled: false };
    const move = (ev: PointerEvent) => {
      if (start.cancelled) return;
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (!start.engaged) {
        // 縦方向の動きが勝ったらスクロールに譲る
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
          start.cancelled = true;
          setDragDx(null);
          return;
        }
        if (Math.abs(dx) < 8) return;
        start.engaged = true;
      }
      start.dx = dx;
      setDragDx(dx);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (start.engaged && !start.cancelled) {
        const w = viewportRef.current?.clientWidth ?? 320;
        const threshold = Math.max(48, w * 0.18);
        if (start.dx <= -threshold) setPanel(1);
        else if (start.dx >= threshold) setPanel(0);
        if (Math.abs(start.dx) > 10) suppressClickRef.current = true;
      }
      setDragDx(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const handleClickCapture = (e: React.SyntheticEvent) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      e.preventDefault();
      e.stopPropagation();
    }
  };

  if (phase.kind === "splash") {
    return <LandingScreen />;
  }

  if (phase.kind === "loading") {
    return (
      <main className="mx-auto w-full max-w-md">
        <p className="sr-only">読み込んでいます…</p>
        <FriendsSkeleton />
      </main>
    );
  }

  if (phase.kind === "loggedOut") {
    return <LandingScreen />;
  }

  if (phase.kind === "banned") {
    return <BannedScreen />;
  }

  if (phase.kind === "needInvite") {
    return <NeedInviteScreen />;
  }

  if (phase.kind === "needProfile") {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-10">
        <h1
          className="text-center text-2xl font-bold tracking-wide"
          style={{ color: "var(--accent-strong)" }}
        >
          マァスゥ
        </h1>
        <div className="mt-6">
          <ProfileCreateForm
            userId={phase.session.userId}
            onCreated={() => window.location.reload()}
          />
        </div>
      </main>
    );
  }

  const { session, me } = phase;
  // 端を越えたドラッグは軽く抵抗させる（はみ出し量を抑える）
  const shownDx =
    dragDx === null
      ? 0
      : panel === 0
        ? Math.max(-480, Math.min(24, dragDx))
        : Math.max(-24, Math.min(480, dragDx));
  const trackStyle: CSSProperties =
    dragDx === null
      ? {
          transform: `translateX(-${panel * 50}%)`,
          transition: "transform 280ms ease",
        }
      : {
          transform: `translateX(calc(-${panel * 50}% + ${shownDx}px))`,
          transition: "none",
        };

  const onLogout = async () => {
    await signOut();
    window.location.replace("/");
  };

  return (
    <div className="flex min-h-dvh flex-col overflow-x-clip">
      <header
        className="sticky top-0 z-10 border-b"
        style={{ background: "var(--bg)", borderColor: "var(--line)" }}
      >
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-3">
          <span
            className="text-lg font-bold tracking-wide"
            style={{ color: "var(--accent-strong)" }}
          >
            マァスゥ
          </span>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/me" className="underline-offset-2 hover:underline">
              設定
            </Link>
            <button
              type="button"
              onClick={onLogout}
              className="underline-offset-2 hover:underline"
              style={{ color: "var(--muted)" }}
            >
              ログアウト
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-md flex-1">
        <div
          ref={viewportRef}
          className="overflow-hidden"
          style={{ touchAction: "pan-y" }}
          onPointerDown={handlePointerDown}
          onClickCapture={handleClickCapture}
          onDragStart={(e) => e.preventDefault()}
        >
          {/* items-stretch: ホームパネルの全面背景（ProfilePageView）を
              パネル全高に広げるため（第4弾 2026-10-29） */}
          <div className="flex w-[200%] items-stretch" style={trackStyle}>
            <div className="w-1/2 shrink-0" inert={panel !== 0}>
              {views ? (
                <FriendsPanel
                  session={session}
                  me={me}
                  views={views}
                  pendingPath={pendingPath}
                />
              ) : (
                <FriendsSkeleton />
              )}
            </div>
            <div className="w-1/2 shrink-0" inert={panel !== 1}>
              {cards ? <HomePanel me={me} cards={cards} /> : <HomeSkeleton />}
            </div>
          </div>
        </div>
      </main>
      <nav
        className="sticky bottom-0 z-10 border-t"
        style={{ background: "var(--bg)", borderColor: "var(--line)" }}
        aria-label="画面切り替え"
      >
        <div className="mx-auto flex w-full max-w-md">
          {TAB_LABELS.map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => setPanel(i)}
              aria-pressed={panel === i}
              className="relative flex-1 py-3 text-center text-sm"
              style={
                panel === i
                  ? { color: "var(--accent-strong)", fontWeight: 700 }
                  : { color: "var(--muted)" }
              }
            >
              {panel === i && (
                <span
                  className="absolute inset-x-8 top-0 h-0.5 rounded-full"
                  style={{ background: "var(--accent)" }}
                />
              )}
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

function FriendsSkeleton() {
  return (
    <div className="px-4 py-5" aria-hidden="true">
      <div
        className="h-4 w-24 animate-pulse rounded"
        style={{ background: "var(--line)" }}
      />
      <div className="mt-3 space-y-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex animate-pulse items-center gap-3 rounded-2xl border p-4"
            style={{ borderColor: "var(--line)", background: "var(--surface)" }}
          >
            <span
              className="h-12 w-12 shrink-0 rounded-full"
              style={{ background: "var(--accent-soft)" }}
            />
            <span className="min-w-0 flex-1 space-y-2">
              <span
                className="block h-3 w-1/2 rounded"
                style={{ background: "var(--line)" }}
              />
              <span
                className="block h-3 w-2/3 rounded"
                style={{ background: "var(--line)" }}
              />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="animate-pulse px-4 py-6" aria-hidden="true">
      <div className="text-center">
        <span
          className="mx-auto block h-24 w-24 rounded-full"
          style={{ background: "var(--accent-soft)" }}
        />
        <span
          className="mx-auto mt-3 block h-4 w-32 rounded"
          style={{ background: "var(--line)" }}
        />
        <span
          className="mx-auto mt-2 block h-3 w-48 rounded"
          style={{ background: "var(--line)" }}
        />
      </div>
      <div className="mt-6 space-y-3">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="h-11 rounded-2xl border"
            style={{ borderColor: "var(--line)", background: "var(--surface)" }}
          />
        ))}
      </div>
    </div>
  );
}

// 登録ゲート: ログイン済みだが紹介リンク経由の登録資格がない人向けの画面。
// プロフィール作成フォームは出さない（資格がないと INSERT も RLS で拒否される）。
function NeedInviteScreen() {
  const onLogout = async () => {
    await signOut();
    window.location.replace("/");
  };
  return (
    <main className="mx-auto w-full max-w-md px-4 py-16 text-center">
      <h1
        className="text-2xl font-bold tracking-wide"
        style={{ color: "var(--accent-strong)" }}
      >
        マァスゥ
      </h1>
      <h2 className="mt-8 text-lg font-bold">紹介が必要です</h2>
      <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
        マァスゥは紹介制です。参加するには紹介リンクが必要です。
        <br />
        リンクをお持ちの場合は、そのリンクから開いてください。
      </p>
      <button
        type="button"
        onClick={onLogout}
        className="mt-8 w-full rounded-full border py-3 text-sm font-bold"
        style={{ borderColor: "var(--accent)", color: "var(--accent-strong)" }}
      >
        ログアウト
      </button>
    </main>
  );
}

