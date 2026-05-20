import type { Component } from 'svelte';
import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
import Mail from '@lucide/svelte/icons/mail';
import UserCheck from '@lucide/svelte/icons/user-check';
import FileText from '@lucide/svelte/icons/file-text';
import Camera from '@lucide/svelte/icons/camera';
import PartyPopper from '@lucide/svelte/icons/party-popper';

export type TalentJourneyActor = 'staff' | 'talent' | 'parent' | 'auto';

export type TalentJourneyStep = {
  key: string;
  title: string;
  description: string;
  actor: TalentJourneyActor;
  actorLabel?: string;
  icon: Component;
};

export const TALENT_JOURNEY_STEPS: TalentJourneyStep[] = [
  {
    key: 'salesforce-convention',
    title: 'Salesforce — convention validée',
    description:
      'La convention de stage est finalisée. Le statut du prospect dans la campagne Salesforce des stages de seconde passe à 3 — Convention validée.',
    actor: 'staff',
    actorLabel: 'Équipe Dev & Adm Epitech',
    icon: ClipboardCheck,
  },
  {
    key: 'mail-stagiaire',
    title: 'Mail envoyé au stagiaire',
    description:
      "Un mail de finalisation d'inscription est envoyé au stagiaire, avec une deadline au 1er juin et un lien permettant de se connecter automatiquement à Jump, la plateforme Epitech des stages de seconde.",
    actor: 'staff',
    actorLabel: 'Équipe Dev Natio',
    icon: Mail,
  },
  {
    key: 'onboarding-profil',
    title: 'Onboarding et complétion du profil',
    description:
      "Le stagiaire clique sur le lien du mail, se connecte à la plateforme Jump et réalise son onboarding. Il complète son profil en vérifiant ses coordonnées personnelles, celles de ses parents et ajoute ses centres d'intérêt, son matériel informatique et son lycée.",
    actor: 'talent',
    actorLabel: 'Le stagiaire',
    icon: UserCheck,
  },
  {
    key: 'reglement-interieur',
    title: 'Signature du règlement intérieur',
    description:
      "Le stagiaire lit et signe électroniquement le règlement intérieur d'Epitech via la plateforme Jump, et s'engage formellement à le respecter pendant toute la durée de son stage.",
    actor: 'talent',
    actorLabel: 'Le stagiaire',
    icon: FileText,
  },
  {
    key: 'droit-image',
    title: "Signature du droit à l'image",
    description:
      "Les référents légaux du stagiaire reçoivent un mail avec un lien de connexion automatique vers la plateforme. Ils se connectent et signent en ligne le droit à l'image, autorisant Epitech à utiliser les photos et vidéos prises pendant le stage.",
    actor: 'parent',
    actorLabel: 'Les référents légaux (parents)',
    icon: Camera,
  },
  {
    key: 'bienvenue-plateforme',
    title: 'Bienvenue sur la plateforme',
    description:
      'Le stagiaire se connecte à la home page Jump et accède à travers un message de bienvenue avec toutes les informations sur le stage. Il relève ses premiers défis à travers les mini-jeux de logique proposés sur la plateforme et obtient ses premiers points de gamification (XP).',
    actor: 'auto',
    actorLabel: 'Le stagiaire',
    icon: PartyPopper,
  },
];

export const TALENT_JOURNEY_ACTOR_LABEL: Record<TalentJourneyActor, string> = {
  staff: 'côté staff',
  talent: 'le stagiaire',
  parent: 'le parent',
  auto: 'automatique',
};
