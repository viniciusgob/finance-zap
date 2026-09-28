import { describe, expect, it } from 'vitest';
import {
  extractInboundContent,
  stripMentions,
} from '../src/modules/whatsapp/infra/inbound-content.js';
import {
  accountKeyFromWaChatJid,
  isGroupJid,
  isUnsupportedChatJid,
} from '../src/shared/utils/whatsapp-jid.js';

describe('conta de grupo', () => {
  it('grupo vira conta compartilhada separada das pessoais', () => {
    expect(accountKeyFromWaChatJid('120363042871234567@g.us')).toBe('group:120363042871234567');
    expect(accountKeyFromWaChatJid('5511999999999@s.whatsapp.net')).toBe('5511999999999');
    expect(accountKeyFromWaChatJid('6704561397894@lid')).toBe('lid:6704561397894');
    expect(isGroupJid('120363042871234567@g.us')).toBe(true);
    expect(isGroupJid('5511999999999@s.whatsapp.net')).toBe(false);
  });

  it('ignora status, transmissões e canais', () => {
    expect(isUnsupportedChatJid('status@broadcast')).toBe(true);
    expect(isUnsupportedChatJid('1234@newsletter')).toBe(true);
    expect(isUnsupportedChatJid('120363042871234567@g.us')).toBe(false);
  });
});

describe('extractInboundContent', () => {
  it('texto simples e com menção', () => {
    expect(extractInboundContent({ conversation: 'uber 20' })).toMatchObject({
      contentType: 'conversation',
      text: 'uber 20',
    });
    expect(
      extractInboundContent({
        extendedTextMessage: {
          text: '@12395224018 uber 20',
          contextInfo: { mentionedJid: ['12395224018@s.whatsapp.net'] },
        },
      })?.text,
    ).toBe('uber 20');
  });

  it('desembrulha mensagem temporária de grupo', () => {
    expect(
      extractInboundContent({
        ephemeralMessage: { message: { extendedTextMessage: { text: 'mercado 50' } } },
      }),
    ).toMatchObject({ contentType: 'extendedTextMessage', text: 'mercado 50' });
  });

  it('texto junto com distribuição de chave do grupo', () => {
    expect(
      extractInboundContent({
        senderKeyDistributionMessage: { groupId: 'g' },
        conversation: 'resumo',
      })?.text,
    ).toBe('resumo');
  });

  it('ignora reações, edições e protocolo', () => {
    expect(extractInboundContent({ reactionMessage: { text: '👍' } })).toBeNull();
    expect(extractInboundContent({ protocolMessage: { type: 0 } })).toBeNull();
    expect(extractInboundContent({ senderKeyDistributionMessage: { groupId: 'g' } })).toBeNull();
    expect(extractInboundContent(null)).toBeNull();
  });

  it('mídia mantém mimetype e legenda', () => {
    expect(
      extractInboundContent({ imageMessage: { mimetype: 'image/jpeg', caption: 'cupom' } }),
    ).toMatchObject({ contentType: 'imageMessage', mime: 'image/jpeg', text: 'cupom' });
    expect(
      extractInboundContent({ audioMessage: { mimetype: 'audio/ogg; codecs=opus' } }),
    ).toMatchObject({ contentType: 'audioMessage', text: null });
  });
});

describe('stripMentions', () => {
  it('remove só menções, mantendo valores', () => {
    expect(stripMentions('@5511999999999 gastei 45,90 no mercado')).toBe('gastei 45,90 no mercado');
    expect(stripMentions('uber 20 @123456789012345')).toBe('uber 20');
    expect(stripMentions('email@1234 não')).toBe('email@1234 não');
  });
});
