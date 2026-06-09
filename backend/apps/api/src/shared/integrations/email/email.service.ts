import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmtpEmailAdapter } from './smtp-email.adapter';
import { renderTemplate, hasTemplate } from './templates/template-registry';

export interface EmailMessage {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  template?: string;
  data?: Record<string, unknown>;
}

/**
 * EmailService — provider-agnostic email port (Q-01.04, GR3).
 *
 * Adapter selection (EMAIL_PROVIDER env):
 *   - default / 'log' → dev log adapter (records in sentMessages array, no real send)
 *   - 'smtp'          → Nodemailer SMTP adapter (production)
 *
 * Template usage:
 *   - If `message.template` is set, the template is rendered via TemplateRegistry
 *     and the rendered subject/html/text override any inline values.
 *   - `message.data` is passed to the template renderer.
 *
 * Backward compat: existing callers that pass inline subject/html/text continue
 * to work unchanged — template rendering is opt-in via the `template` field.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  /** In-memory sent messages for test/dev assertions (dev adapter) */
  readonly sentMessages: EmailMessage[] = [];
  private readonly smtpAdapter: SmtpEmailAdapter | null = null;
  private readonly provider: string;

  constructor(@Optional() private readonly configService?: ConfigService) {
    this.provider = (
      this.configService?.get<string>('EMAIL_PROVIDER') ??
      process.env['EMAIL_PROVIDER'] ??
      'log'
    ).toLowerCase();

    if (this.provider === 'smtp') {
      this.smtpAdapter = new SmtpEmailAdapter();
      this.logger.log('[EmailService] Using SMTP adapter');
    } else {
      this.logger.log('[EmailService] Using dev/log adapter (EMAIL_PROVIDER=log or unset)');
    }
  }

  async send(message: EmailMessage): Promise<void> {
    // Resolve template if provided
    const resolved = this.resolveTemplate(message);

    if (this.provider === 'smtp' && this.smtpAdapter) {
      await this.smtpAdapter.send(resolved);
    } else {
      // Dev/log adapter
      this.sentMessages.push(resolved);
      this.logger.log(
        `[EMAIL DEV ADAPTER] To: ${resolved.to} | Subject: ${resolved.subject}`,
      );
    }
  }

  /**
   * Resolve a template-based message to a concrete EmailMessage.
   * If `message.template` is set and the template exists, render it.
   * Falls back to the inline subject/html/text if no template is specified.
   */
  private resolveTemplate(message: EmailMessage): EmailMessage {
    if (message.template) {
      if (!hasTemplate(message.template)) {
        throw new Error(`Unknown email template: "${message.template}"`);
      }
      const rendered = renderTemplate(message.template, message.data ?? {});
      return {
        ...message,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      };
    }
    return message;
  }
}
