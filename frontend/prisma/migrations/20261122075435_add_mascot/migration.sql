-- CreateEnum
CREATE TYPE "Mascot_Glasses" AS ENUM ('none', 'round', 'sun', 'geek');

-- CreateEnum
CREATE TYPE "Mascot_Scarf" AS ENUM ('none', 'red', 'green', 'orange', 'pink');

-- CreateEnum
CREATE TYPE "Mascot_Hair" AS ENUM ('tuft', 'crest', 'fringe', 'beanie');

-- AlterTable
ALTER TABLE "Talent" ADD COLUMN     "mascotAsleepAt" TIMESTAMP(3),
ADD COLUMN     "mascotGlasses" "Mascot_Glasses" NOT NULL DEFAULT 'none',
ADD COLUMN     "mascotHair" "Mascot_Hair" NOT NULL DEFAULT 'tuft',
ADD COLUMN     "mascotName" VARCHAR(24),
ADD COLUMN     "mascotScarf" "Mascot_Scarf" NOT NULL DEFAULT 'none',
ADD COLUMN     "streakPreviousDay" DATE;

-- CreateTable
CREATE TABLE "Mascot_Line" (
    "id" TEXT NOT NULL,
    "momentKey" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "startsOn" DATE,
    "endsOn" DATE,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mascot_Line_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Mascot_Line_momentKey_idx" ON "Mascot_Line"("momentKey");

-- EpiDuck's default lines (#539), so a fresh environment's duck is not mute.
-- From here on they are data an admin rewrites over `write_mascot_line`, which
-- is why the ids are readable rather than generated: the seed reads these rows
-- back instead of recreating them. The mockup's two developer-jargon lines
-- (« T'as push ton code ? », « Un bug ? Explique-le-moi ! ») are rewritten, as
-- every talent-facing copy avoids jargon.
INSERT INTO "Mascot_Line" ("id", "momentKey", "text", "updatedAt")
VALUES
  ('mln_poke_salut', 'poke', 'Salut, moi c’est {canard} !', CURRENT_TIMESTAMP),
  ('mln_poke_bg', 'poke', 'Ça va BG ?!', CURRENT_TIMESTAMP),
  ('mln_poke_bien_joue', 'poke', 'Coin ! Bien joué aujourd’hui ?', CURRENT_TIMESTAMP),
  ('mln_poke_truc_cool', 'poke', 'T’as créé un truc cool aujourd’hui ?', CURRENT_TIMESTAMP),
  ('mln_poke_un_oeil', 'poke', 'Psst, {prenom} : tu savais que les canards dorment d’un œil ?', CURRENT_TIMESTAMP),
  ('mln_hello_salut', 'hello', 'Salut {prenom} !', CURRENT_TIMESTAMP),
  ('mln_hello_bonne_journee', 'hello', 'Coucou {prenom}, bonne journée à toi !', CURRENT_TIMESTAMP),
  ('mln_away_mare', 'away', 'T’es de retour, {prenom} ! Je t’attendais au bord de la mare.', CURRENT_TIMESTAMP),
  ('mln_sleep_bonne_nuit', 'sleep', 'Bonne nuit !', CURRENT_TIMESTAMP),
  ('mln_wake_salut', 'wake', 'Salut salut !', CURRENT_TIMESTAMP);
