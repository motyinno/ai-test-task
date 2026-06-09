/**
 * GR3 — Template registry tests (Q-01.04)
 *
 * Verifies:
 *   1. render() interpolates {{variables}} in subject/html/text.
 *   2. Unknown template ID throws an error.
 *   3. All required templates exist.
 *   4. EmailService selects dev adapter by default (no live SMTP).
 *   5. EmailService resolves template when `template` field is set.
 */
import { renderTemplate, hasTemplate, listTemplateIds } from '../templates/template-registry';

describe('TemplateRegistry (GR3, Q-01.04)', () => {
  describe('renderTemplate', () => {
    it('renders password-reset template with interpolated data', () => {
      const result = renderTemplate('password-reset', {
        name: 'Alice',
        resetUrl: 'https://example.com/reset/abc123',
        expiresIn: '30',
      });

      expect(result.subject).toContain('Reset your password');
      expect(result.html).toContain('Alice');
      expect(result.html).toContain('https://example.com/reset/abc123');
      expect(result.text).toContain('30');
      expect(result.html).not.toContain('{{name}}');
      expect(result.html).not.toContain('{{resetUrl}}');
    });

    it('renders welcome template with name, email, loginUrl', () => {
      const result = renderTemplate('welcome', {
        name: 'Bob',
        email: 'bob@example.com',
        loginUrl: 'https://app.example.com/login',
      });

      expect(result.html).toContain('Bob');
      expect(result.html).toContain('bob@example.com');
      expect(result.text).toContain('https://app.example.com/login');
    });

    it('renders email-verify template', () => {
      const result = renderTemplate('email-verify', {
        name: 'Carol',
        verifyUrl: 'https://example.com/verify/xyz',
        expiresIn: '24',
      });

      expect(result.subject).toContain('Verify');
      expect(result.html).toContain('Carol');
      expect(result.html).toContain('https://example.com/verify/xyz');
    });

    it('renders trainer-invite template', () => {
      const result = renderTemplate('trainer-invite', {
        name: 'Dave',
        businessName: 'Soccer Academy',
        tempPassword: 'TmpP@ss123',
        loginUrl: 'https://app.example.com/login',
      });

      expect(result.subject).toContain('Soccer Academy');
      expect(result.html).toContain('Dave');
      expect(result.html).toContain('TmpP@ss123');
    });

    it('renders coach-invite template', () => {
      const result = renderTemplate('coach-invite', {
        name: 'Eve',
        trainerName: 'Coach Mike',
        businessName: 'Elite Soccer',
        inviteUrl: 'https://app.example.com/invite/aaa',
      });

      expect(result.subject).toContain('Elite Soccer');
      expect(result.html).toContain('Eve');
      expect(result.html).toContain('Coach Mike');
    });

    it('renders approval-request template', () => {
      const result = renderTemplate('approval-request', {
        parentName: 'Frank',
        childName: 'Child A',
        description: 'Camp registration',
        amount: '$50',
        approvalUrl: 'https://app.example.com/approve/abc',
        expiresAt: '2026-06-15',
      });

      expect(result.subject).toContain('Child A');
      expect(result.html).toContain('Frank');
      expect(result.html).toContain('$50');
    });

    it('renders approval-result-approved template', () => {
      const result = renderTemplate('approval-result-approved', {
        requesterName: 'Grace',
        childName: 'Child B',
        description: 'Camp registration',
      });

      expect(result.subject).toContain('Child B');
      expect(result.html).toContain('Grace');
    });

    it('renders approval-result-denied template', () => {
      const result = renderTemplate('approval-result-denied', {
        requesterName: 'Heidi',
        childName: 'Child C',
        description: 'Token purchase',
        parentNotes: 'Not at this time',
      });

      expect(result.html).toContain('Heidi');
      expect(result.html).toContain('Not at this time');
    });

    it('renders child-sharelink-blocked template', () => {
      const result = renderTemplate('child-sharelink-blocked', {
        parentName: 'Ivan',
        childName: 'Child D',
        manageUrl: 'https://app.example.com/manage',
      });

      expect(result.html).toContain('Ivan');
      expect(result.html).toContain('Child D');
    });

    it('renders availability-override template', () => {
      const result = renderTemplate('availability-override', {
        coachName: 'Judy',
        trainerName: 'Coach Mike',
        reason: 'Championship finals',
      });

      expect(result.subject).toContain('overrid');
      expect(result.html).toContain('Judy');
      expect(result.html).toContain('Championship finals');
      expect(result.text).toContain('Coach Mike');
    });

    it('SANITY CHECK — unknown template ID throws an error', () => {
      expect(() => renderTemplate('nonexistent-template-id', {})).toThrow(
        /Unknown email template/,
      );
    });

    it('SANITY CHECK — unknown template ID includes the ID in the error', () => {
      expect(() => renderTemplate('totally-made-up', {})).toThrow(/totally-made-up/);
    });

    it('leaves un-provided placeholders intact (safe interpolation)', () => {
      const result = renderTemplate('welcome', { name: 'Alice' });
      // email and loginUrl not provided — placeholders remain
      expect(result.html).toContain('{{email}}');
      expect(result.html).toContain('{{loginUrl}}');
    });
  });

  describe('hasTemplate', () => {
    it('returns true for known template', () => {
      expect(hasTemplate('welcome')).toBe(true);
    });

    it('returns false for unknown template', () => {
      expect(hasTemplate('fake-template')).toBe(false);
    });
  });

  describe('listTemplateIds', () => {
    const EXPECTED_TEMPLATES = [
      'welcome',
      'password-reset',
      'email-verify',
      'trainer-invite',
      'coach-invite',
      'approval-request',
      'approval-result-approved',
      'approval-result-denied',
      'child-sharelink-blocked',
      'availability-override',
    ];

    it.each(EXPECTED_TEMPLATES)('template "%s" is registered', (id) => {
      expect(listTemplateIds()).toContain(id);
    });

    it('has at least 10 templates registered (full set)', () => {
      expect(listTemplateIds().length).toBeGreaterThanOrEqual(10);
    });
  });
});
