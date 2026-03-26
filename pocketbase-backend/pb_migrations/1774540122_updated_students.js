/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2651147324")

  // update collection data
  unmarshal({
    "authAlert": {
      "emailTemplate": {
        "body": "<div style=\"background-color: #f8fafc; padding: 40px 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; text-align: center;\">\n  <div style=\"max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; padding: 40px 30px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border-top: 5px solid #013afb; text-align: left;\">\n    <p style=\"font-size: 16px; line-height: 1.6; margin-top: 0; margin-bottom: 20px;\">Salut <strong>{RECORD:prenom}</strong>,</p>\n    <p style=\"font-size: 16px; line-height: 1.6; margin-bottom: 20px;\">Petit message de routine pour t'informer qu'une connexion à ton compte <strong>{APP_NAME}</strong> a été détectée depuis un nouvel endroit ou appareil :</p>\n    \n    <div style=\"background-color: #f1f5f9; border-left: 4px solid #013afb; padding: 15px; border-radius: 0 8px 8px 0; margin-bottom: 20px;\">\n      <em style=\"color: #475569; font-size: 14px;\">{ALERT_INFO}</em>\n    </div>\n\n    <p style=\"font-size: 15px; line-height: 1.6; color: #1e293b;\"><strong>C'est bien toi ?</strong> Super, tu n'as absolument rien à faire !</p>\n    <p style=\"font-size: 14px; line-height: 1.6; color: #64748b;\">Si tu ne reconnais pas cette connexion en revanche, nous te conseillons de modifier ton mot de passe pour sécuriser ton compte.</p>\n    \n    <hr style=\"border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;\" />\n    <p style=\"font-size: 14px; color: #64748b; margin: 0;\">À bientôt,<br/>L'équipe Epitech Academy</p>\n  </div>\n</div>",
        "subject": "Nouvelle connexion à ton compte {APP_NAME} 👀"
      }
    }
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2651147324")

  // update collection data
  unmarshal({
    "authAlert": {
      "emailTemplate": {
        "body": "<div style=\"background-color: #f8fafc; padding: 40px 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; text-align: center;\">\n  <div style=\"max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; padding: 40px 30px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border-top: 5px solid #ff5f3a; text-align: left;\">\n    <p style=\"font-size: 16px; line-height: 1.6; margin-top: 0; margin-bottom: 20px;\">Salut <strong>{RECORD:prenom}</strong>,</p>\n    <p style=\"font-size: 16px; line-height: 1.6; margin-bottom: 20px;\">Nous avons remarqué que quelqu'un s'est connecté à ton compte <strong>{APP_NAME}</strong> depuis un nouvel appareil ou un nouvel endroit :</p>\n    \n    <div style=\"background-color: #fff1f2; border-left: 4px solid #e11d48; padding: 15px; border-radius: 0 8px 8px 0; margin-bottom: 20px;\">\n      <em style=\"color: #be123c; font-size: 14px;\">{ALERT_INFO}</em>\n    </div>\n\n    <p style=\"font-size: 15px; color: #e11d48; font-weight: bold; margin-bottom: 20px;\">Si ce n'est pas toi, change immédiatement ton mot de passe pour bloquer l'accès à ton compte.</p>\n    <p style=\"font-size: 15px; line-height: 1.6; color: #475569;\">Si c'était bien toi, tout est sous contrôle, tu peux ignorer ce message !</p>\n    \n    <hr style=\"border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;\" />\n    <p style=\"font-size: 14px; color: #64748b; margin: 0;\">Prends soin de tes données,<br/>L'équipe Epitech Academy</p>\n  </div>\n</div>",
        "subject": "Alerte de sécurité : Nouvel appareil détecté 🚨"
      }
    }
  }, collection)

  return app.save(collection)
})
