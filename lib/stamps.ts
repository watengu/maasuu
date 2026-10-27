// 内蔵スタンプ（まぁ＆すぅ セット。素材は LINE スタンプ制作ラインと同一）
export type Stamp = { id: string; src: string; label: string };

export const STAMPS: Stamp[] = [
  { id: "stamp-01", src: "/stamps/stamp-01.png", label: "強い言葉はつかわないで" },
  { id: "stamp-02", src: "/stamps/stamp-02.png", label: "やるじゃん" },
  { id: "stamp-03", src: "/stamps/stamp-03.png", label: "ぷい・ウケる" },
  { id: "stamp-04", src: "/stamps/stamp-04.png", label: "であるかっ" },
  { id: "stamp-05", src: "/stamps/stamp-05.png", label: "キリッ" },
  { id: "stamp-06", src: "/stamps/stamp-06.png", label: "だが断る" },
  { id: "stamp-07", src: "/stamps/stamp-07.png", label: "おはよう" },
  { id: "stamp-08", src: "/stamps/stamp-08.png", label: "ねぇねぇ" },
  { id: "stamp-09", src: "/stamps/stamp-09.png", label: "ウマッ" },
];

export function stampSrc(id: string | null): string | null {
  if (!id) return null;
  const s = STAMPS.find((x) => x.id === id);
  return s ? s.src : null;
}
