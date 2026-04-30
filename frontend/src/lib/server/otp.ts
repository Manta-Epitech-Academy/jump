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

export async function sendOtpEmail(email: string, otp: string, name?: string) {
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

export async function sendParentWelcomeEmail(
  email: string,
  parentName: string,
  childName: string,
) {
  const displayName =
    parentName.charAt(0).toUpperCase() + parentName.slice(1).toLowerCase();
  const loginUrl = `${env.ORIGIN}${base}/parent/login`;
  await getResend().emails.send({
    from: env.RESEND_FROM_EMAIL || 'Jump <noreply@jump.fr>',
    to: email,
    subject: `${childName} participe à Epitech Academy — votre accès parent`,
    text: `Bonjour Mr/Mme ${displayName},\n\nVotre enfant ${childName} a bien été inscrit à un stage Epitech Academy. Nous sommes ravis de l'accueillir !\n\nEn tant que responsable légal, nous avons besoin de votre autorisation pour le droit à l'image avant le début du stage. Cela ne prend qu'une minute.\n\nSignez le droit à l'image ici : ${loginUrl}\n\nCet espace vous permet également de suivre la progression de ${childName} et de consulter le programme des activités.\n\nÀ très vite,\nL'équipe Epitech Academy`,
    html: `
      <div style="background-color: #f8fafc; padding: 40px 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; text-align: center;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; padding: 40px 30px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border-top: 5px solid #00ff97; text-align: left;">
          <p style="font-size: 16px; line-height: 1.6; margin-top: 0; margin-bottom: 20px;">Bonjour <strong>Mr/Mme ${displayName}</strong>,</p>
          <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Votre enfant <strong>${childName}</strong> vient de s'inscrire à un stage <strong>Epitech Academy</strong>. Nous sommes ravis de l'accueillir !</p>
          <p style="font-size: 16px; line-height: 1.6; margin-bottom: 24px;">En tant que responsable légal, nous avons besoin de votre <strong>autorisation pour le droit à l'image</strong> avant le début du stage. Cela ne prend qu'une minute.</p>

          <div style="text-align: center; margin-bottom: 30px;">
            <a href="${loginUrl}" style="display: inline-block; background-color: #013afb; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 12px;">Signer le droit à l'image &rarr;</a>
          </div>

          <p style="font-size: 16px; line-height: 1.6; color: #1e293b; margin-bottom: 20px;">Cet espace vous permet également de suivre la progression de ${childName} et de consulter le programme des activités.</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
          <p style="font-size: 16px; line-height: 1.6; color: #1e293b; margin: 0;">À très vite,<br/>L'équipe Epitech Academy</p>
        </div>
      </div>
    `,
  });
}

export async function sendParentOtpEmail(
  email: string,
  otp: string,
  name?: string,
) {
  const displayName = name || 'Parent';
  const loginUrl = `${env.ORIGIN}${base}/parent/login`;
  await getResend().emails.send({
    from: env.RESEND_FROM_EMAIL || 'Jump <noreply@jump.fr>',
    to: email,
    subject: "Votre code d'accès Jump — Espace Parent",
    text: `Bonjour ${displayName},\n\nVoici votre code de connexion à l'Espace Parent Jump :\n\n${otp}\n\nCe code est valable 10 minutes.\n\nConnectez-vous ici : ${loginUrl}\n\nSi vous n'avez pas demandé ce code, vous pouvez ignorer cet email.\n\nCordialement,\nL'équipe Epitech Academy`,
    html: `
      <div style="background-color: #f8fafc; padding: 40px 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; text-align: center;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; padding: 40px 30px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border-top: 5px solid #00ff97; text-align: left;">
          <p style="font-size: 16px; line-height: 1.6; margin-top: 0; margin-bottom: 20px;">Bonjour <strong>${displayName}</strong>,</p>
          <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Voici votre code de connexion à l'Espace Parent :</p>

          <div style="background-color: #fff7ed; border: 2px dashed #ff5f3a; border-radius: 16px; padding: 20px; text-align: center; margin-bottom: 30px;">
            <strong style="font-size: 32px; font-family: monospace; letter-spacing: 8px; color: #ff5f3a;">${otp}</strong>
          </div>

          <p style="font-size: 14px; line-height: 1.6; margin-bottom: 20px;">Ce code est valable <strong>10 minutes</strong>.</p>
          <p style="font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
            <a href="${loginUrl}" style="color: #ff5f3a; text-decoration: underline;">Se connecter à l'Espace Parent</a>
          </p>
          <p style="font-size: 13px; color: #94a3b8; margin-bottom: 20px;"><i>Si vous n'avez pas demandé ce code, vous pouvez ignorer cet email.</i></p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
          <p style="font-size: 14px; color: #64748b; margin: 0;">Cordialement,<br/>L'équipe Epitech Academy</p>
        </div>
      </div>
    `,
  });
}

export async function sendStudentReminderEmail(
  email: string,
  studentName: string,
) {
  const displayName =
    studentName.charAt(0).toUpperCase() + studentName.slice(1).toLowerCase();
  const onboardingUrl = `${env.ORIGIN}${base}/onboarding`;
  await getResend().emails.send({
    from: env.RESEND_FROM_EMAIL || 'Jump <noreply@jump.fr>',
    to: email,
    subject: 'Finalise ton inscription sur Jump',
    text: `Salut ${displayName} !\n\nTon inscription sur Jump n'est pas encore terminée. Il ne te reste que quelques étapes pour accéder à ton espace.\n\nFinalise ton inscription ici : ${onboardingUrl}\n\nÀ très vite,\nL'équipe Epitech Academy`,
    html: `
      <div style="background-color: #f8fafc; padding: 40px 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; text-align: center;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; padding: 40px 30px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border-top: 5px solid #00ff97; text-align: left;">
          <p style="font-size: 16px; line-height: 1.6; margin-top: 0; margin-bottom: 20px;">Salut <strong>${displayName}</strong> !</p>
          <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Ton inscription sur <strong>Jump</strong> n'est pas encore terminée. Il ne te reste que quelques étapes pour accéder à ton espace.</p>
          <div style="text-align: center; margin-bottom: 30px;">
            <a href="${onboardingUrl}" style="display: inline-block; background-color: #013afb; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 12px;">Finaliser mon inscription &rarr;</a>
          </div>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
          <p style="font-size: 14px; color: #64748b; margin: 0;">À très vite,<br/>L'équipe Epitech Academy</p>
        </div>
      </div>
    `,
  });
}

export async function sendParentReminderEmail(
  email: string,
  parentName: string,
  childName: string,
) {
  const displayName =
    parentName.charAt(0).toUpperCase() + parentName.slice(1).toLowerCase();
  const loginUrl = `${env.ORIGIN}${base}/parent/login`;
  await getResend().emails.send({
    from: env.RESEND_FROM_EMAIL || 'Jump <noreply@jump.fr>',
    to: email,
    subject: `Rappel : signez le droit à l'image de ${childName}`,
    text: `Bonjour Mr/Mme ${displayName},\n\nNous n'avons pas encore reçu votre autorisation pour le droit à l'image de ${childName} dans le cadre de son stage Epitech Academy.\n\nCette signature est nécessaire avant le début du stage et ne prend qu'une minute.\n\nSignez le droit à l'image ici : ${loginUrl}\n\nCordialement,\nL'équipe Epitech Academy`,
    html: `
      <div style="background-color: #f8fafc; padding: 40px 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; text-align: center;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; padding: 40px 30px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border-top: 5px solid #00ff97; text-align: left;">
          <p style="font-size: 16px; line-height: 1.6; margin-top: 0; margin-bottom: 20px;">Bonjour <strong>Mr/Mme ${displayName}</strong>,</p>
          <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Nous n'avons pas encore reçu votre autorisation pour le <strong>droit à l'image</strong> de <strong>${childName}</strong> dans le cadre de son stage Epitech Academy.</p>
          <p style="font-size: 16px; line-height: 1.6; margin-bottom: 24px;">Cette signature est nécessaire avant le début du stage et ne prend qu'une minute.</p>
          <div style="text-align: center; margin-bottom: 30px;">
            <a href="${loginUrl}" style="display: inline-block; background-color: #013afb; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 12px;">Signer le droit à l'image &rarr;</a>
          </div>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
          <p style="font-size: 14px; color: #64748b; margin: 0;">Cordialement,<br/>L'équipe Epitech Academy</p>
        </div>
      </div>
    `,
  });
}
