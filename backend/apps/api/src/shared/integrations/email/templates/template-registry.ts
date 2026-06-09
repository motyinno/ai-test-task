/**
 * TemplateRegistry — transactional email template registry (Q-01.04, GR3).
 *
 * Templates use simple {{variable}} interpolation.
 * Calling `render(id, data)` returns { subject, html, text } with all
 * `{{key}}` placeholders replaced by the corresponding values from `data`.
 *
 * Supported template IDs:
 *   welcome
 *   password-reset
 *   email-verify
 *   trainer-invite
 *   coach-invite
 *   approval-request
 *   approval-result-approved
 *   approval-result-denied
 *   child-sharelink-blocked
 *   availability-override
 */

export interface RenderedTemplate {
  subject: string;
  html: string;
  text: string;
}

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

const TEMPLATES: Record<string, EmailTemplate> = {
  welcome: {
    subject: 'Welcome to PracticePerfect!',
    html: `<h1>Welcome, {{name}}!</h1>
<p>Your account has been created. Your email is <strong>{{email}}</strong>.</p>
<p>Get started by logging in at <a href="{{loginUrl}}">{{loginUrl}}</a>.</p>`,
    text: `Welcome, {{name}}!
Your account has been created. Your email is {{email}}.
Get started by logging in at {{loginUrl}}.`,
  },

  'password-reset': {
    subject: 'Reset your password',
    html: `<h1>Password Reset</h1>
<p>Hi {{name}},</p>
<p>Click the link below to reset your password:</p>
<p><a href="{{resetUrl}}">{{resetUrl}}</a></p>
<p>This link expires in {{expiresIn}} minutes. If you did not request a reset, ignore this email.</p>`,
    text: `Password Reset
Hi {{name}},
Click the link below to reset your password:
{{resetUrl}}
This link expires in {{expiresIn}} minutes. If you did not request a reset, ignore this email.`,
  },

  'email-verify': {
    subject: 'Verify your email address',
    html: `<h1>Verify your email</h1>
<p>Hi {{name}},</p>
<p>Please verify your email address by clicking the link below:</p>
<p><a href="{{verifyUrl}}">{{verifyUrl}}</a></p>
<p>This link expires in {{expiresIn}} hours.</p>`,
    text: `Verify your email
Hi {{name}},
Please verify your email address:
{{verifyUrl}}
This link expires in {{expiresIn}} hours.`,
  },

  'trainer-invite': {
    subject: 'You have been invited to join {{businessName}} on PracticePerfect',
    html: `<h1>Trainer Invitation</h1>
<p>Hi {{name}},</p>
<p>You have been invited to join <strong>{{businessName}}</strong> as a trainer.</p>
<p>Use your temporary password to log in: <strong>{{tempPassword}}</strong></p>
<p>Login at: <a href="{{loginUrl}}">{{loginUrl}}</a></p>
<p>You will be prompted to change your password on first login.</p>`,
    text: `Trainer Invitation
Hi {{name}},
You have been invited to join {{businessName}} as a trainer.
Use your temporary password to log in: {{tempPassword}}
Login at: {{loginUrl}}
You will be prompted to change your password on first login.`,
  },

  'coach-invite': {
    subject: 'You have been invited to join {{businessName}} as a coach',
    html: `<h1>Coach Invitation</h1>
<p>Hi {{name}},</p>
<p><strong>{{trainerName}}</strong> has invited you to join <strong>{{businessName}}</strong> as a coach on PracticePerfect.</p>
<p>Accept your invitation: <a href="{{inviteUrl}}">{{inviteUrl}}</a></p>`,
    text: `Coach Invitation
Hi {{name}},
{{trainerName}} has invited you to join {{businessName}} as a coach on PracticePerfect.
Accept your invitation: {{inviteUrl}}`,
  },

  'approval-request': {
    subject: 'Approval required for {{childName}}',
    html: `<h1>Approval Request</h1>
<p>Hi {{parentName}},</p>
<p>An action for <strong>{{childName}}</strong> requires your approval:</p>
<p>{{description}}</p>
<p>Amount: {{amount}}</p>
<p>Review and approve at: <a href="{{approvalUrl}}">{{approvalUrl}}</a></p>
<p>This request expires on {{expiresAt}}.</p>`,
    text: `Approval Request
Hi {{parentName}},
An action for {{childName}} requires your approval:
{{description}}
Amount: {{amount}}
Review and approve at: {{approvalUrl}}
This request expires on {{expiresAt}}.`,
  },

  'approval-result-approved': {
    subject: 'Request approved for {{childName}}',
    html: `<h1>Request Approved</h1>
<p>Hi {{requesterName}},</p>
<p>The parent has approved the request for <strong>{{childName}}</strong>.</p>
<p>Details: {{description}}</p>`,
    text: `Request Approved
Hi {{requesterName}},
The parent has approved the request for {{childName}}.
Details: {{description}}`,
  },

  'approval-result-denied': {
    subject: 'Request denied for {{childName}}',
    html: `<h1>Request Denied</h1>
<p>Hi {{requesterName}},</p>
<p>The parent has denied the request for <strong>{{childName}}</strong>.</p>
<p>Details: {{description}}</p>
<p>Notes from parent: {{parentNotes}}</p>`,
    text: `Request Denied
Hi {{requesterName}},
The parent has denied the request for {{childName}}.
Details: {{description}}
Notes from parent: {{parentNotes}}`,
  },

  'child-sharelink-blocked': {
    subject: 'Share link blocked — {{childName}} tried to join via a link',
    html: `<h1>Share Link Blocked</h1>
<p>Hi {{parentName}},</p>
<p>A share link used by <strong>{{childName}}</strong> was blocked because children must be managed by their parent.</p>
<p>If you want to add {{childName}} to a trainer, please do so from your parent account at <a href="{{manageUrl}}">{{manageUrl}}</a>.</p>`,
    text: `Share Link Blocked
Hi {{parentName}},
A share link used by {{childName}} was blocked because children must be managed by their parent.
If you want to add {{childName}} to a trainer, please do so from your parent account at {{manageUrl}}.`,
  },

  'availability-override': {
    subject: 'Your availability has been overridden by a trainer',
    html: `<h1>Availability Override</h1>
<p>Hi {{coachName}},</p>
<p><strong>{{trainerName}}</strong> has overridden your availability.</p>
<p><strong>Reason:</strong> {{reason}}</p>
<p>If you have questions, please contact your trainer directly.</p>`,
    text: `Availability Override
Hi {{coachName}},
{{trainerName}} has overridden your availability.
Reason: {{reason}}
If you have questions, please contact your trainer directly.`,
  },
};

/**
 * Simple {{variable}} interpolation.
 */
function interpolate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = data[key];
    return value !== undefined && value !== null ? String(value) : match;
  });
}

/**
 * Render a template by ID, substituting `data` into all `{{variable}}` placeholders.
 *
 * @throws Error if the template ID is not found.
 */
export function renderTemplate(
  templateId: string,
  data: Record<string, unknown> = {},
): RenderedTemplate {
  const tpl = TEMPLATES[templateId];
  if (!tpl) {
    throw new Error(`Unknown email template: "${templateId}". Available: ${Object.keys(TEMPLATES).join(', ')}`);
  }

  return {
    subject: interpolate(tpl.subject, data),
    html: interpolate(tpl.html, data),
    text: interpolate(tpl.text, data),
  };
}

/**
 * Check whether a template ID is registered.
 */
export function hasTemplate(templateId: string): boolean {
  return templateId in TEMPLATES;
}

/**
 * List all registered template IDs.
 */
export function listTemplateIds(): string[] {
  return Object.keys(TEMPLATES);
}
