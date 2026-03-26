/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  // update collection data
  unmarshal({
    "verificationTemplate": {
      "body": "<div style=\"background-color: #f1f5f9; padding: 40px 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #0f172a;\">\n  <div style=\"max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 4px; padding: 30px; border-top: 4px solid #013afb; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;\">\n    <h2 style=\"font-size: 20px; font-weight: bold; color: #0f172a; margin-top: 0; text-transform: uppercase;\">{APP_NAME}</h2>\n    <p style=\"font-size: 15px; line-height: 1.6;\">Bonjour <strong>{RECORD:name}</strong>,</p>\n    <p style=\"font-size: 15px; line-height: 1.6;\">Merci d'avoir rejoint la plateforme. Veuillez cliquer sur le bouton ci-dessous pour vérifier votre adresse email et finaliser l'activation de votre compte administrateur.</p>\n    <p style=\"margin: 25px 0;\">\n      <a class=\"btn\" href=\"{APP_URL}/_/#/auth/confirm-verification/{TOKEN}\" target=\"_blank\" rel=\"noopener\" style=\"display: inline-block; background-color: #013afb !important; color: #ffffff !important; text-decoration: none !important; padding: 10px 20px !important; border-radius: 4px !important; font-weight: bold; font-size: 14px; line-height: normal !important; font-family: inherit !important;\">Vérifier mon email</a>\n    </p>\n    <p style=\"font-size: 13px; color: #64748b; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px;\">Cordialement,<br/>L'équipe Epitech Academy</p>\n  </div>\n</div>"
    }
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  // update collection data
  unmarshal({
    "verificationTemplate": {
      "body": "<div style=\"background-color: #f1f5f9; padding: 40px 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #0f172a;\">\n  <div style=\"max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 4px; padding: 30px; border-top: 4px solid #013afb; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;\">\n    <h2 style=\"font-size: 20px; font-weight: bold; color: #0f172a; margin-top: 0; text-transform: uppercase;\">{APP_NAME}</h2>\n    <p style=\"font-size: 15px; line-height: 1.6;\">Bonjour <strong>{RECORD:name}</strong>,</p>\n    <p style=\"font-size: 15px; line-height: 1.6;\">Merci d'avoir rejoint la plateforme. Veuillez cliquer sur le bouton ci-dessous pour vérifier votre adresse email et finaliser l'activation de votre compte administrateur.</p>\n    <p style=\"margin: 25px 0;\">\n      <a class=\"btn\" href=\"{APP_URL}/_/#/auth/confirm-verification/{TOKEN}\" target=\"_blank\" rel=\"noopener\" style=\"display: inline-block; background-color: #013afb; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 4px; font-weight: bold; font-size: 14px;\">Vérifier mon email</a>\n    </p>\n    <p style=\"font-size: 13px; color: #64748b; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px;\">Cordialement,<br/>L'équipe Epitech Academy</p>\n  </div>\n</div>"
    }
  }, collection)

  return app.save(collection)
})
