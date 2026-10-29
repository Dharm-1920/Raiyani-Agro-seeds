const { normalizePhone, publicOrigin } = require('./identity');
const { WhatsAppPreference } = require('../models');

const selected = () => process.env.WHATSAPP_PROVIDER === 'meta';
const configError = () => Object.assign(new Error('Meta WhatsApp is not configured.'), { code: 'WHATSAPP_CONFIG' });
function template(kind, language = 'en') {
  const prefix = `META_WHATSAPP_${kind.toUpperCase()}_TEMPLATE`;
  const gu = language === 'gu' && process.env[prefix + '_GU'];
  return { name: gu || process.env[prefix], code: gu ? 'gu' : process.env.META_WHATSAPP_TEMPLATE_LANGUAGE || 'en_US' };
}
function configured(kind = 'invoice') {
  const env = process.env;
  return Boolean(selected() && env.META_WHATSAPP_SEND_ENABLED === 'true' && env.META_WHATSAPP_ACCESS_TOKEN &&
    /^\d+$/.test(env.META_WHATSAPP_PHONE_NUMBER_ID || '') && /^v\d+\.\d+$/.test(env.META_WHATSAPP_API_VERSION || '') &&
    env.META_WHATSAPP_APP_SECRET && env.META_WHATSAPP_VERIFY_TOKEN && /^[a-z0-9_]+$/.test(template(kind).name || '') &&
    (env.APP_URL || env.RENDER_EXTERNAL_URL));
}
async function sendTemplate({ kind, recipient, language, values, document }, { fetcher = global.fetch } = {}) {
  const phone = normalizePhone(recipient);
  if (!configured(kind) || !phone || !publicOrigin().startsWith('https://')) throw configError();
  if (await WhatsAppPreference.exists({ phone, optedOut: true })) throw Object.assign(new Error('WhatsApp messages are disabled for this customer.'), { code: 'WHATSAPP_OPT_OUT' });
  const chosen = template(kind, language);
  if (!/^[a-z0-9_]+$/.test(chosen.name || '')) throw configError();
  const components = [];
  if (document) {
    // Only our expiring invoice endpoint can be attached; never accept an arbitrary media URL.
    const url = new URL(document.link);
    if (url.origin !== publicOrigin() || !url.pathname.startsWith('/api/invoices/shared/')) throw configError();
    components.push({ type: 'header', parameters: [{ type: 'document', document }] });
  }
  components.push({ type: 'body', parameters: values.map(value => ({ type: 'text', text: String(value) })) });
  const body = { messaging_product: 'whatsapp', recipient_type: 'individual', to: phone.slice(1), type: 'template',
    template: { name: chosen.name, language: { code: chosen.code }, components } };
  const response = await fetcher(`https://graph.facebook.com/${process.env.META_WHATSAPP_API_VERSION}/${process.env.META_WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST', signal: AbortSignal.timeout(20000), redirect: 'error',
    headers: { Authorization: `Bearer ${process.env.META_WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.messages?.[0]?.id) throw Object.assign(new Error('Meta did not accept the WhatsApp message.'), { code: 'WHATSAPP_REJECTED' });
  return result.messages[0].id;
}
module.exports = { selected, configured, template, sendTemplate };
