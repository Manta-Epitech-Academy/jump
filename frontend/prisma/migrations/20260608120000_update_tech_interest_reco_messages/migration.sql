-- Refresh three REC-005 tech-interest recommendation messages to the latest
-- copy. The catalogue (`prisma/catalogs.ts`) is create-only and never updates
-- existing rows, so this migration carries the change to already-seeded DBs.
--
-- Each UPDATE is guarded on the PRIOR message value: a row whose message was
-- edited by staff (via /staff/admin/interests) or whose interest was renamed
-- simply doesn't match and is left untouched. No-clobber, idempotent.

UPDATE "Interest"
SET "recommendationMessage" = '{prenom} a montré un intérêt pour la création d''**applications**. Proposez-lui un atelier de maquettage d''application mobile (Figma).'
WHERE "nom" = 'Créer des apps'
  AND "recommendationMessage" = '{prenom} a montré un intérêt pour la création d''**applications**. Proposez-lui un atelier de maquettage d''application mobile.';

UPDATE "Interest"
SET "recommendationMessage" = '{prenom} a montré un intérêt pour la **data science**. Pensez à l''inviter à votre prochain atelier ou événement data.'
WHERE "nom" = 'Data science / Analyse de données'
  AND "recommendationMessage" = '{prenom} a montré un intérêt pour la **data science**. Pensez à l''inviter à votre prochain atelier data.';

UPDATE "Interest"
SET "recommendationMessage" = '{prenom} a montré un intérêt pour la **cybersécurité**. Pensez à l''inviter à votre prochain CTF, ça va lui plaire.'
WHERE "nom" = 'Cybersécurité / Hacking'
  AND "recommendationMessage" = '{prenom} a montré un intérêt pour la **cybersécurité**. Pensez à l''inscrire à votre prochain CTF, ça va lui plaire.';
