import { Resend } from 'resend';
import { env } from '$env/dynamic/private';

const resend = new Resend(env.RESEND_API_KEY);

export async function sendOtpEmail(email: string, otp: string) {
  await resend.emails.send({
    from: env.RESEND_FROM_EMAIL || 'TekCamp <noreply@tekcamp.fr>',
    to: email,
    subject: 'Ton code de connexion TekCamp',
    html: `
      <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
        <h2>Connexion TekCamp</h2>
        <p>Voici ton code de connexion :</p>
        <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; text-align: center; padding: 20px; background: #f4f4f4; border-radius: 8px;">${otp}</p>
        <p style="color: #666; font-size: 14px;">Ce code expire dans 10 minutes.</p>
      </div>
    `,
  });
}
