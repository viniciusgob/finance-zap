export function accountKeyFromWaChatJid(waChatJid: string): string {
  const [userRaw, domain = ''] = waChatJid.split('@');
  const user = (userRaw.split(':')[0] ?? '').trim();
  if (domain === 's.whatsapp.net') {
    return user.replace(/\D/g, '');
  }
  if (domain === 'lid') {
    return `lid:${user}`;
  }
  if (domain === 'g.us') {
    // Grupo = conta compartilhada, separada das contas pessoais dos participantes.
    return `group:${user}`;
  }
  return user.replace(/\D/g, '') || waChatJid;
}

export function waChatJidFromDigits(digits: string): string {
  const d = digits.replace(/\D/g, '');
  return `${d}@s.whatsapp.net`;
}

export function isGroupJid(jid: string): boolean {
  return jid.endsWith('@g.us');
}

/** Status, listas de transmissão e canais não são conversas com o bot. */
export function isUnsupportedChatJid(jid: string): boolean {
  return jid === 'status@broadcast' || jid.endsWith('@broadcast') || jid.endsWith('@newsletter');
}
