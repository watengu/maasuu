// 紹介セットのジャンル（rule 17: 固定リストから1つ。自由記述なし）
import type { Genre } from "./types";

export const GENRE_OPTIONS: { key: Genre; label: string }[] = [
  { key: "beauty", label: "美容・コーデ" },
  { key: "game", label: "ゲーム" },
  { key: "oshi", label: "推し活" },
  { key: "work", label: "仕事・副業" },
  { key: "love_talk", label: "恋愛相談" },
  { key: "chat", label: "雑談" },
];

export const GENRE_LABELS: Record<Genre, string> = Object.fromEntries(
  GENRE_OPTIONS.map((g) => [g.key, g.label]),
) as Record<Genre, string>;

export function genreLabel(genre: Genre | null | undefined): string {
  if (!genre) return "";
  return GENRE_LABELS[genre] ?? "";
}
