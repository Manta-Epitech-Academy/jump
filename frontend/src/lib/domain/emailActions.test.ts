import { describe, expect, it } from 'vitest';
import {
  EMAIL_ACTION_KEYS,
  EMAIL_ACTIONS,
  missingRequiredVariables,
} from './emailActions';

// A template linked to a transactional action is trusted to say what the action
// is for. These are the cases where it cannot, and the admin API refuses them.
describe('missingRequiredVariables', () => {
  it('names the login code a login mail does not carry', () => {
    expect(
      missingRequiredVariables('otp_talent', {
        subject: 'Ton accès à Jump',
        body: 'Bonjour {{prenom}}, à bientôt !',
      }),
    ).toEqual(['otp_code']);
  });

  it('accepts the variable in the subject as well as in the body', () => {
    expect(
      missingRequiredVariables('otp_parent', {
        subject: 'Votre code : {{otp_code}}',
        body: 'Bonjour {{parent_prenom}}.',
      }),
    ).toEqual([]);
  });

  it('asks a refusal to give its reason, as RGPD art. 12(4) does', () => {
    expect(
      missingRequiredVariables('account_deletion_refused', {
        subject: null,
        body: 'Ta demande a été refusée.',
      }),
    ).toEqual(['deletion_reason']);
  });

  it('only ever requires a variable the action offers', () => {
    for (const key of EMAIL_ACTION_KEYS) {
      const offered: readonly string[] = EMAIL_ACTIONS[key].variables;
      for (const required of EMAIL_ACTIONS[key].requiredVariables) {
        expect(offered, key).toContain(required);
      }
    }
  });
});
