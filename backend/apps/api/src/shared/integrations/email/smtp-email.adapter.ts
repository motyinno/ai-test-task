/**
 * SmtpEmailAdapter — Nodemailer-based SMTP email adapter (Q-01.04, GR3).
 *
 * Selected when EMAIL_PROVIDER=smtp in the environment.
 * Configuration via env vars:
 *   SMTP_HOST     — SMTP server hostname
 *   SMTP_PORT     — SMTP port (default: 587)
 *   SMTP_USER     — SMTP auth username
 *   SMTP_PASS     — SMTP auth password
 *   SMTP_FROM     — Sender address (e.g. "PracticePerfect <noreply@example.com>")
 *
 * Dev/test: EMAIL_PROVIDER defaults to 'log' (the existing dev adapter),
 * so no live SMTP is required in tests.
 */
import { Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { EmailMessage } from './email.service';

export class SmtpEmailAdapter {
  private readonly logger = new Logger(SmtpEmailAdapter.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(options?: {
    host?: string;
    port?: number;
    user?: string;
    pass?: string;
    from?: string;
    transport?: Transporter; // Injected in tests
  }) {
    this.from = options?.from ?? process.env['SMTP_FROM'] ?? 'noreply@example.com';

    if (options?.transport) {
      // Allow injection of a test transport (e.g. nodemailer-mock or a captured transport)
      this.transporter = options.transport;
    } else {
      const host = options?.host ?? process.env['SMTP_HOST'] ?? 'localhost';
      const port = options?.port ?? parseInt(process.env['SMTP_PORT'] ?? '587', 10);
      const user = options?.user ?? process.env['SMTP_USER'];
      const pass = options?.pass ?? process.env['SMTP_PASS'];

      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: user && pass ? { user, pass } : undefined,
      });
    }
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    this.logger.log(`[SMTP] To: ${message.to} | Subject: ${message.subject}`);
  }
}
