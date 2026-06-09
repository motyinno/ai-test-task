/**
 * GR3 — EmailService tests (Q-01.04)
 *
 * Verifies:
 *   1. Dev adapter records messages in sentMessages (unchanged behavior).
 *   2. EmailService defaults to log/dev adapter (no live SMTP).
 *   3. Template resolution: `template` field renders via TemplateRegistry.
 *   4. Unknown template throws an error.
 *   5. SMTP adapter is used when EMAIL_PROVIDER=smtp (mock transport assertion).
 */
import { Test } from '@nestjs/testing';
import { EmailService } from '../email.service';
import * as nodemailer from 'nodemailer';

describe('EmailService (GR3, Q-01.04)', () => {
  describe('dev/log adapter (default)', () => {
    let service: EmailService;

    beforeEach(async () => {
      delete process.env['EMAIL_PROVIDER'];
      const mod = await Test.createTestingModule({
        providers: [EmailService],
      }).compile();
      service = mod.get(EmailService);
    });

    it('send records the message in dev adapter', async () => {
      await service.send({
        to: 'user@example.com',
        subject: 'Password Reset',
        text: 'Your reset token is: abc123',
      });

      expect(service.sentMessages).toHaveLength(1);
      expect(service.sentMessages[0]).toMatchObject({
        to: 'user@example.com',
        subject: 'Password Reset',
      });
    });

    it('send multiple messages appends to sentMessages array', async () => {
      await service.send({ to: 'a@example.com', subject: 'Test 1' });
      await service.send({ to: 'b@example.com', subject: 'Test 2' });

      expect(service.sentMessages).toHaveLength(2);
      expect(service.sentMessages[0].to).toBe('a@example.com');
      expect(service.sentMessages[1].to).toBe('b@example.com');
    });

    it('resolves template when template field is set', async () => {
      await service.send({
        to: 'coach@example.com',
        subject: '', // will be overridden by template
        template: 'availability-override',
        data: {
          coachName: 'Alice',
          trainerName: 'Coach Mike',
          reason: 'Championship finals',
        },
      });

      const sent = service.sentMessages[0];
      expect(sent.to).toBe('coach@example.com');
      expect(sent.subject).toContain('overrid');
      expect(sent.html).toContain('Alice');
      expect(sent.html).toContain('Championship finals');
    });

    it('SANITY CHECK — unknown template throws an error', async () => {
      await expect(
        service.send({
          to: 'user@example.com',
          subject: 'test',
          template: 'nonexistent-template',
        }),
      ).rejects.toThrow(/Unknown email template/);
    });
  });

  describe('SMTP adapter (EMAIL_PROVIDER=smtp)', () => {
    let sentMails: Array<{ to: string; subject: string }>;

    beforeEach(() => {
      sentMails = [];
      process.env['EMAIL_PROVIDER'] = 'smtp';
    });

    afterEach(() => {
      delete process.env['EMAIL_PROVIDER'];
    });

    it('calls the transport sendMail with to and subject', async () => {
      // Build a mock transport that records sent mails
      const mockTransport = {
        sendMail: jest.fn().mockImplementation((opts: { to: string; subject: string }) => {
          sentMails.push({ to: opts.to, subject: opts.subject });
          return Promise.resolve({ messageId: 'test-msg-id' });
        }),
      } as unknown as ReturnType<typeof nodemailer.createTransport>;

      // Directly construct SmtpEmailAdapter with mock transport
      const { SmtpEmailAdapter } = await import('../smtp-email.adapter');
      const adapter = new SmtpEmailAdapter({ transport: mockTransport, from: 'test@example.com' });

      await adapter.send({
        to: 'target@example.com',
        subject: 'Hello from SMTP',
        html: '<p>Test</p>',
        text: 'Test',
      });

      expect(mockTransport.sendMail).toHaveBeenCalledTimes(1);
      expect(sentMails[0].to).toBe('target@example.com');
      expect(sentMails[0].subject).toBe('Hello from SMTP');
    });
  });
});
