import { Resend } from 'resend';
import { env } from '$env/dynamic/private';
import { base } from '$app/paths';

let resend: Resend;

function getResend() {
  if (!resend) {
    resend = new Resend(env.RESEND_API_KEY);
  }
  return resend;
}

export async function sendParentSignatureEmail(
  parentEmail: string,
  code: string,
  studentName: string,
) {
  const signUrl = `${env.ORIGIN}${base}/parent/sign`;

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

          <p style="font-size: 16px; line-height: 1.6; margin-bottom: 10px;">Rendez-vous sur :</p>
          <p style="text-align: center; margin-bottom: 20px;">
            <a href="${signUrl}" style="color: #2563eb; font-size: 16px; font-weight: bold;">${signUrl}</a>
          </p>

          <p style="font-size: 16px; line-height: 1.6; margin-bottom: 10px;">Puis entrez ce code :</p>
          <div style="background-color: #fff7ed; border: 2px dashed #ff5f3a; border-radius: 16px; padding: 20px; text-align: center; margin-bottom: 30px;">
            <strong style="font-size: 32px; font-family: monospace; letter-spacing: 8px; color: #ff5f3a;">${code}</strong>
          </div>

          <p style="font-size: 13px; color: #94a3b8; margin-bottom: 20px;"><i>Ce code est valable 72 heures et ne peut être utilisé qu'une seule fois.</i></p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
          <p style="font-size: 14px; color: #64748b; margin: 0;">Merci,<br/>L'équipe Epitech Academy</p>
        </div>
      </div>
    `,
  });
}
