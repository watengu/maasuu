"use client";

// リンクのコピー／共有／QR ボタン（Ao 指示 2026-10-28: コピペ機能と、送り先を選べる共有の両方）。
// 設定（/me）の公開ページURL・招待リンクと、友人一覧パネルの招待リンクで共有する。
import { useState } from "react";
import qrcodegen from "../lib/qrcodegen";

// URL から QR コードの SVG をこの端末内で生成する（外部サービスは使わない）。
function QrSvg({ url }: { url: string }) {
  let size = 0;
  let d = "";
  try {
    const qr = qrcodegen.QrCode.encodeText(url, qrcodegen.QrCode.Ecc.MEDIUM);
    size = qr.size;
    for (let y = 0; y < qr.size; y++) {
      for (let x = 0; x < qr.size; x++) {
        if (qr.getModule(x, y)) d += `M${x} ${y}h1v1H${x}z`;
      }
    }
  } catch {
    return null;
  }
  return (
    <svg
      width={180}
      height={180}
      viewBox={`-4 -4 ${size + 8} ${size + 8}`}
      className="mt-2 rounded-lg"
      style={{ background: "#fff" }}
      role="img"
      aria-label="QRコード"
    >
      <path d={d} fill="#000" />
    </svg>
  );
}

export default function LinkActions({ url }: { url: string }) {
  const [copyState, setCopyState] = useState<"idle" | "ok" | "fail">("idle");
  const [showQr, setShowQr] = useState(false);
  const copy = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    setCopyState(ok ? "ok" : "fail");
    window.setTimeout(() => setCopyState("idle"), 2000);
  };
  const share = async () => {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ url });
      } catch {
        // 共有をキャンセルした場合は何もしない
      }
    } else {
      await copy();
    }
  };
  const btnCls = "rounded-full border px-3 py-1 text-[11px] font-bold";
  const btnStyle = {
    borderColor: "var(--line)",
    background: "var(--surface)",
    color: "var(--accent-strong)",
  } as const;
  return (
    <>
      <span className="mt-1 flex gap-2">
        <button type="button" onClick={copy} className={btnCls} style={btnStyle}>
          {copyState === "ok"
            ? "コピー済み"
            : copyState === "fail"
              ? "コピーできませんでした"
              : "コピー"}
        </button>
        <button type="button" onClick={share} className={btnCls} style={btnStyle}>
          送る
        </button>
        <button
          type="button"
          onClick={() => setShowQr((v) => !v)}
          className={btnCls}
          style={btnStyle}
        >
          QR
        </button>
      </span>
      {showQr && <QrSvg url={url} />}
    </>
  );
}
