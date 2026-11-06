"use client";

// 共通の「もどる」導線（操作性修正 2026-11-06）: アプリ内の戻る系の導線は
// 全てこれに統一し、行き先を "/" に固定せず、ブラウザ履歴どおり
// 「直前に見ていたページ」へ戻る。履歴が無い（招待リンクなどから直接
// 着地した）場合は "/" へフォールバックする。
import { useRouter } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";

export default function BackButton({
  children = "← もどる",
  className,
  style,
  ariaLabel,
}: {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
}) {
  const router = useRouter();
  const onClick = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.replace("/");
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={className}
      style={style}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}
