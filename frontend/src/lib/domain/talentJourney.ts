import type { Component } from 'svelte';
import UserPlus from '@lucide/svelte/icons/user-plus';
import KeyRound from '@lucide/svelte/icons/key-round';
import UserCheck from '@lucide/svelte/icons/user-check';
import FileText from '@lucide/svelte/icons/file-text';
import Camera from '@lucide/svelte/icons/camera';

export type TalentJourneyActor = 'staff' | 'talent' | 'parent' | 'auto';

export type TalentJourneyStep = {
  key: string;
  title: string;
  description: string;
  actor: TalentJourneyActor;
  icon: Component;
};

export const TALENT_JOURNEY_STEPS: TalentJourneyStep[] = [
  {
    key: 'compte-cree',
    title: 'Compte créé',
    description:
      "À l'inscription (synchro automatique Salesforce), un compte personnel Jump est créé pour le talent. Il reçoit un email avec un lien de connexion.",
    actor: 'staff',
    icon: UserPlus,
  },
  {
    key: 'premier-login',
    title: 'Premier login',
    description:
      'Le talent saisit un code à 6 chiffres reçu par email (OTP) et accède pour la première fois à son espace personnel.',
    actor: 'talent',
    icon: KeyRound,
  },
  {
    key: 'profil',
    title: 'Profil complété',
    description:
      "Dans son espace, le talent renseigne ses infos perso, son lycée et ses centres d'intérêt. L'email du parent est saisi à cette étape.",
    actor: 'talent',
    icon: UserCheck,
  },
  {
    key: 'reglement-interieur',
    title: 'Règlement intérieur signé',
    description:
      "Dernière étape de l'onboarding talent : il lit et signe en ligne le règlement intérieur (présence, conduite, matériel, sécurité). Un PDF horodaté est généré.",
    actor: 'talent',
    icon: FileText,
  },
  {
    key: 'droit-image',
    title: "Droit à l'image",
    description:
      "Dès que l'email parent est connu, un email automatique demande au parent l'autorisation d'utiliser les photos et vidéos du stage. Il signe en ligne depuis son propre espace.",
    actor: 'parent',
    icon: Camera,
  },
];

export const TALENT_JOURNEY_ACTOR_LABEL: Record<TalentJourneyActor, string> = {
  staff: 'côté staff',
  talent: 'le talent',
  parent: 'le parent',
  auto: 'automatique',
};
