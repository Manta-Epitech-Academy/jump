/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2651147324")

  // update collection data
  unmarshal({
    "authAlert": {
      "emailTemplate": {
        "body": "<div style=\"background-color: #f8fafc; padding: 40px 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; text-align: center;\">\n  <div style=\"max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; padding: 40px 30px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border-top: 5px solid #ff5f3a; text-align: left;\">\n    <p style=\"font-size: 16px; line-height: 1.6; margin-top: 0; margin-bottom: 20px;\">Salut <strong>{RECORD:prenom}</strong>,</p>\n    <p style=\"font-size: 16px; line-height: 1.6; margin-bottom: 20px;\">Nous avons remarqué que quelqu'un s'est connecté à ton compte <strong>{APP_NAME}</strong> depuis un nouvel appareil ou un nouvel endroit :</p>\n    \n    <div style=\"background-color: #fff1f2; border-left: 4px solid #e11d48; padding: 15px; border-radius: 0 8px 8px 0; margin-bottom: 20px;\">\n      <em style=\"color: #be123c; font-size: 14px;\">{ALERT_INFO}</em>\n    </div>\n\n    <p style=\"font-size: 15px; color: #e11d48; font-weight: bold; margin-bottom: 20px;\">Si ce n'est pas toi, change immédiatement ton mot de passe pour bloquer l'accès à ton compte.</p>\n    <p style=\"font-size: 15px; line-height: 1.6; color: #475569;\">Si c'était bien toi, tout est sous contrôle, tu peux ignorer ce message !</p>\n    \n    <hr style=\"border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;\" />\n    <p style=\"font-size: 14px; color: #64748b; margin: 0;\">Prends soin de tes données,<br/>L'équipe Epitech Academy</p>\n  </div>\n</div>",
        "subject": "Alerte de sécurité : Nouvel appareil détecté 🚨"
      }
    },
    "confirmEmailChangeTemplate": {
      "body": "<div style=\"background-color: #f8fafc; padding: 40px 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; text-align: center;\">\n  <div style=\"max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; padding: 40px 30px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border-top: 5px solid #00ff97; text-align: left;\">\n    <p style=\"font-size: 16px; line-height: 1.6; margin-top: 0; margin-bottom: 20px;\">Salut <strong>{RECORD:prenom}</strong>,</p>\n    <p style=\"font-size: 16px; line-height: 1.6; margin-bottom: 30px;\">Tu as demandé à modifier ton adresse email de contact. Clique sur le bouton ci-dessous pour confirmer cette nouvelle adresse.</p>\n    <div style=\"text-align: center; margin-bottom: 30px;\">\n      <a class=\"btn\" href=\"{APP_URL}/_/#/auth/confirm-email-change/{TOKEN}\" target=\"_blank\" rel=\"noopener\" style=\"display: inline-block; background-color: #013afb; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 14px rgba(1, 58, 251, 0.3);\">Confirmer mon nouvel email</a>\n    </div>\n    <div style=\"background-color: #f1f5f9; padding: 15px; border-radius: 12px; margin-bottom: 20px;\">\n      <p style=\"font-size: 13px; color: #64748b; margin: 0;\"><i>Si tu n'as pas fait cette demande, ignore cet email pour que rien ne change sur ton compte.</i></p>\n    </div>\n    <p style=\"font-size: 14px; color: #64748b; margin: 0;\">À très vite,<br/>L'équipe Epitech Academy</p>\n  </div>\n</div>",
      "subject": "Confirme ta nouvelle adresse email {APP_NAME} 📧"
    },
    "otp": {
      "emailTemplate": {
        "body": "<div style=\"background-color: #f8fafc; padding: 40px 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; text-align: center;\">\n  <div style=\"max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; padding: 40px 30px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border-top: 5px solid #00ff97; text-align: left;\">\n    <p style=\"font-size: 16px; line-height: 1.6; margin-top: 0; margin-bottom: 20px;\">Salut <strong>{RECORD:prenom}</strong> !</p>\n    <p style=\"font-size: 16px; line-height: 1.6; margin-bottom: 20px;\">Voici ton code secret temporaire pour te connecter à ton Cockpit :</p>\n    \n    <div style=\"background-color: #fff7ed; border: 2px dashed #ff5f3a; border-radius: 16px; padding: 20px; text-align: center; margin-bottom: 30px;\">\n      <strong style=\"font-size: 32px; font-family: monospace; letter-spacing: 8px; color: #ff5f3a;\">{OTP}</strong>\n    </div>\n\n    <p style=\"font-size: 13px; color: #94a3b8; margin-bottom: 20px;\"><i>Si tu n'as pas essayé de te connecter, tu peux supprimer cet email sans t'inquiéter. Ce code expirera rapidement.</i></p>\n    <hr style=\"border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;\" />\n    <p style=\"font-size: 14px; color: #64748b; margin: 0;\">Bon atelier !<br/>L'équipe Epitech Academy</p>\n  </div>\n</div>",
        "subject": "Ton code d'accès secret pour {APP_NAME} 🔑"
      }
    },
    "resetPasswordTemplate": {
      "body": "<div style=\"background-color: #f8fafc; padding: 40px 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; text-align: center;\">\n  <div style=\"max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; padding: 40px 30px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border-top: 5px solid #00ff97; text-align: left;\">\n    <p style=\"font-size: 16px; line-height: 1.6; margin-top: 0; margin-bottom: 20px;\">Salut <strong>{RECORD:prenom}</strong>,</p>\n    <p style=\"font-size: 16px; line-height: 1.6; margin-bottom: 30px;\">Tu as oublié ton mot de passe ? Pas de panique ! Clique sur le bouton ci-dessous pour en créer un nouveau et retrouver l'accès à tes missions.</p>\n    <div style=\"text-align: center; margin-bottom: 30px;\">\n      <a class=\"btn\" href=\"{APP_URL}/_/#/auth/confirm-password-reset/{TOKEN}\" target=\"_blank\" rel=\"noopener\" style=\"display: inline-block; background-color: #013afb; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 14px rgba(1, 58, 251, 0.3);\">Réinitialiser mon mot de passe</a>\n    </div>\n    <div style=\"background-color: #f1f5f9; padding: 15px; border-radius: 12px; margin-bottom: 20px;\">\n      <p style=\"font-size: 13px; color: #64748b; margin: 0;\"><i>Si tu n'as rien demandé, tu peux simplement ignorer cet email, ton compte est en sécurité.</i></p>\n    </div>\n    <p style=\"font-size: 14px; color: #64748b; margin: 0;\">Bon code,<br/>L'équipe Epitech Academy</p>\n  </div>\n</div>",
      "subject": "Réinitialise ton mot de passe {APP_NAME} 🔐"
    },
    "verificationTemplate": {
      "body": "<div style=\"background-color: #f8fafc; padding: 40px 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; text-align: center;\">\n  <div style=\"max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; padding: 40px 30px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border-top: 5px solid #00ff97; text-align: left;\">\n    <h1 style=\"font-size: 24px; font-weight: 800; text-transform: uppercase; color: #013afb; margin-top: 0;\">TekCamp<span style=\"color: #00ff97;\">_</span></h1>\n    <p style=\"font-size: 16px; line-height: 1.6; margin-bottom: 20px;\">Salut <strong>{RECORD:prenom}</strong> ! 👋</p>\n    <p style=\"font-size: 16px; line-height: 1.6; margin-bottom: 30px;\">Bienvenue à bord de <strong>{APP_NAME}</strong>. Prêt(e) pour le décollage ? Clique sur le bouton ci-dessous pour valider ton adresse email et accéder à ton Cockpit.</p>\n    <div style=\"text-align: center; margin-bottom: 30px;\">\n      <a class=\"btn\" href=\"{APP_URL}/_/#/auth/confirm-verification/{TOKEN}\" target=\"_blank\" rel=\"noopener\" style=\"display: inline-block; background-color: #013afb; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 14px rgba(1, 58, 251, 0.3);\">Valider mon email</a>\n    </div>\n    <hr style=\"border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;\" />\n    <p style=\"font-size: 14px; color: #64748b; margin: 0;\">À très vite,<br/>L'équipe Epitech Academy</p>\n  </div>\n</div>"
    }
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2651147324")

  // update collection data
  unmarshal({
    "authAlert": {
      "emailTemplate": {
        "body": "<p>Hello,</p>\n<p>We noticed a login to your {APP_NAME} account from a new location:</p>\n<p><em>{ALERT_INFO}</em></p>\n<p><strong>If this wasn't you, you should immediately change your {APP_NAME} account password to revoke access from all other locations.</strong></p>\n<p>If this was you, you may disregard this email.</p>\n<p>\n  Thanks,<br/>\n  {APP_NAME} team\n</p>",
        "subject": "Login from a new location"
      }
    },
    "confirmEmailChangeTemplate": {
      "body": "<p>Hello,</p>\n<p>Click on the button below to confirm your new email address.</p>\n<p>\n  <a class=\"btn\" href=\"{APP_URL}/_/#/auth/confirm-email-change/{TOKEN}\" target=\"_blank\" rel=\"noopener\">Confirm new email</a>\n</p>\n<p><i>If you didn't ask to change your email address, you can ignore this email.</i></p>\n<p>\n  Thanks,<br/>\n  {APP_NAME} team\n</p>",
      "subject": "Confirm your {APP_NAME} new email address"
    },
    "otp": {
      "emailTemplate": {
        "body": "<p>Salut <strong>{RECORD:prenom}</strong> !</p>\n<p>Voici ton code secret temporaire pour te connecter à ton Cockpit : <strong style=\"font-size: 1.5em; letter-spacing: 2px;\">{OTP}</strong></p>\n<p><i>Si tu n'as pas essayé de te connecter, tu peux supprimer cet email sans t'inquiéter.</i></p>\n<p>\n  Bon atelier !<br/>\n  L'équipe Epitech\n</p>",
        "subject": "OTP for {APP_NAME}"
      }
    },
    "resetPasswordTemplate": {
      "body": "<p>Hello,</p>\n<p>Click on the button below to reset your password.</p>\n<p>\n  <a class=\"btn\" href=\"{APP_URL}/_/#/auth/confirm-password-reset/{TOKEN}\" target=\"_blank\" rel=\"noopener\">Reset password</a>\n</p>\n<p><i>If you didn't ask to reset your password, you can ignore this email.</i></p>\n<p>\n  Thanks,<br/>\n  {APP_NAME} team\n</p>",
      "subject": "Reset your {APP_NAME} password"
    },
    "verificationTemplate": {
      "body": "<div style=\"background-color: #f8fafc; padding: 40px 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; text-align: center;\">\n  <div style=\"max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; padding: 40px 30px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border-top: 5px solid #00ff97; text-align: left;\">\n    <h1 style=\"font-size: 24px; font-weight: 800; text-transform: uppercase; color: #013afb; margin-top: 0;\">TekCamp<span style=\"color: #00ff97;\">_</span></h1>\n    <p style=\"font-size: 16px; line-height: 1.6; margin-bottom: 20px;\">Salut <strong>{RECORD:prenom}</strong> ! 👋</p>\n    <p style=\"font-size: 16px; line-height: 1.6; margin-bottom: 30px;\">Bienvenue à bord de <strong>{APP_NAME}</strong>. Prêt(e) pour le décollage ? Clique sur le bouton ci-dessous pour valider ton adresse email et accéder à ton Cockpit.</p>\n    <div style=\"text-align: center; margin-bottom: 30px;\">\n      <a class=\"btn\" href=\"{APP_URL}/_/#/auth/confirm-verification/{TOKEN}\" target=\"_blank\" rel=\"noopener\" style=\"display: inline-block; background-color: #013afb; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 14px rgba(1, 58, 251, 0.3);\">Valider mon email</a>\n    </div>\n    <hr style=\"border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;\" />\n    <p style=\"font-size: 14px; color: #64748b; margin: 0;\">À très vite,<br/>L'équipe Epitech</p>\n  </div>\n</div>"
    }
  }, collection)

  return app.save(collection)
})
