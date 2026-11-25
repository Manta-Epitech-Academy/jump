-- AlterTable
ALTER TABLE "Talent" ADD COLUMN "levelCelebratedXp" INTEGER NOT NULL DEFAULT 0;

-- Every talent's level counts as celebrated where it stands today: the duck
-- celebrates a level reached from now on (#540), never retroactively, which
-- would greet every Maker with a party for a level reached months ago.
UPDATE "Talent" SET "levelCelebratedXp" = "xp" WHERE "xp" > 0;

-- EpiDuck's default lines for the moments he reacts at (#540), readable ids
-- as in 20261122075435_add_mascot. He says one line on arrival, so the event
-- lines name the talent: they are the greeting on those days. The XP lines take over from the reward
-- toasts, which they replace, in the duck's voice: no emoji, no count of
-- anything the talent did not do, and nothing over a failure.
INSERT INTO "Mascot_Line" ("id", "momentKey", "text", "updatedAt")
VALUES
  ('mln_streak_affilee', 'streak', '{serie} jours d’affilée, {prenom} ! Ça me fait plaisir de te voir.', CURRENT_TIMESTAMP),
  ('mln_streak_habitue', 'streak', 'Et de {serie} jours de suite ! Tu connais la mare par cœur.', CURRENT_TIMESTAMP),
  ('mln_event_tomorrow_hate', 'eventTomorrow', 'Coucou {prenom} ! Demain, c’est {evenement}. J’ai hâte de voir ce que tu vas créer.', CURRENT_TIMESTAMP),
  ('mln_event_today_jour_j', 'eventToday', 'C’est le grand jour, {prenom} : {evenement} ! Je croise les palmes pour toi.', CURRENT_TIMESTAMP),
  ('mln_first_meeting_moi', 'firstMeeting', 'Salut {prenom} ! Moi, c’est {canard}, ton canard. Je te suis partout dans Jump.', CURRENT_TIMESTAMP),
  ('mln_first_meeting_nom', 'firstMeeting', 'Coin ! Je suis {canard}. Tu pourras me donner un nom et m’habiller dans tes réglages.', CURRENT_TIMESTAMP),
  ('mln_arrival_xp_bienvenue', 'arrivalXp', 'Bienvenue {prenom} ! +{xp} XP pour ton arrivée. Tu en gagneras en participant aux activités.', CURRENT_TIMESTAMP),
  ('mln_early_arrival_xp_premiers', 'earlyArrivalXp', 'Tu fais partie des premiers de ton campus : +{xp} XP, dont {bonus} de bonus rapidité !', CURRENT_TIMESTAMP),
  ('mln_activity_xp_avance', 'activityXp', 'Ton activité avance : +{xp} XP ! Continue, chaque étape compte.', CURRENT_TIMESTAMP),
  ('mln_daily_game_xp_releve', 'dailyGameXp', 'Défi du jour relevé : +{xp} XP ! Un nouveau t’attend demain.', CURRENT_TIMESTAMP),
  ('mln_rank_xp_top', 'rankXp', 'Dans le top de ton campus ! +{xp} XP de bonus pour toi.', CURRENT_TIMESTAMP),
  ('mln_level_up_bravo', 'levelUp', 'Niveau {niveau}, {prenom} ! Je savais que tu y arriverais.', CURRENT_TIMESTAMP),
  ('mln_level_up_fete', 'levelUp', 'Te voilà {niveau} ! On fête ça, coin coin !', CURRENT_TIMESTAMP),
  ('mln_check_in_la', 'checkIn', 'Te voilà, {prenom} ! Belle journée à toi.', CURRENT_TIMESTAMP),
  ('mln_feedback_done_merci', 'feedbackDone', 'Merci {prenom} ! Ton avis aide à préparer les prochains événements.', CURRENT_TIMESTAMP);
