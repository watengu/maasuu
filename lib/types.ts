// マァスゥ データ型（schema.sql のテーブル定義に対応）

export type Gender = "female" | "male" | "other";

export type Profile = {
  id: string;
  display_name: string;
  icon_url: string | null;
  status_line: string;
  gender: Gender | null;
  promo_on: boolean;
  promo_code: string | null;
  banned: boolean;
  created_at: string;
};

export type ProfileCard = {
  id: number;
  user_id: string;
  kind: "link" | "text";
  title: string;
  url: string | null;
  sort: number;
  created_at: string;
};

/** 紹介セットのジャンル（rule 17: 固定リストのみ） */
export type Genre = "beauty" | "game" | "oshi" | "work" | "love_talk" | "chat";

/** 紹介セット（rule 16: リンク2本で1セット。紹介者はブリッジ役） */
export type IntroSet = {
  id: string;
  introducer_id: string;
  code_a: string;
  code_b: string;
  joined_by_a: string | null;
  joined_by_b: string | null;
  genre: Genre;
  created_at: string;
};

/** claim_intro_slot RPC の戻り値 */
export type ClaimResult =
  | {
      status: "waiting";
      set_id: string;
      slot: "a" | "b";
      genre: Genre;
      introducer_id: string;
    }
  | { status: "connected"; connection_id: string; genre: Genre; existing?: boolean }
  | { status: "error"; reason: string };

/** intro_preview RPC の戻り値 */
export type IntroPreview = {
  found: boolean;
  genre?: Genre;
  slot?: "a" | "b";
  slot_taken?: boolean;
  both_filled?: boolean;
  introducer?: {
    display_name: string;
    icon_url: string | null;
    status_line: string;
  } | null;
};

export type ConnectionState = "active" | "gone";

export type Connection = {
  id: string;
  user_a: string;
  user_b: string;
  started_at: string;
  deadline: string;
  text_ok_a: boolean;
  text_ok_b: boolean;
  state: ConnectionState;
  /** 紹介経由の接続のみ。紹介者（ブリッジ役）のプロフィールID */
  introducer_id: string | null;
  /** 元になった紹介セット（重複作成防止の一意制約つき） */
  intro_set_id: string | null;
  /** 紹介セットから引き継いだジャンル（このペアのテーマ） */
  genre: Genre | null;
  created_at: string;
};

export type TurnKind = "stamp" | "text";

export type Turn = {
  id: number;
  connection_id: string;
  sender_id: string;
  kind: TurnKind;
  stamp_id: string | null;
  body: string | null;
  created_at: string;
  expires_at: string;
};
