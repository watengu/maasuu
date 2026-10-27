"use client";

// 紹介ランディング（/i/[code]）: 紹介は「2本で1セット」（rule 16）。
// このリンクはセットの片方。参加（claim）してもすぐには繋がらず、
// もう片方のリンクが別の人に開かれた瞬間に、その2人の繋がりが連動スタートする。
// 紹介者はブリッジ役で、繋がりの当事者にはならない。
// スロットの確保と接続の作成は claim_intro_slot RPC が原子的に行う。
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getSession, setPendingPath, signInWithGoogle, type Session } from "../../auth-client";
import BannedScreen from "../../banned-screen";
import { genreLabel } from "../../../lib/genres";
import { rpc, selectOne } from "../../../lib/supabase";
import type { ClaimResult, Genre, IntroPreview, Profile } from "../../../lib/types";

type Phase =
  | { kind: "loading" }
  | { kind: "needLogin" }
  | { kind: "needProfile" }
  | { kind: "banned" }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      session: Session;
      me: Profile;
      preview: IntroPreview;
    }
  | {
      kind: "waiting";
      genre: Genre;
      introducerName: string;
    };

const CLAIM_ERRORS: Record<string, string> = {
  not_found: "この紹介リンクは見つかりませんでした。",
  own_set:
    "これはあなたが作った紹介セットのリンクです。紹介者は橋渡し役なので、自分では参加できません。",
  already_claimed_other:
    "あなたはもう片方のリンクで参加済みです。1つの紹介で2人分は占められません。",
  slot_taken: "このリンクはすでに他の人が使っています。",
  pair_finished:
    "その相手との繋がりはすでに終わっています。同じ相手とは再接続できません。",
  banned: "このアカウントは停止されています。",
  not_authenticated: "ログインが必要です。",
};

export default function IntroClient() {
  const params = useParams<{ code: string }>();
  const code = params.code;
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const claim = useCallback(async (): Promise<ClaimResult> => {
    return rpc<ClaimResult>("claim_intro_slot", { p_code: code });
  }, [code]);

  const applyClaim = useCallback(
    (res: ClaimResult, introducerName: string): boolean => {
      if (res.status === "connected") {
        router.push(`/c/${res.connection_id}`);
        return true;
      }
      if (res.status === "waiting") {
        setPhase({ kind: "waiting", genre: res.genre, introducerName });
        return true;
      }
      setErrorMsg(CLAIM_ERRORS[res.reason] ?? "参加できませんでした。");
      return false;
    },
    [router],
  );

  const load = useCallback(async () => {
    const session = await getSession();
    if (!session) {
      setPhase({ kind: "needLogin" });
      return;
    }
    const me = await selectOne<Profile>(`profiles?id=eq.${session.userId}&select=*`);
    if (!me) {
      setPhase({ kind: "needProfile" });
      return;
    }
    if (me.banned) {
      setPhase({ kind: "banned" });
      return;
    }
    const preview = await rpc<IntroPreview>("intro_preview", { p_code: code });
    if (!preview.found) {
      setPhase({ kind: "error", message: "この紹介リンクは見つかりませんでした。" });
      return;
    }
    setPhase({ kind: "ready", session, me, preview });
  }, [code]);

  useEffect(() => {
    // セッションは localStorage 保持のため、初回取得は effect から開始する（SSR では取得不可）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((e) => {
      console.error(e);
      setPhase({ kind: "error", message: "読み込みに失敗しました。" });
    });
  }, [load]);

  // 待機中は定期的に claim を再確認する（冪等）。相手が参加したら接続へ進む。
  useEffect(() => {
    if (phase.kind !== "waiting") return;
    const t = setInterval(() => {
      claim()
        .then((res) => {
          if (phaseRef.current.kind === "waiting") {
            applyClaim(res, phaseRef.current.introducerName);
          }
        })
        .catch(() => undefined);
    }, 5_000);
    return () => clearInterval(t);
  }, [phase.kind, claim, applyClaim]);

  const join = async () => {
    if (phase.kind !== "ready") return;
    setBusy(true);
    setErrorMsg("");
    try {
      const res = await claim();
      applyClaim(res, phase.preview.introducer?.display_name ?? "");
    } catch (e) {
      console.error(e);
      setErrorMsg("参加できませんでした。時間をおいてもう一度お試しください。");
    } finally {
      setBusy(false);
    }
  };

  if (phase.kind === "loading") {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-24 text-center">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          読み込んでいます…
        </p>
      </main>
    );
  }
  if (phase.kind === "banned") return <BannedScreen />;

  if (phase.kind === "needLogin") {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-16 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/stamps/stamp-07.png" alt="まぁ＆すぅ" className="mx-auto w-32" />
        <h1 className="mt-2 text-2xl font-bold" style={{ color: "var(--accent-strong)" }}>
          マァスゥへの紹介
        </h1>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
          紹介が届いています。参加するにはログインが必要です。
        </p>
        <button
          type="button"
          onClick={() => {
            setPendingPath(`/i/${code}`);
            signInWithGoogle();
          }}
          className="mt-6 w-full rounded-full py-3 text-sm font-bold text-white"
          style={{ background: "var(--accent)" }}
        >
          Googleでログインして参加する
        </button>
      </main>
    );
  }

  if (phase.kind === "needProfile") {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-bold">あと少しで参加できます</h1>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
          先にプロフィールを作成してください。作成後にこの紹介へ戻ってこられます。
        </p>
        <button
          type="button"
          onClick={() => {
            setPendingPath(`/i/${code}`);
            window.location.replace("/");
          }}
          className="mt-6 w-full rounded-full py-3 text-sm font-bold text-white"
          style={{ background: "var(--accent)" }}
        >
          プロフィールを作る
        </button>
      </main>
    );
  }

  if (phase.kind === "error") {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-24 text-center">
        <p className="text-sm">{phase.message}</p>
        <p className="mt-4 text-xs">
          <Link href="/" className="underline">
            ホームへ戻る
          </Link>
        </p>
      </main>
    );
  }

  if (phase.kind === "waiting") {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-12">
        <div
          className="rounded-2xl border p-6 text-center"
          style={{ borderColor: "var(--line)", background: "var(--surface)" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/stamps/stamp-08.png" alt="まぁ＆すぅ" className="mx-auto w-24" />
          <h1 className="mt-3 text-lg font-bold">参加を受け付けました</h1>
          {phase.genre && (
            <p className="mt-2">
              <span
                className="rounded-full px-3 py-1 text-xs font-bold"
                style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
              >
                テーマ：{genreLabel(phase.genre)}
              </span>
            </p>
          )}
          <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
            もう片方のリンクが開かれるのを待っています。
            <br />
            相手が参加した瞬間に、2人の繋がりが始まります（連動スタート）。
            <br />
            始まったら、ホームの「あなたの繋がり」に現れます。
          </p>
          {phase.introducerName && (
            <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
              紹介者：{phase.introducerName} さん（繋がりには入りません）
            </p>
          )}
          <p className="mt-4 animate-pulse text-xs" style={{ color: "var(--accent-strong)" }}>
            相手の参加を確認しています…
          </p>
          <Link
            href="/"
            className="mt-5 block rounded-full border py-2.5 text-sm font-bold"
            style={{ borderColor: "var(--accent)", color: "var(--accent-strong)" }}
          >
            ホームへ戻る
          </Link>
        </div>
      </main>
    );
  }

  const { preview } = phase;
  const introducer = preview.introducer;
  const genre = preview.genre;

  return (
    <main className="mx-auto w-full max-w-md px-4 py-12">
      <div
        className="rounded-2xl border p-6 text-center"
        style={{ borderColor: "var(--line)", background: "var(--surface)" }}
      >
        {introducer?.icon_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={introducer.icon_url}
            alt=""
            className="mx-auto h-20 w-20 rounded-full object-cover"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/stamps/stamp-08.png" alt="まぁ＆すぅ" className="mx-auto w-24" />
        )}
        <h1 className="mt-3 text-lg font-bold">
          {introducer?.display_name ? `${introducer.display_name} さんからの紹介` : "紹介が届いています"}
        </h1>
        {introducer?.status_line && (
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            {introducer.status_line}
          </p>
        )}
        {genre && (
          <p className="mt-3">
            <span
              className="rounded-full px-3 py-1 text-xs font-bold"
              style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
            >
              テーマ：{genreLabel(genre)}
            </span>
          </p>
        )}
        <div
          className="mt-4 space-y-1 text-left text-xs leading-relaxed"
          style={{ color: "var(--muted)" }}
        >
          <p>・この紹介は「リンク2本で1セット」です。あなたが参加し、もう1人がもう片方のリンクで参加すると、その2人の繋がりが始まります。</p>
          <p>・紹介した人は橋渡し役で、繋がりには入りません。</p>
          <p>・繋がりは2人同時にスタートします。初日はスタンプだけ。テキストは双方の許可がそろうと、翌日から使えます。</p>
          <p>・期限は3日または7日（組み合わせで決まります）。期限までに往復のやりとりが足りないと、繋がりは消えます。</p>
          <p>・メッセージは24時間で見えなくなります。</p>
        </div>
        {preview.slot_taken && (
          <p className="mt-3 text-xs" style={{ color: "var(--accent-strong)" }}>
            ※ このリンクは使用済みと表示されています。あなた本人の参加なら、そのまま進めます。
          </p>
        )}
        {errorMsg && (
          <p className="mt-3 text-xs" style={{ color: "var(--accent-strong)" }}>
            {errorMsg}
          </p>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={join}
          className="mt-5 w-full rounded-full py-3 text-sm font-bold text-white disabled:opacity-50"
          style={{ background: "var(--accent)" }}
        >
          {busy ? "受け付けています…" : "この紹介で参加する"}
        </button>
        <Link
          href="/"
          className="mt-3 block text-xs underline underline-offset-2"
          style={{ color: "var(--muted)" }}
        >
          今はやめておく
        </Link>
      </div>
    </main>
  );
}
