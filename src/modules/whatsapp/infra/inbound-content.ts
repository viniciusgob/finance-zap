import { getContentType, normalizeMessageContent, type proto } from '@whiskeysockets/baileys';

/** Eventos que chegam como mensagem mas não são conteúdo do usuário (comuns em grupos). */
const IGNORED_CONTENT_TYPES = new Set([
  'protocolMessage',
  'reactionMessage',
  'pollUpdateMessage',
  'keepInChatMessage',
  'pinInChatMessage',
  'encReactionMessage',
  'senderKeyDistributionMessage',
]);

export interface InboundContent {
  contentType: string;
  text: string | null;
  mime: string | undefined;
}

/**
 * Extrai tipo, texto e mimetype, desembrulhando mensagens temporárias / visualização única.
 * `null` = evento sem conteúdo do usuário (reação, edição, protocolo…), que deve ser ignorado.
 */
export function extractInboundContent(
  message: proto.IMessage | null | undefined,
): InboundContent | null {
  const content = normalizeMessageContent(message);
  if (!content) return null;
  const contentType = getContentType(content);
  if (!contentType || IGNORED_CONTENT_TYPES.has(contentType)) return null;

  const rawText =
    content.conversation ??
    content.extendedTextMessage?.text ??
    content.imageMessage?.caption ??
    content.videoMessage?.caption ??
    content.documentMessage?.caption ??
    null;

  const mime =
    content.imageMessage?.mimetype ??
    content.audioMessage?.mimetype ??
    content.documentMessage?.mimetype ??
    content.videoMessage?.mimetype ??
    undefined;

  return { contentType, text: rawText === null ? null : stripMentions(rawText), mime };
}

/** Remove menções (`@5511999999999`, `@123456789012345`) para o número não virar valor. */
export function stripMentions(text: string): string {
  return text
    .replace(/(^|\s)@\d{5,}\b/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}
