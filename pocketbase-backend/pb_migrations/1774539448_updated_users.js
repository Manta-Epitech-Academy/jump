/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  // update collection data
  unmarshal({
    "authAlert": {
      "emailTemplate": {
        "body": "<div style=\"background-color: #f1f5f9; padding: 40px 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #0f172a;\">\n  <div style=\"max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 4px; padding: 30px; border-top: 4px solid #fa5252; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;\">\n    <h2 style=\"font-size: 18px; font-weight: bold; color: #fa5252; margin-top: 0; text-transform: uppercase;\">Alerte de Sécurité</h2>\n    <p style=\"font-size: 15px; line-height: 1.6;\">Bonjour <strong>{RECORD:name}</strong>,</p>\n    <p style=\"font-size: 15px; line-height: 1.6;\">Nous avons détecté une connexion à votre compte administrateur/staff <strong>{APP_NAME}</strong> depuis un emplacement ou un appareil non reconnu :</p>\n    \n    <div style=\"background-color: #f8f9fa; border: 1px solid #e9ecef; padding: 15px; font-family: monospace; font-size: 13px; color: #495057; margin: 20px 0;\">\n      {ALERT_INFO}\n    </div>\n\n    <p style=\"font-size: 14px; line-height: 1.6; color: #c92a2a; font-weight: bold;\">Si vous n'êtes pas à l'origine de cette connexion, nous vous recommandons de modifier immédiatement votre mot de passe afin de révoquer l'accès à toute autre session active.</p>\n    <p style=\"font-size: 14px; line-height: 1.6;\">Si cette connexion est légitime, vous pouvez ignorer cet email en toute sécurité.</p>\n    \n    <p style=\"font-size: 13px; color: #64748b; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px;\">Cordialement,<br/>L'équipe Epitech Academy</p>\n  </div>\n</div>",
        "subject": "Alerte de sécurité : Nouvelle connexion détectée - {APP_NAME}"
      },
      "enabled": true
    },
    "confirmEmailChangeTemplate": {
      "body": "<div style=\"background-color: #f1f5f9; padding: 40px 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #0f172a;\">\n  <div style=\"max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 4px; padding: 30px; border-top: 4px solid #013afb; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;\">\n    <p style=\"font-size: 15px; line-height: 1.6; margin-top: 0;\">Bonjour <strong>{RECORD:name}</strong>,</p>\n    <p style=\"font-size: 15px; line-height: 1.6;\">Vous avez initié une procédure de modification de votre adresse email sur <strong>{APP_NAME}</strong>. Veuillez cliquer sur le lien ci-dessous pour confirmer cette nouvelle adresse.</p>\n    <p style=\"margin: 25px 0;\">\n      <a class=\"btn\" href=\"{APP_URL}/_/#/auth/confirm-email-change/{TOKEN}\" target=\"_blank\" rel=\"noopener\" style=\"display: inline-block; background-color: #013afb; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 4px; font-weight: bold; font-size: 14px;\">Confirmer la nouvelle adresse</a>\n    </p>\n    <p style=\"font-size: 13px; color: #64748b;\"><i>Si vous n'avez pas demandé ce changement, aucune action n'est requise de votre part.</i></p>\n    <p style=\"font-size: 13px; color: #64748b; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px;\">Cordialement,<br/>L'équipe Epitech Academy</p>\n  </div>\n</div>",
      "subject": "Confirmation de changement d'adresse email - {APP_NAME}"
    },
    "otp": {
      "emailTemplate": {
        "body": "<div style=\"background-color: #f1f5f9; padding: 40px 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #0f172a;\">\n  <div style=\"max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 4px; padding: 30px; border-top: 4px solid #013afb; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;\">\n    <p style=\"font-size: 15px; line-height: 1.6; margin-top: 0;\">Bonjour <strong>{RECORD:name}</strong>,</p>\n    <p style=\"font-size: 15px; line-height: 1.6;\">Voici votre code d'authentification unique pour accéder à l'interface de gestion de <strong>{APP_NAME}</strong> :</p>\n    \n    <div style=\"background-color: #f8fafc; border-left: 4px solid #013afb; padding: 15px 20px; margin: 20px 0;\">\n      <strong style=\"font-family: monospace; font-size: 24px; letter-spacing: 4px; color: #0f172a;\">{OTP}</strong>\n    </div>\n\n    <p style=\"font-size: 13px; color: #64748b;\"><i>Si vous n'êtes pas à l'origine de cette demande de connexion, veuillez ignorer ce message.</i></p>\n    <p style=\"font-size: 13px; color: #64748b; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px;\">Cordialement,<br/>L'équipe Epitech Academy</p>\n  </div>\n</div>",
        "subject": "Code d'authentification (OTP) - {APP_NAME}"
      }
    },
    "resetPasswordTemplate": {
      "body": "<div style=\"background-color: #f1f5f9; padding: 40px 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #0f172a;\">\n  <div style=\"max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 4px; padding: 30px; border-top: 4px solid #013afb; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;\">\n    <p style=\"font-size: 15px; line-height: 1.6; margin-top: 0;\">Bonjour <strong>{RECORD:name}</strong>,</p>\n    <p style=\"font-size: 15px; line-height: 1.6;\">Une demande de réinitialisation de mot de passe a été effectuée pour votre compte sur <strong>{APP_NAME}</strong>. Cliquez sur le lien ci-dessous pour définir un nouveau mot de passe.</p>\n    <p style=\"margin: 25px 0;\">\n      <a class=\"btn\" href=\"{APP_URL}/_/#/auth/confirm-password-reset/{TOKEN}\" target=\"_blank\" rel=\"noopener\" style=\"display: inline-block; background-color: #013afb; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 4px; font-weight: bold; font-size: 14px;\">Réinitialiser le mot de passe</a>\n    </p>\n    <p style=\"font-size: 13px; color: #64748b;\"><i>Si vous n'êtes pas à l'origine de cette demande, veuillez ignorer cet email.</i></p>\n    <p style=\"font-size: 13px; color: #64748b; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px;\">Cordialement,<br/>L'équipe Epitech Academy</p>\n  </div>\n</div>",
      "subject": "Réinitialisation de votre mot de passe - {APP_NAME}"
    },
    "verificationTemplate": {
      "body": "<div style=\"background-color: #f1f5f9; padding: 40px 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #0f172a;\">\n  <div style=\"max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 4px; padding: 30px; border-top: 4px solid #013afb; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;\">\n    <h2 style=\"font-size: 20px; font-weight: bold; color: #0f172a; margin-top: 0; text-transform: uppercase;\">{APP_NAME}</h2>\n    <p style=\"font-size: 15px; line-height: 1.6;\">Bonjour <strong>{RECORD:name}</strong>,</p>\n    <p style=\"font-size: 15px; line-height: 1.6;\">Merci d'avoir rejoint la plateforme. Veuillez cliquer sur le bouton ci-dessous pour vérifier votre adresse email et finaliser l'activation de votre compte administrateur.</p>\n    <p style=\"margin: 25px 0;\">\n      <a class=\"btn\" href=\"{APP_URL}/_/#/auth/confirm-verification/{TOKEN}\" target=\"_blank\" rel=\"noopener\" style=\"display: inline-block; background-color: #013afb; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 4px; font-weight: bold; font-size: 14px;\">Vérifier mon email</a>\n    </p>\n    <p style=\"font-size: 13px; color: #64748b; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px;\">Cordialement,<br/>L'équipe Epitech Academy</p>\n  </div>\n</div>",
      "subject": "Vérification de votre adresse email - {APP_NAME}"
    }
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  // update collection data
  unmarshal({
    "authAlert": {
      "emailTemplate": {
        "body": "<p>Hello,</p>\n<p>We noticed a login to your {APP_NAME} account from a new location:</p>\n<p><em>{ALERT_INFO}</em></p>\n<p><strong>If this wasn't you, you should immediately change your {APP_NAME} account password to revoke access from all other locations.</strong></p>\n<p>If this was you, you may disregard this email.</p>\n<p>\n  Thanks,<br/>\n  {APP_NAME} team\n</p>",
        "subject": "Login from a new location"
      },
      "enabled": false
    },
    "confirmEmailChangeTemplate": {
      "body": "<p>Hello,</p>\n<p>Click on the button below to confirm your new email address.</p>\n<p>\n  <a class=\"btn\" href=\"{APP_URL}/_/#/auth/confirm-email-change/{TOKEN}\" target=\"_blank\" rel=\"noopener\">Confirm new email</a>\n</p>\n<p><i>If you didn't ask to change your email address, you can ignore this email.</i></p>\n<p>\n  Thanks,<br/>\n  {APP_NAME} team\n</p>",
      "subject": "Confirm your {APP_NAME} new email address"
    },
    "otp": {
      "emailTemplate": {
        "body": "<p>Hello,</p>\n<p>Your one-time password is: <strong>{OTP}</strong></p>\n<p><i>If you didn't ask for the one-time password, you can ignore this email.</i></p>\n<p>\n  Thanks,<br/>\n  {APP_NAME} team\n</p>",
        "subject": "OTP for {APP_NAME}"
      }
    },
    "resetPasswordTemplate": {
      "body": "<p>Hello,</p>\n<p>Click on the button below to reset your password.</p>\n<p>\n  <a class=\"btn\" href=\"{APP_URL}/_/#/auth/confirm-password-reset/{TOKEN}\" target=\"_blank\" rel=\"noopener\">Reset password</a>\n</p>\n<p><i>If you didn't ask to reset your password, you can ignore this email.</i></p>\n<p>\n  Thanks,<br/>\n  {APP_NAME} team\n</p>",
      "subject": "Reset your {APP_NAME} password"
    },
    "verificationTemplate": {
      "body": "<p>Hello,</p>\n<p>Thank you for joining us at {APP_NAME}.</p>\n<p>Click on the button below to verify your email address.</p>\n<p>\n  <a class=\"btn\" href=\"{APP_URL}/_/#/auth/confirm-verification/{TOKEN}\" target=\"_blank\" rel=\"noopener\">Verify</a>\n</p>\n<p>\n  Thanks,<br/>\n  {APP_NAME} team\n</p>",
      "subject": "Verify your {APP_NAME} email"
    }
  }, collection)

  return app.save(collection)
})
