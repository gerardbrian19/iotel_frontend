/**
 * Outgoing email: the sign-in codes (auth.ts) and payment invoices (invoices.ts).
 *
 * SMTP relay (Resend today: login `resend`, password = API key). Host/port/sender live in functions/.env; the login and
 * key are Secret Manager secrets, so every function that sends mail lists `MAIL_SECRETS`.
 */
import { defineInt, defineSecret, defineString } from 'firebase-functions/params';
import { createTransport, SendMailOptions, Transporter } from 'nodemailer';

const SMTP_HOST = defineString('SMTP_HOST', { default: 'smtp.resend.com' });
const SMTP_PORT = defineInt('SMTP_PORT', { default: 465 });
const MAIL_FROM = defineString('MAIL_FROM', {
  description:
    'Sender address on the domain verified in Resend (just the address, e.g. no-reply@iotel.app)',
});
const SMTP_USER = defineSecret('SMTP_USER');
const SMTP_PASS = defineSecret('SMTP_PASS');

export const MAIL_SECRETS = [SMTP_USER, SMTP_PASS];

const SENDER_NAME = 'IOTEL by Goldcomm';

let transporter: Transporter | null = null;

function mailer(): Transporter {
  transporter ??= createTransport({
    host: SMTP_HOST.value(),
    port: SMTP_PORT.value(),
    secure: SMTP_PORT.value() === 465,
    auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() },
  });
  return transporter;
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: SendMailOptions['attachments'];
}

/** Sends one email from IOTEL's no-reply address. Throws when the relay refuses it. */
export async function sendMail(mail: Mail): Promise<void> {
  await mailer().sendMail({ from: { name: SENDER_NAME, address: MAIL_FROM.value() }, ...mail });
}
