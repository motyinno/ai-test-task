import { Test } from '@nestjs/testing';
import { EmailService } from '../email.service';

describe('EmailService', () => {
  let service: EmailService;

  beforeEach(async () => {
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
});
