-- AlterTable
-- Règlement intérieur is co-signed: the talent signs it during onboarding, the
-- legal guardian co-signs it from the parent flow. A single shared PDF
-- (`rulesFilePath`, already on the row) carries both signature blocks and is
-- regenerated whenever either signer commits. The columns below capture the
-- inputs of each signature so the worker can rebuild the PDF from DB state.
-- Signer name is split into prénom + nom to mirror the talent's identity model
-- (`prenom` / `nom`) — a single free-text field read asymmetrically on the PDF.
ALTER TABLE "Talent" ADD COLUMN     "rulesSignedCity" TEXT,
ADD COLUMN     "parentRulesSignedAt" TIMESTAMP(3),
ADD COLUMN     "parentRulesSignerPrenom" TEXT,
ADD COLUMN     "parentRulesSignerNom" TEXT,
ADD COLUMN     "parentRulesRelationship" TEXT,
ADD COLUMN     "parentRulesSignedCity" TEXT;
