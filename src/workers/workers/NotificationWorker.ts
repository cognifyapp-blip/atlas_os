/**
 * Atlas OS — Notification Worker
 *
 * Delivers notifications via:
 *   - in_app:  SSE broadcast
 *   - email:   EmailService
 *   - slack:   Slack Incoming Webhook
 *   - teams:   Teams Incoming Webhook
 *   - webhook: Custom webhook URL
 */

import type { Job } from 'bullmq';
import { BaseWorker } from '../BaseWorker.js';
import { QUEUE_NAMES, type NotificationJobPayload, type JobResult } from '../../infrastructure/queue/types.js';
import { emailService } from '../../services/EmailService.js';

// Import broadcastEvent lazily to avoid circular dep at module load
let _broadcastEvent: ((event: unknown) => void) | null = null;
export function registerNotificationBroadcaster(fn: (event: unknown) => void) {
  _broadcastEvent = fn;
}

export class NotificationWorker extends BaseWorker<NotificationJobPayload> {
  constructor() {
    super('NotificationWorker', QUEUE_NAMES.NOTIFICATION);
  }

  protected validate(payload: NotificationJobPayload): void {
    if (!payload.organizationId) throw new Error('organizationId is required');
    if (!payload.channel) throw new Error('channel is required');
    if (!payload.recipientId) throw new Error('recipientId is required');
    if (!payload.title) throw new Error('title is required');
    if (!payload.message) throw new Error('message is required');
  }

  protected async process(
    payload: NotificationJobPayload,
    _job: Job<NotificationJobPayload, JobResult>,
  ): Promise<unknown> {
    const { channel, recipientId, title, message, priority, actionUrl, data, organizationId, correlationId } = payload;

    switch (channel) {
      case 'in_app':
        return this._sendInApp({ recipientId, title, message, priority, actionUrl, data, organizationId });

      case 'email':
        return this._sendEmail({ recipientId, title, message, priority, actionUrl });

      case 'slack':
        return this._sendSlack({ title, message, priority, actionUrl, data });

      case 'teams':
        return this._sendTeams({ title, message, priority, actionUrl });

      case 'webhook':
        return this._sendWebhook({ title, message, priority, data, organizationId });

      default:
        console.warn(`[NotificationWorker] Unknown channel "${channel}" — falling back to in_app`);
        return this._sendInApp({ recipientId, title, message, priority, actionUrl, data, organizationId });
    }
  }

  // ─── Channel implementations ─────────────────────────────────────────────

  private async _sendInApp(params: { recipientId: string; title: string; message: string; priority: string; actionUrl?: string; data?: Record<string, unknown>; organizationId: string }) {
    if (_broadcastEvent) {
      _broadcastEvent({
        type: 'notification',
        data: {
          recipientId: params.recipientId,
          title: params.title,
          message: params.message,
          priority: params.priority,
          actionUrl: params.actionUrl,
          data: params.data,
          timestamp: new Date().toISOString(),
        },
      });
    }
    return { channel: 'in_app', recipientId: params.recipientId, status: 'delivered', deliveredAt: new Date().toISOString() };
  }

  private async _sendEmail(params: { recipientId: string; title: string; message: string; priority: string; actionUrl?: string }) {
    // recipientId is an email address for email channel
    const result = await emailService.send({
      to: params.recipientId,
      subject: `[${params.priority.toUpperCase()}] ${params.title}`,
      body: params.actionUrl
        ? `${params.message}\n\n**Action Required:** ${params.actionUrl}`
        : params.message,
    });

    return { channel: 'email', to: params.recipientId, status: result.success ? 'delivered' : 'failed', provider: result.provider, deliveredAt: new Date().toISOString() };
  }

  private async _sendSlack(params: { title: string; message: string; priority: string; actionUrl?: string; data?: Record<string, unknown> }) {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) {
      console.log(`[NotificationWorker] SLACK_WEBHOOK_URL not configured — notification logged: ${params.title}`);
      return { channel: 'slack', status: 'not_configured', note: 'Set SLACK_WEBHOOK_URL to enable Slack notifications' };
    }

    const emoji = params.priority === 'critical' ? '🚨' : params.priority === 'high' ? '⚠️' : 'ℹ️';
    const payload: Record<string, unknown> = {
      text: `${emoji} *${params.title}*\n${params.message}`,
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `${emoji} *${params.title}*\n${params.message}` },
        },
        ...(params.actionUrl ? [{
          type: 'actions',
          elements: [{
            type: 'button',
            text: { type: 'plain_text', text: 'View Details' },
            url: params.actionUrl,
          }],
        }] : []),
      ],
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) throw new Error(`Slack webhook failed: ${response.status}`);
    return { channel: 'slack', status: 'delivered', deliveredAt: new Date().toISOString() };
  }

  private async _sendTeams(params: { title: string; message: string; priority: string; actionUrl?: string }) {
    const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
    if (!webhookUrl) {
      console.log(`[NotificationWorker] TEAMS_WEBHOOK_URL not configured — notification logged: ${params.title}`);
      return { channel: 'teams', status: 'not_configured', note: 'Set TEAMS_WEBHOOK_URL to enable Teams notifications' };
    }

    const payload: Record<string, unknown> = {
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      summary: params.title,
      themeColor: params.priority === 'critical' ? 'FF0000' : params.priority === 'high' ? 'FFA500' : '0078D4',
      title: params.title,
      text: params.message,
      ...(params.actionUrl ? {
        potentialAction: [{
          '@type': 'OpenUri',
          name: 'View Details',
          targets: [{ os: 'default', uri: params.actionUrl }],
        }],
      } : {}),
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) throw new Error(`Teams webhook failed: ${response.status}`);
    return { channel: 'teams', status: 'delivered', deliveredAt: new Date().toISOString() };
  }

  private async _sendWebhook(params: { title: string; message: string; priority: string; data?: Record<string, unknown>; organizationId: string }) {
    const webhookUrl = process.env.NOTIFICATION_WEBHOOK_URL;
    if (!webhookUrl) {
      console.log(`[NotificationWorker] NOTIFICATION_WEBHOOK_URL not configured — notification logged: ${params.title}`);
      return { channel: 'webhook', status: 'not_configured' };
    }

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Atlas-OS-Org': params.organizationId },
      body: JSON.stringify({ title: params.title, message: params.message, priority: params.priority, data: params.data, ts: new Date().toISOString() }),
    });

    return { channel: 'webhook', status: 'delivered', deliveredAt: new Date().toISOString() };
  }
}
