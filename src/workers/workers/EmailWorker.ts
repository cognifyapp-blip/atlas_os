/**
 * Atlas OS — Email Worker
 *
 * Handles all outbound email dispatch via EmailService.
 * Supports Resend, SendGrid, and console fallback.
 */

import type { Job } from 'bullmq';
import { BaseWorker } from '../BaseWorker.js';
import { QUEUE_NAMES, type EmailJobPayload, type JobResult } from '../../infrastructure/queue/types.js';
import { emailService } from '../../services/EmailService.js';

export class EmailWorker extends BaseWorker<EmailJobPayload> {
  constructor() {
    super('EmailWorker', QUEUE_NAMES.EMAIL);
  }

  protected validate(payload: EmailJobPayload): void {
    if (!payload.organizationId) throw new Error('organizationId is required');
    if (!payload.to) throw new Error('to is required');
    if (!payload.subject) throw new Error('subject is required');
    if (!payload.body && !payload.template) {
      throw new Error('Either body or template is required');
    }
  }

  protected async process(
    payload: EmailJobPayload,
    _job: Job<EmailJobPayload, JobResult>,
  ): Promise<unknown> {
    const { to, subject, body, template, templateData, replyTo, organizationId, correlationId } = payload;

    const recipients = Array.isArray(to) ? to : [to];

    // Resolve body from template if needed
    let emailBody = body;
    if (!emailBody && template) {
      emailBody = this._renderTemplate(template, templateData ?? {});
    }

    const result = await emailService.send({
      to: recipients,
      subject,
      body: emailBody ?? '',
      replyTo,
    });

    console.log(
      JSON.stringify({
        level: result.success ? 'info' : 'error',
        worker: 'EmailWorker',
        provider: result.provider,
        to: recipients,
        subject,
        messageId: result.messageId,
        logged: result.logged,
        organizationId,
        correlationId,
        message: result.success ? `Email sent via ${result.provider}` : `Email failed: ${result.error}`,
      }),
    );

    if (!result.success) throw new Error(result.error ?? 'Email delivery failed');

    return {
      to: recipients,
      subject,
      provider: result.provider,
      messageId: result.messageId,
      status: 'sent',
      sentAt: new Date().toISOString(),
    };
  }

  private _renderTemplate(template: string, data: Record<string, unknown>): string {
    // Simple mustache-style template rendering
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(data[key] ?? ''));
  }
}
