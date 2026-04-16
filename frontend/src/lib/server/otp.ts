import { Resend } from 'resend';
import { env } from '$env/dynamic/private';

let resend: Resend;

function getResend() {
  if (!resend) {
    resend = new Resend(env.RESEND_API_KEY);
  }
  return resend;
}

export async function sendOtpEmail(
  email: string,
  otp: string,
  name?: string,
) {
  const displayName = name || 'futur·e codeur·se';
  await getResend().emails.send({
    from: env.RESEND_FROM_EMAIL || 'Jump <noreply@jump.fr>',
    to: email,
    subject: "Ton code d'accès secret pour Jump 🔑",
    text: `Salut ${displayName} !\n\nVoici ton code secret temporaire pour te connecter à ton Cockpit :\n\n${otp}\n\nSi tu n'as pas essayé de te connecter, tu peux supprimer cet email sans t'inquiéter. Ce code expirera rapidement.\n\nBon atelier !\nL'équipe Epitech Academy`,
    html: `
      <div style="background-color: #f8fafc; padding: 40px 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; text-align: center;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; padding: 40px 30px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border-top: 5px solid #00ff97; text-align: left;">
          <p style="font-size: 16px; line-height: 1.6; margin-top: 0; margin-bottom: 20px;">Salut <strong>${displayName}</strong> !</p>
          <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Voici ton code secret temporaire pour te connecter à ton Cockpit :</p>

          <div style="background-color: #fff7ed; border: 2px dashed #ff5f3a; border-radius: 16px; padding: 20px; text-align: center; margin-bottom: 30px;">
            <strong style="font-size: 32px; font-family: monospace; letter-spacing: 8px; color: #ff5f3a;">${otp}</strong>
          </div>

          <p style="font-size: 13px; color: #94a3b8; margin-bottom: 20px;"><i>Si tu n'as pas essayé de te connecter, tu peux supprimer cet email sans t'inquiéter. Ce code expirera rapidement.</i></p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
          <p style="font-size: 14px; color: #64748b; margin: 0;">Bon atelier !<br/>L'équipe Epitech Academy</p>
        </div>
      </div>
    `,
  });
}
