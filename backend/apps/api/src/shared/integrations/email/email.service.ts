import { Injectable, Logger } from '@nestjs/common';

export interface EmailMessage {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  template?: string;
  data?: Record<string, unknown>;
}

/**
 * EmailService — provider-agnostic email port (Q-01.04 open gap).
 * Dev/log adapter: logs emails to console. Real provider TBD.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  /** In-memory sent messages for test assertions */
  readonly sentMessages: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sentMessages.push(message);
    this.logger.log(
      `[EMAIL DEV ADAPTER] To: ${message.to} | Subject: ${message.subject}`,
    );
  }
}
