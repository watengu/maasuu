"use client";

// ホーム: 未ログインならログイン画面、ログイン中なら「自分の繋がり一覧」。
// 各接続は開くたびに遅延評価（judgeConnection）で期限判定し、変われば DB に書き戻す。
import { useEffect, useState } from "react";
import Link from "next/link";
import { getSession, signInWithGoogle, takePendingPath, type Session } from "./auth-client";
import AppHeader from "./app-header";
import BannedScreen from "./banned-screen";
import ProfileCreateForm from "./profile-create-form";
import { judgeConnection, remainingMs, rulesFor, type TurnCount } from "../lib/engine";
import { formatRemaining } from "../lib/format";
import { genreLabel } from "../lib/genres";
import { selectOne, selectRows, updateRows } from "../lib/supabase";
import type { Connection, Profile } from "../lib/types";

type ConnView = { conn: Connection; partner: Profile | null; introducer: Profile | null };

type Phase =
  | { kind: "loading" }
  | { kind: "loggedOut" }
  | { kind: "needProfile"; session: Session }
  | { kind: "banned" }
  | { kind: "ready"; session: Session; me: Profile; views: ConnView[] };

export default function HomeClient() {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [, setTick] = useState(0);

  // 残り時間表示を定期的に進める
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await getSession();
      if (cancelled) return;
      if (!session) {
        setPhase({ kind: "loggedOut" });
        return;
      }
      const pending = takePendingPath();
      if (pending) setPendingPath(pending);
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
          setPhase({ kind: "needProfile", session });
          return;
        }
        if (me.banned) {
          setPhase({ kind: "banned" });
          return;
        }
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
        const views: ConnView[] = [];
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
          views.push({ conn, partner, introducer });
        }
        if (cancelled) return;
        setPhase({ kind: "ready", session, me, views });
      } catch (e) {
        console.error(e);
        if (!cancelled) setPhase({ kind: "loggedOut" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (phase.kind === "loading") {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-24 text-center">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          読み込んでいます…
        </p>
      </main>
    );
  }

  if (phase.kind === "loggedOut") {
    return <LoginScreen />;
  }

  if (phase.kind === "banned") {
    return <BannedScreen />;
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

  const { views } = phase;
  const now = new Date();
  const sorted = [...views].sort((x, y) => {
    if (x.conn.state !== y.conn.state) return x.conn.state === "active" ? -1 : 1;
    return (
      new Date(x.conn.deadline).getTime() - new Date(y.conn.deadline).getTime()
    );
  });

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-5">
        {pendingPath && (
          <Link
            href={pendingPath}
            className="mb-4 block rounded-2xl border px-4 py-3 text-sm font-bold"
            style={{
              borderColor: "var(--accent)",
              background: "var(--accent-soft)",
              color: "var(--accent-strong)",
            }}
          >
            紹介への参加が途中です。タップして続けてください →
          </Link>
        )}
        <h2 className="text-sm font-bold" style={{ color: "var(--muted)" }}>
          あなたの繋がり
        </h2>
        {sorted.length === 0 ? (
          <div
            className="mt-3 rounded-2xl border p-5 text-sm leading-relaxed"
            style={{ borderColor: "var(--line)", background: "var(--surface)" }}
          >
            <p>まだ繋がりがありません。</p>
            <p className="mt-2">
              マァスゥの繋がりは、紹介から生まれます。誰かを招待するときは
              <Link href="/me" className="font-bold underline underline-offset-2">
                プロフィール
              </Link>
              {phase.me.is_operator
                ? "から招待リンクや紹介セットを作って渡してください。"
                : "から招待リンクを作って、相手に渡してください（作成は3日に1回まで）。"}
            </p>
          </div>
        ) : (
          <ul className="mt-3 space-y-3">
            {sorted.map(({ conn, partner, introducer }) => {
              const gone = conn.state === "gone";
              return (
                <li key={conn.id}>
                  <Link
                    href={`/c/${conn.id}`}
                    className="flex items-center gap-3 rounded-2xl border p-4"
                    style={{
                      borderColor: "var(--line)",
                      background: "var(--surface)",
                      opacity: gone ? 0.55 : 1,
                    }}
                  >
                    {partner?.icon_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={partner.icon_url}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold"
                        style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
                      >
                        {(partner?.display_name ?? "?").slice(0, 1)}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">
                        {partner?.display_name ?? "相手"}
                      </span>
                      <span
                        className="block truncate text-xs"
                        style={{ color: "var(--muted)" }}
                      >
                        {partner?.status_line || " "}
                      </span>
                      {(conn.genre || introducer) && (
                        <span
                          className="mt-0.5 block truncate text-[11px]"
                          style={{ color: "var(--muted)" }}
                        >
                          {conn.genre && (
                            <span
                              className="mr-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                              style={{
                                background: "var(--accent-soft)",
                                color: "var(--accent-strong)",
                              }}
                            >
                              {genreLabel(conn.genre)}
                            </span>
                          )}
                          {introducer && `${introducer.display_name} さんの紹介`}
                        </span>
                      )}
                    </span>
                    <span
                      className="shrink-0 text-xs font-bold"
                      style={{ color: gone ? "var(--muted)" : "var(--accent-strong)" }}
                    >
                      {gone ? "終了" : formatRemaining(remainingMs(conn, now))}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-6 text-center text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
          繋がりには期限があります。期限までに往復のやりとりが足りないと、繋がりは消えます。
          <br />
          メッセージは送信から24時間で見えなくなります。
        </p>
      </main>
    </div>
  );
}

function LoginScreen() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-12">
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/stamps/stamp-07.png" alt="まぁ＆すぅ" className="mx-auto w-36" />
        <h1
          className="mt-2 text-3xl font-bold tracking-wide"
          style={{ color: "var(--accent-strong)" }}
        >
          マァスゥ
        </h1>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
          紹介制の、小さなSNS。
          <br />
          繋がった日から、期限との競争が始まります。
          <br />
          やりとりを続けないと、繋がりは消えてしまいます。
          <br />
          メッセージも24時間で消えるから、残らないぶんだけ軽く話せます。
        </p>
      </div>
      <button
        type="button"
        onClick={signInWithGoogle}
        className="mt-8 w-full rounded-full py-3 text-sm font-bold text-white"
        style={{ background: "var(--accent)" }}
      >
        Googleでログイン
      </button>
      <p className="mt-3 text-center text-xs" style={{ color: "var(--muted)" }}>
        繋がりは紹介から生まれます。検索機能はありません。
      </p>
      <footer className="mt-auto pt-10 text-center text-xs" style={{ color: "var(--muted)" }}>
        <Link href="/legal/terms" className="underline underline-offset-2">
          利用規約
        </Link>
        <span className="mx-2">・</span>
        <Link href="/legal/privacy" className="underline underline-offset-2">
          プライバシーポリシー
        </Link>
      </footer>
    </main>
  );
}
