/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2651147324")

  // update collection data
  unmarshal({
    "verificationTemplate": {
      "body": "<div style=\"background-color: #f8fafc; padding: 40px 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; text-align: center;\">\n  <div style=\"max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; padding: 40px 30px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border-top: 5px solid #00ff97; text-align: left;\">\n    <h1 style=\"font-size: 24px; font-weight: 800; text-transform: uppercase; color: #013afb; margin-top: 0;\">TekCamp<span style=\"color: #00ff97;\">_</span></h1>\n    <p style=\"font-size: 16px; line-height: 1.6; margin-bottom: 20px;\">Salut <strong>{RECORD:prenom}</strong> ! 👋</p>\n    <p style=\"font-size: 16px; line-height: 1.6; margin-bottom: 30px;\">Bienvenue à bord de <strong>{APP_NAME}</strong>. Prêt(e) pour le décollage ? Clique sur le bouton ci-dessous pour valider ton adresse email et accéder à ton Cockpit.</p>\n    <div style=\"text-align: center; margin-bottom: 30px;\">\n      <a class=\"btn\" href=\"{APP_URL}/_/#/auth/confirm-verification/{TOKEN}\" target=\"_blank\" rel=\"noopener\" style=\"display: inline-block; background-color: #013afb; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 14px rgba(1, 58, 251, 0.3);\">Valider mon email</a>\n    </div>\n    <hr style=\"border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;\" />\n    <p style=\"font-size: 14px; color: #64748b; margin: 0;\">À très vite,<br/>L'équipe Epitech</p>\n  </div>\n</div>",
      "subject": "Valide ton adresse email pour {APP_NAME} 🚀"
    }
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2651147324")

  // update collection data
  unmarshal({
    "verificationTemplate": {
      "body": "<p>Hello,</p>\n<p>Thank you for joining us at {APP_NAME}.</p>\n<p>Click on the button below to verify your email address.</p>\n<p>\n  <a class=\"btn\" href=\"{APP_URL}/_/#/auth/confirm-verification/{TOKEN}\" target=\"_blank\" rel=\"noopener\">Verify</a>\n</p>\n<p>\n  Thanks,<br/>\n  {APP_NAME} team\n</p>",
      "subject": "Verify your {APP_NAME} email"
    }
  }, collection)

  return app.save(collection)
})
