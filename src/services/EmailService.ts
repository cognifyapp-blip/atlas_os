/**
 * Atlas OS — Email Service
 *
 * Delivers outbound emails via MailerSend (primary), Resend, or SendGrid.
 * Falls back to console logging in dev when no key is configured.
 *
 * Configuration (in order of priority):
 *   MAILERSEND_API_TOKEN — MailerSend (https://mailersend.com) — primary
 *   RESEND_API_KEY       — Resend fallback
 *   SENDGRID_API_KEY     — SendGrid fallback
 *   EMAIL_FROM           — Sender e.g. "Atlas OS <atlas@atlasos.dpdns.org>"
 */

interface SendEmailParams {
  to: string | string[];
  subject: string;
  body: string;
  from?: string;
  replyTo?: string;
}

interface SendResult {
  success: boolean;
  provider: string;
  messageId?: string;
  error?: string;
  logged?: boolean;
}

class AtlasEmailService {
  private static _instance: AtlasEmailService | null = null;

  private constructor() {}

  static getInstance(): AtlasEmailService {
    if (!AtlasEmailService._instance) {
      AtlasEmailService._instance = new AtlasEmailService();
    }
    return AtlasEmailService._instance;
  }

  async send(params: SendEmailParams): Promise<SendResult> {
    const mailerSendToken = process.env.MAILERSEND_API_TOKEN;
    const resendKey = process.env.RESEND_API_KEY;
    const sendgridKey = process.env.SENDGRID_API_KEY;
    const fromRaw = params.from ?? process.env.EMAIL_FROM ?? 'Atlas OS <contact@atlasos.dpdns.org>';
    const recipients = Array.isArray(params.to) ? params.to : [params.to];

    // Parse "Name <email>" into separate parts
    const parseAddress = (addr: string): { email: string; name: string } => {
      const match = addr.match(/^(.*?)\s*<(.+?)>$/);
      if (match) return { name: match[1].trim(), email: match[2].trim() };
      return { name: addr, email: addr };
    };

    const fromParsed = parseAddress(fromRaw);

    // ── MailerSend (primary) ──────────────────────────────────────────────────
    if (mailerSendToken) {
      try {
        const response = await fetch('https://api.mailersend.com/v1/email', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${mailerSendToken}`,
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: JSON.stringify({
            from: { email: fromParsed.email, name: fromParsed.name },
            to: recipients.map((r) => {
              const p = parseAddress(r);
              return { email: p.email, name: p.name || p.email };
            }),
            subject: params.subject,
            text: params.body,
            html: this._markdownToHtml(params.body),
            ...(params.replyTo ? { reply_to: { email: params.replyTo } } : {}),
          }),
        });

        if (!response.ok) {
          const err = await response.text();
          throw new Error(`MailerSend API error ${response.status}: ${err}`);
        }

        // MailerSend returns 202 with X-Message-Id header, empty body
        const messageId = response.headers.get('X-Message-Id') ?? undefined;
        return { success: true, provider: 'mailersend', messageId };
      } catch (err: any) {
        console.error(`[EmailService] MailerSend failed: ${err.message}`);
        // Fall through to Resend
      }
    }

    // ── Resend (fallback) ─────────────────────────────────────────────────────
    if (resendKey) {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromRaw,
            to: recipients,
            subject: params.subject,
            html: this._markdownToHtml(params.body),
            text: params.body,
            reply_to: params.replyTo,
          }),
        });

        if (!response.ok) {
          const err = await response.text();
          throw new Error(`Resend API error ${response.status}: ${err}`);
        }

        const data = await response.json() as { id?: string };
        return { success: true, provider: 'resend', messageId: data.id };
      } catch (err: any) {
        console.error(`[EmailService] Resend failed: ${err.message}`);
        // Fall through to SendGrid
      }
    }

    // ── SendGrid (fallback) ───────────────────────────────────────────────────
    if (sendgridKey) {
      try {
        const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${sendgridKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            personalizations: [{ to: recipients.map((r) => ({ email: parseAddress(r).email })) }],
            from: { email: fromParsed.email, name: fromParsed.name },
            subject: params.subject,
            content: [
              { type: 'text/plain', value: params.body },
              { type: 'text/html', value: this._markdownToHtml(params.body) },
            ],
          }),
        });

        if (!response.ok) {
          const err = await response.text();
          throw new Error(`SendGrid API error ${response.status}: ${err}`);
        }

        const messageId = response.headers.get('X-Message-Id') ?? undefined;
        return { success: true, provider: 'sendgrid', messageId };
      } catch (err: any) {
        console.error(`[EmailService] SendGrid failed: ${err.message}`);
      }
    }

    // ── Console fallback (dev / no keys configured) ───────────────────────────
    console.log(
      JSON.stringify({
        level: 'info',
        component: 'EmailService',
        mode: 'console_fallback',
        to: recipients,
        subject: params.subject,
        preview: params.body.substring(0, 200),
        ts: new Date().toISOString(),
        note: 'Configure MAILERSEND_API_TOKEN to send real emails.',
      }),
    );

    return { success: true, provider: 'console', logged: true };
  }

  /** Minimal markdown → HTML for email bodies. */
  private _markdownToHtml(markdown: string): string {
    return markdown
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^## (.*)/gm, '<h2>$1</h2>')
      .replace(/^# (.*)/gm, '<h1>$1</h1>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/^/, '<p>')
      .replace(/$/, '</p>');
  }
}

export const emailService = AtlasEmailService.getInstance();
