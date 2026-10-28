const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');
const mail = require('../services/mail');
const realFetch = global.fetch, realTransport = nodemailer.createTransport;
beforeEach(() => { for (const key of ['BREVO_API_KEY', 'MAIL_FROM', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_PORT', 'SMTP_SECURE']) delete process.env[key]; global.fetch = realFetch; nodemailer.createTransport = realTransport; });
after(() => { global.fetch = realFetch; nodemailer.createTransport = realTransport; });
test('unconfigured mail never reports successful delivery', async () => {
  assert.equal(mail.configured(), false); await assert.rejects(mail.send({ to: 'customer@example.com', text: 'Test' }), { code: 'MAIL_NOT_CONFIGURED' });
});
test('HTTPS email sends the PDF as base64 to the correct recipient without putting secrets in the body', async () => {
  process.env.BREVO_API_KEY = 'private-api-key'; process.env.MAIL_FROM = 'Raiyani Agro Seeds <shop@example.com>';
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://api.brevo.com/v3/smtp/email'); assert.equal(options.headers['api-key'], 'private-api-key');
    const body = JSON.parse(options.body); assert.equal(body.sender.email, 'shop@example.com'); assert.equal(body.to[0].email, 'customer@example.com');
    assert.equal(Buffer.from(body.attachment[0].content, 'base64').toString(), '%PDF-test'); assert.equal(body.attachment[0].name, 'invoice.pdf'); assert.ok(!options.body.includes('private-api-key'));
    return { ok: true, json: async () => ({ messageId: 'accepted-id' }) };
  };
  assert.equal(await mail.send({ to: 'customer@example.com', subject: 'Invoice', text: 'Your invoice', attachments: [{ filename: 'invoice.pdf', content: Buffer.from('%PDF-test') }] }), 'accepted-id');
});
test('email provider rejection is an error rather than a false sent status', async () => {
  process.env.BREVO_API_KEY = 'test-key'; process.env.MAIL_FROM = 'shop@example.com';
  global.fetch = async () => ({ ok: false, json: async () => ({ message: 'Rejected' }) });
  await assert.rejects(mail.send({ to: 'customer@example.com', text: 'Test' }), { code: 'MAIL_REJECTED' });
});
test('SMTP alternative requires TLS and includes a PDF attachment without external file access', async () => {
  Object.assign(process.env, { SMTP_HOST: 'smtp.example.com', SMTP_USER: 'shop', SMTP_PASS: 'private-password', MAIL_FROM: 'shop@example.com', SMTP_PORT: '587', SMTP_SECURE: 'false' });
  nodemailer.createTransport = options => {
    assert.equal(options.secure, false); assert.equal(options.requireTLS, true); assert.equal(options.disableFileAccess, true); assert.equal(options.disableUrlAccess, true);
    return { sendMail: async message => { assert.equal(message.from, 'shop@example.com'); assert.equal(message.to, 'customer@example.com'); return { accepted: ['customer@example.com'], rejected: [], messageId: 'smtp-id' }; } };
  };
  assert.equal(await mail.send({ to: 'customer@example.com', text: 'Invoice' }), 'smtp-id');
});
