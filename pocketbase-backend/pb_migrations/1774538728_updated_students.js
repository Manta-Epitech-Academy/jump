/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2651147324")

  // update collection data
  unmarshal({
    "otp": {
      "emailTemplate": {
        "body": "<p>Salut <strong>{RECORD:prenom}</strong> !</p>\n<p>Voici ton code secret temporaire pour te connecter à ton Cockpit : <strong style=\"font-size: 1.5em; letter-spacing: 2px;\">{OTP}</strong></p>\n<p><i>Si tu n'as pas essayé de te connecter, tu peux supprimer cet email sans t'inquiéter.</i></p>\n<p>\n  Bon atelier !<br/>\n  L'équipe Epitech\n</p>"
      }
    }
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2651147324")

  // update collection data
  unmarshal({
    "otp": {
      "emailTemplate": {
        "body": "<p>Hello,</p>\n<p>Your one-time passwssord is: <strong>{OTP}</strong></p>\n<p><i>If you didn't ask for the one-time password, you can ignore this email.</i></p>\n<p>\n  Thanks,<br/>\n  {APP_NAME} team\n</p>"
      }
    }
  }, collection)

  return app.save(collection)
})
