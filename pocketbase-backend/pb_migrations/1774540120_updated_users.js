/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  // update collection data
  unmarshal({
    "authAlert": {
      "emailTemplate": {
        "body": "<div style=\"background-color: #f1f5f9; padding: 40px 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #0f172a;\">\n  <div style=\"max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 4px; padding: 30px; border-top: 4px solid #013afb; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;\">\n    <h2 style=\"font-size: 18px; font-weight: bold; color: #013afb; margin-top: 0; text-transform: uppercase;\">Avis de connexion</h2>\n    <p style=\"font-size: 15px; line-height: 1.6;\">Bonjour <strong>{RECORD:name}</strong>,</p>\n    <p style=\"font-size: 15px; line-height: 1.6;\">Nous vous informons qu'une connexion à votre compte <strong>{APP_NAME}</strong> a été détectée depuis un nouvel emplacement ou appareil :</p>\n    \n    <div style=\"background-color: #f8f9fa; border: 1px solid #e9ecef; border-left: 4px solid #013afb; padding: 15px; font-family: monospace; font-size: 13px; color: #495057; margin: 20px 0;\">\n      {ALERT_INFO}\n    </div>\n\n    <p style=\"font-size: 14px; line-height: 1.6; color: #0f172a;\">S'il s'agit bien de vous, aucune action n'est requise de votre part.</p>\n    <p style=\"font-size: 14px; line-height: 1.6; color: #475569;\">Dans le cas contraire, nous vous invitons à modifier votre mot de passe par précaution afin de sécuriser votre accès.</p>\n    \n    <p style=\"font-size: 13px; color: #64748b; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px;\">Cordialement,<br/>L'équipe Epitech Academy</p>\n  </div>\n</div>",
        "subject": "Information : Nouvelle connexion à votre compte - {APP_NAME}"
      }
    }
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  // update collection data
  unmarshal({
    "authAlert": {
      "emailTemplate": {
        "body": "<div style=\"background-color: #f1f5f9; padding: 40px 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #0f172a;\">\n  <div style=\"max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 4px; padding: 30px; border-top: 4px solid #fa5252; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;\">\n    <h2 style=\"font-size: 18px; font-weight: bold; color: #fa5252; margin-top: 0; text-transform: uppercase;\">Alerte de Sécurité</h2>\n    <p style=\"font-size: 15px; line-height: 1.6;\">Bonjour <strong>{RECORD:name}</strong>,</p>\n    <p style=\"font-size: 15px; line-height: 1.6;\">Nous avons détecté une connexion à votre compte administrateur/staff <strong>{APP_NAME}</strong> depuis un emplacement ou un appareil non reconnu :</p>\n    \n    <div style=\"background-color: #f8f9fa; border: 1px solid #e9ecef; padding: 15px; font-family: monospace; font-size: 13px; color: #495057; margin: 20px 0;\">\n      {ALERT_INFO}\n    </div>\n\n    <p style=\"font-size: 14px; line-height: 1.6; color: #c92a2a; font-weight: bold;\">Si vous n'êtes pas à l'origine de cette connexion, nous vous recommandons de modifier immédiatement votre mot de passe afin de révoquer l'accès à toute autre session active.</p>\n    <p style=\"font-size: 14px; line-height: 1.6;\">Si cette connexion est légitime, vous pouvez ignorer cet email en toute sécurité.</p>\n    \n    <p style=\"font-size: 13px; color: #64748b; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px;\">Cordialement,<br/>L'équipe Epitech Academy</p>\n  </div>\n</div>",
        "subject": "Alerte de sécurité : Nouvelle connexion détectée - {APP_NAME}"
      }
    }
  }, collection)

  return app.save(collection)
})
