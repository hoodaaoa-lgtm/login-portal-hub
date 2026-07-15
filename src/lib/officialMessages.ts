import { Smartphone, Rocket, Lightbulb, type LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Tabelas ainda não estão no schema gerado (types.ts) — mesmo padrão usado
// em mensagens.tsx e BadgeContext.tsx para tabelas não tipadas.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type OfficialCategory = "INSTALL_APP" | "UPDATES" | "TIPS";
export type OfficialActionType = "install_pwa" | "open_page" | "open_link" | "none";
export type OfficialAudience = "all" | "new_users" | "not_installed";

/** Identidade visual fixa por categoria — o admin escolhe a categoria, o
 * ícone e o nome vêm sempre daqui, nunca são livres. */
export const OFFICIAL_CATEGORY_META: Record<OfficialCategory, { label: string; Icon: LucideIcon; color: string }> = {
  INSTALL_APP: { label: "Instalar App", Icon: Smartphone, color: "#9231EA" },
  UPDATES: { label: "Atualizações", Icon: Rocket, color: "#1FAFA6" },
  TIPS: { label: "Dicas da Snapper", Icon: Lightbulb, color: "#FFC93C" },
};

export interface OfficialMessage {
  id: string;
  category: OfficialCategory;
  title: string;
  description: string;
  image_url: string | null;
  button_text: string | null;
  action_type: OfficialActionType;
  action_value: string | null;
  created_at: string;
}

/** Uma mensagem oficial já combinada com o estado de receção do utilizador. */
export interface UserOfficialMessage {
  /** id da linha em user_official_messages — usar este para marcar lida/arquivar */
  id: string;
  message: OfficialMessage;
  is_read: boolean;
  archived: boolean;
  received_at: string;
  clicked_at: string | null;
}

/** Mensagens oficiais recebidas pelo utilizador atual, mais recentes primeiro. */
export async function fetchMyOfficialMessages(userId: string): Promise<UserOfficialMessage[]> {
  const { data, error } = await db
    .from("user_official_messages")
    .select("id,is_read,archived,received_at,clicked_at,official_messages(id,category,title,description,image_url,button_text,action_type,action_value,created_at)")
    .eq("user_id", userId)
    .eq("archived", false)
    .order("received_at", { ascending: false });
  if (error) {
    console.error("[official-messages] erro ao carregar:", error);
    return [];
  }
  return (data ?? [])
    .filter((row: any) => !!row.official_messages)
    .map((row: any) => ({
      id: row.id,
      message: row.official_messages,
      is_read: row.is_read,
      archived: row.archived,
      received_at: row.received_at,
      clicked_at: row.clicked_at,
    }));
}

export async function markOfficialMessageRead(userOfficialMessageId: string) {
  const { error } = await db
    .from("user_official_messages")
    .update({ is_read: true })
    .eq("id", userOfficialMessageId);
  if (error) console.error("[official-messages] erro ao marcar como lida:", error);
}

export async function markOfficialMessageClicked(userOfficialMessageId: string) {
  const { error } = await db
    .from("user_official_messages")
    .update({ clicked_at: new Date().toISOString() })
    .eq("id", userOfficialMessageId);
  if (error) console.error("[official-messages] erro ao registar clique:", error);
}

export async function archiveOfficialMessage(userOfficialMessageId: string) {
  const { error } = await db
    .from("user_official_messages")
    .update({ archived: true })
    .eq("id", userOfficialMessageId);
  if (error) console.error("[official-messages] erro ao arquivar:", error);
}

/** Total de mensagens oficiais não lidas do utilizador — usado no contador de badges. */
export async function countUnreadOfficialMessages(userId: string): Promise<number> {
  const { count, error } = await db
    .from("user_official_messages")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false)
    .eq("archived", false);
  if (error) {
    console.error("[official-messages] erro ao contar não lidas:", error);
    return 0;
  }
  return count || 0;
}

/** Admin: cria e envia a mensagem para o público escolhido, tudo numa transação. */
export async function sendOfficialMessage(input: {
  category: OfficialCategory;
  title: string;
  description: string;
  imageUrl: string | null;
  buttonText: string | null;
  actionType: OfficialActionType;
  actionValue: string | null;
  audience: OfficialAudience;
}): Promise<{ messageId: string; recipients: number }> {
  const { data, error } = await db.rpc("send_official_message", {
    p_category: input.category,
    p_title: input.title,
    p_description: input.description,
    p_image_url: input.imageUrl,
    p_button_text: input.buttonText,
    p_action_type: input.actionType,
    p_action_value: input.actionValue,
    p_audience: input.audience,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { messageId: row.message_id, recipients: row.recipients };
}

/** Admin: histórico de mensagens já enviadas, mais recentes primeiro. */
export async function fetchOfficialMessageHistory(): Promise<(OfficialMessage & { recipients: number })[]> {
  const { data, error } = await db
    .from("official_messages")
    .select("id,category,title,description,image_url,button_text,action_type,action_value,created_at,user_official_messages(count)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error("[official-messages] erro ao carregar histórico:", error);
    return [];
  }
  return (data ?? []).map((row: any) => ({
    ...row,
    recipients: row.user_official_messages?.[0]?.count ?? 0,
  }));
}
