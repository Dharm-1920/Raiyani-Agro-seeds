const nodemailer = require('nodemailer');
function configured() {
  return Boolean(process.env.MAIL_FROM && (process.env.BREVO_API_KEY || (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)));
}
function transport() {
  if (!configured()) throw Object.assign(new Error('Email delivery is not connected.'), { code: 'MAIL_NOT_CONFIGURED' });
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: process.env.SMTP_SECURE !== 'false',
    requireTLS: process.env.SMTP_SECURE === 'false',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
    disableFileAccess: true, disableUrlAccess: true,
  });
}
async function send(message) {
  if (process.env.BREVO_API_KEY && process.env.MAIL_FROM) {
    const email = process.env.MAIL_FROM.match(/<([^<>]+)>/)?.[1] || process.env.MAIL_FROM;
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST', signal: AbortSignal.timeout(20000),
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender: { email, name: process.env.SHOP_NAME || 'Raiyani Agro Seeds' }, to: [{ email: message.to }], subject: message.subject, textContent: message.text,
        ...(message.attachments?.length ? { attachment: message.attachments.map(a => ({ name: a.filename, content: a.content.toString('base64') })) } : {}),
        ...(message.messageId ? { headers: { 'X-Mailin-custom': message.messageId } } : {}),
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.messageId) throw Object.assign(new Error('Email provider did not accept the message.'), { code: 'MAIL_REJECTED' });
    return result.messageId;
  }
  const result = await transport().sendMail({ ...message, from: process.env.MAIL_FROM });
  if (!result.accepted?.length || result.rejected?.length) throw Object.assign(new Error('Email was not accepted.'), { code: 'MAIL_REJECTED' });
  return result.messageId;
}
module.exports = { configured, send };
