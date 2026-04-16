import { Resend } from 'resend';
import { env } from '$env/dynamic/private';
import { base } from '$app/paths';
import { pendingParentOtps } from '$lib/server/auth';

let resend: Resend;

function getResend() {
  if (!resend) {
    resend = new Resend(env.RESEND_API_KEY);
  }
  return resend;
}

export async function sendParentSignatureEmail(
  parentEmail: string,
  talentId: string,
  studentName: string,
) {
  const signUrl = `${env.ORIGIN}${base}/parent/sign?student=${talentId}`;
  const otp = pendingParentOtps.get(parentEmail);
  pendingParentOtps.delete(parentEmail);

  await getResend().emails.send({
    from: env.RESEND_FROM_EMAIL || 'Jump <noreply@jump.fr>',
    to: parentEmail,
    subject: "Autorisation de droit à l'image — Epitech Academy",
    html: `
      <div style="background-color: #f8fafc; padding: 40px 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; text-align: center;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; padding: 40px 30px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border-top: 5px solid #00ff97; text-align: left;">
          <p style="font-size: 16px; line-height: 1.6; margin-top: 0; margin-bottom: 20px;">Bonjour,</p>
          <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
            Votre enfant <strong>${studentName}</strong> participe aux ateliers Epitech Academy.
            Pour finaliser son inscription, nous avons besoin de votre autorisation concernant le droit à l'image.
          </p>

          <p style="font-size: 16px; line-height: 1.6; margin-bottom: 10px;">Rendez-vous sur le lien ci-dessous :</p>
          <p style="text-align: center; margin-bottom: 20px;">
            <a href="${signUrl}" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 14px 28px; border-radius: 12px; font-size: 16px; font-weight: bold; text-decoration: none;">Signer l'autorisation</a>
          </p>

          ${
            otp
              ? `
          <p style="font-size: 16px; line-height: 1.6; margin-bottom: 10px;">Puis entrez ce code de connexion :</p>
          <div style="background-color: #fff7ed; border: 2px dashed #ff5f3a; border-radius: 16px; padding: 20px; text-align: center; margin-bottom: 30px;">
            <strong style="font-size: 32px; font-family: monospace; letter-spacing: 8px; color: #ff5f3a;">${otp}</strong>
          </div>
          <p style="font-size: 13px; color: #94a3b8; margin-bottom: 20px;"><i>Ce code est valable 10 minutes.</i></p>
          `
              : ''
          }

          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
          <p style="font-size: 14px; color: #64748b; margin: 0;">Merci,<br/>L'équipe Epitech Academy</p>
        </div>
      </div>
    `,
  });
}
