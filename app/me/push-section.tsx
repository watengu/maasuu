"use client";

// 設定画面の「通知」セクション（Web Push。2026-10-29 追加）。
// Service Worker の登録はこのセクションのマウント時に行う（scope /）。
// 購読フロー: Edge Function push-config から VAPID 公開鍵を取得 →
// pushManager.subscribe → push_subscriptions に endpoint をキーに upsert。
// 送信は Edge Function push-notify が担当する（トーク画面の送信後に呼ばれる）。
// iPhone はホーム画面に追加したアプリから開いたときだけ Push が使えるため、
// 未追加のときは手順を表示して止める。
import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "../auth-client";
import {
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  deleteRows,
  rest,
} from "../../lib/supabase";

type PushState =
  | { kind: "loading" }
  | { kind: "unsupported" }
  | { kind: "needInstall" }
  | { kind: "off" }
  | { kind: "denied" }
  | { kind: "on" };

function isIosLike(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return true;
  // iPadOS は Macintosh を名乗ることがあるためタッチ対応で補う
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  return (
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export default function PushSection({ session }: { session: Session }) {
  const [state, setState] = useState<PushState>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const regRef = useRef<ServiceWorkerRegistration | null>(null);

  const refresh = useCallback(async () => {
    // iOS はホーム画面に追加した状態でなければ Push を使えない（案内を優先表示）
    if (isIosLike() && !isStandalone()) {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("/sw.js").catch(() => undefined);
      }
      setState({ kind: "needInstall" });
      return;
    }
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setState({ kind: "unsupported" });
      return;
    }
    const reg = await navigator.serviceWorker
      .register("/sw.js")
      .catch(() => null);
    if (!reg) {
      setState({ kind: "unsupported" });
      return;
    }
    regRef.current = reg;
    const sub = await reg.pushManager.getSubscription().catch(() => null);
    if (sub) {
      setState({ kind: "on" });
      return;
    }
    if (Notification.permission === "denied") {
      setState({ kind: "denied" });
      return;
    }
    setState({ kind: "off" });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().catch(() => setState({ kind: "unsupported" }));
  }, [refresh]);

  const enable = async () => {
    setBusy(true);
    setNote("");
    try {
      const perm = await Notification.requestPermission();
      if (perm === "denied") {
        setState({ kind: "denied" });
        return;
      }
      if (perm !== "granted") {
        setState({ kind: "off" });
        return;
      }
      if (isIosLike() && !isStandalone()) {
        setState({ kind: "needInstall" });
        return;
      }
      const reg =
        regRef.current ?? (await navigator.serviceWorker.register("/sw.js"));
      regRef.current = reg;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/push-config`, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: "Bearer " + session.accessToken,
        },
      });
      if (!res.ok) throw new Error(`push-config ${res.status}`);
      const json = (await res.json()) as { publicKey?: string };
      if (!json.publicKey) throw new Error("push-config: no publicKey");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(json.publicKey) as BufferSource,
      });
      const subJson = sub.toJSON();
      const keys = subJson.keys ?? {};
      await rest("push_subscriptions", {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=representation",
        body: {
          user_id: session.userId,
          endpoint: sub.endpoint,
          p256dh: keys.p256dh ?? "",
          auth: keys.auth ?? "",
          user_agent: navigator.userAgent,
          updated_at: new Date().toISOString(),
        },
      });
      setState({ kind: "on" });
    } catch (e) {
      console.error(e);
      setNote("通知をオンにできませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setNote("");
    try {
      const reg =
        regRef.current ??
        (await navigator.serviceWorker.getRegistration("/").catch(() => undefined));
      const sub = reg
        ? await reg.pushManager.getSubscription().catch(() => null)
        : null;
      if (sub) {
        await deleteRows(
          "push_subscriptions",
          `endpoint=eq.${encodeURIComponent(sub.endpoint)}`,
        ).catch(() => undefined);
        await sub.unsubscribe().catch(() => undefined);
      }
      setState(
        isIosLike() && !isStandalone() ? { kind: "needInstall" } : { kind: "off" },
      );
    } catch (e) {
      console.error(e);
      setNote("通知をオフにできませんでした。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="rounded-2xl border p-5"
      style={{ borderColor: "var(--line)", background: "var(--surface)" }}
    >
      <h2 className="text-sm font-bold">通知</h2>
      <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
        繋がっている相手からメッセージが届いたときに、この端末へ通知します。
      </p>
      {note && (
        <p
          className="mt-3 rounded-xl border px-3 py-2 text-center text-xs"
          style={{ borderColor: "var(--line)", background: "var(--surface)" }}
        >
          {note}
        </p>
      )}
      <div className="mt-3">
        {state.kind === "loading" && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            読み込んでいます…
          </p>
        )}
        {state.kind === "unsupported" && (
          <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
            この端末・ブラウザでは通知に対応していません。
          </p>
        )}
        {state.kind === "needInstall" && (
          <p className="text-sm leading-relaxed">
            iPhone では、ホーム画面に追加してからオンにできます。
            ブラウザの共有ボタンから「ホーム画面に追加」して、追加したアイコンから
            マァスゥを開き直し、この画面でオンにしてください。
          </p>
        )}
        {state.kind === "denied" && (
          <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
            通知がブロックされています。端末の設定（ブラウザ／アプリの通知許可）から
            許可してください。
          </p>
        )}
        {state.kind === "off" && (
          <button
            type="button"
            disabled={busy}
            onClick={enable}
            className="w-full rounded-full py-2.5 text-sm font-bold text-white disabled:opacity-50"
            style={{ background: "var(--accent)" }}
          >
            通知をオンにする
          </button>
        )}
        {state.kind === "on" && (
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold">通知：オン（この端末に届きます）</span>
            <button
              type="button"
              disabled={busy}
              onClick={disable}
              className="rounded-full border px-4 py-1.5 text-xs font-bold disabled:opacity-50"
              style={{
                borderColor: "var(--accent)",
                background: "var(--surface)",
                color: "var(--accent-strong)",
              }}
            >
              オフにする
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
