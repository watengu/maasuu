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
  /** 運営アカウント（発行した紹介セットに「ログインなし窓口」が出る） */
  is_operator: boolean;
  /** 匿名サインインで入ったゲスト（紹介セットの発行はできない） */
  is_guest: boolean;
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
  /** true = ダイレクト招待（紹介者自身が当事者Aとして着席済み）。false = 従来の橋渡し型 */
  direct: boolean;
  /** 送り先メモ（任意。発行した本人の一覧でのみ使う。migration-intro-note.sql） */
  note: string | null;
  /** 取り消し（失効）の時刻。null なら有効 */
  voided_at: string | null;
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
  /** 運営発行のセットかどうか（true なら未ログインでも窓口から入れる） */
  guest_ok?: boolean;
  /** true = ダイレクト招待（紹介者本人が当事者として待っている） */
  direct?: boolean;
  /** セットの有効状態。voided=取り消し済み、expired=72時間経過（運営セット・両方未参加） */
  availability?: "ok" | "voided" | "expired";
  introducer?: {
    display_name: string;
    icon_url: string | null;
    status_line: string;
  } | null;
};

/** grant_invite_entitlement RPC の戻り値（登録ゲートの資格付与。invite-gate-migration.sql） */
export type GrantEntitlementResult =
  | { status: "ok" }
  | { status: "error"; reason: string };

/** active=進行中 / gone=期限切れで終了 / ended=当事者が「繋がりを切る」で終了（migration-ended-state.sql） */
export type ConnectionState = "active" | "gone" | "ended";

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

/** Web Push 購読（migration-push.sql。本人の行だけ読み書き可） */
export type PushSubscription = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
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
  /** 既読時刻（相手が接続画面を開いて取得した時点で立つ。migration-read-at.sql） */
  read_at: string | null;
};
