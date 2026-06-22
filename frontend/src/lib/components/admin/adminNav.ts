import { resolve } from '$app/paths';
import type { Icon as IconType } from '@lucide/svelte';
import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
import GitCompareArrows from '@lucide/svelte/icons/git-compare-arrows';
import FileCog from '@lucide/svelte/icons/file-cog';
import ClipboardList from '@lucide/svelte/icons/clipboard-list';
import LifeBuoy from '@lucide/svelte/icons/life-buoy';
import FolderOpen from '@lucide/svelte/icons/folder-open';
import Megaphone from '@lucide/svelte/icons/megaphone';
import Send from '@lucide/svelte/icons/send';
import Mails from '@lucide/svelte/icons/mails';
import MailCog from '@lucide/svelte/icons/mail-warning';
import History from '@lucide/svelte/icons/history';
import DoorOpen from '@lucide/svelte/icons/door-open';
import Map from '@lucide/svelte/icons/map';
import Signature from '@lucide/svelte/icons/signature';
import Users from '@lucide/svelte/icons/users';
import GraduationCap from '@lucide/svelte/icons/graduation-cap';
import NotebookPen from '@lucide/svelte/icons/notebook-pen';
import UserX from '@lucide/svelte/icons/user-x';
import FileText from '@lucide/svelte/icons/file-text';
import Tags from '@lucide/svelte/icons/tags';
import Heart from '@lucide/svelte/icons/heart';
import CalendarDays from '@lucide/svelte/icons/calendar-days';
import Gamepad2 from '@lucide/svelte/icons/gamepad-2';
import MessageSquare from '@lucide/svelte/icons/message-square';

// Single source of truth for admin-space navigation. Both surfaces read this:
//  - the sidebar (`(staff)/staff/admin/+layout.svelte`) renders the sections
//    verbatim, resolving `badge` slots against live load() counts;
//  - the ⌘K command palette (`AdminCommand.svelte`) renders the same sections
//    as groups and filters items client-side on label + `keywords`.
// Adding a page = one entry here, and it appears in both. Keeping the two lists
// in sync by hand is what let `/signatures` ship to the sidebar but go missing
// from the palette; that drift is now structurally impossible.

// A sidebar entry can carry a live count. The key names the slot; the layout
// owns where the number comes from and how it's styled (it has the load data).
export type AdminBadgeKey = 'authConflicts' | 'tickets' | 'deletions';

export type AdminNavItem = {
  /** Label shown in the sidebar and, under its section heading, in the palette. */
  label: string;
  /** Already-resolved href (base path applied). */
  href: string;
  icon: typeof IconType;
  /** Accent-free synonyms so palette search resolves "salesforce", "rgpd", … */
  keywords?: string[];
  /** Sidebar live-count slot; the palette ignores it (no badges by design). */
  badge?: AdminBadgeKey;
  /**
   * Resolved child href that should NOT keep this entry highlighted, for
   * parents whose child route has its own sidebar entry (e.g. broadcasts must
   * not stay active on broadcasts/templates).
   */
  activeExclude?: string;
};

export type AdminNavSection = {
  title: string;
  items: AdminNavItem[];
};

export const ADMIN_NAV: AdminNavSection[] = [
  {
    title: 'Système',
    items: [
      {
        label: "Vue d'ensemble",
        href: resolve('/staff/admin'),
        icon: LayoutDashboard,
        keywords: ['dashboard', 'accueil', 'overview'],
      },
      {
        label: 'Erreurs de Sync',
        href: resolve('/staff/admin/sync-errors'),
        icon: TriangleAlert,
        keywords: ['synchro', 'salesforce', 'erreur'],
      },
      {
        label: 'Divergences Salesforce',
        href: resolve('/staff/admin/sf-conflicts'),
        icon: GitCompareArrows,
        keywords: ['sf', 'conflit', 'conflits', 'reconciliation'],
        badge: 'authConflicts',
      },
      {
        label: 'Génération PDF onboarding',
        href: resolve('/staff/admin/onboarding-pdfs'),
        icon: FileCog,
        keywords: ['pdf', 'documents', 'signes', 'export'],
      },
      {
        label: 'PDF Entretiens',
        href: resolve('/staff/admin/interview-pdfs'),
        icon: ClipboardList,
        keywords: ['pdf', 'entretien', 'synthese', 'motivation', 'export'],
      },
      {
        label: 'Tickets',
        href: resolve('/staff/admin/tickets'),
        icon: LifeBuoy,
        keywords: ['support', 'bug', 'suggestion'],
        badge: 'tickets',
      },
      {
        label: '[DEV] S3 Test',
        href: resolve('/staff/admin/files'),
        icon: FolderOpen,
        keywords: ['s3', 'partage', 'fichiers', 'files'],
      },
    ],
  },
  {
    title: 'Communication',
    items: [
      {
        label: "Vue d'ensemble",
        href: resolve('/staff/admin/communication'),
        icon: Megaphone,
        keywords: ['comm', 'communication'],
        activeExclude: resolve('/staff/admin/communication/relances'),
      },
      {
        label: 'Envoi en masse',
        href: resolve('/staff/admin/broadcasts'),
        icon: Send,
        keywords: ['broadcast', 'campagne', 'email', 'sms'],
        activeExclude: resolve('/staff/admin/broadcasts/templates'),
      },
      {
        label: 'Templates',
        href: resolve('/staff/admin/broadcasts/templates'),
        icon: Mails,
        keywords: ['modele', 'broadcast'],
      },
      {
        label: 'Mails transactionnels',
        href: resolve('/staff/admin/email-actions'),
        icon: MailCog,
        keywords: ['email', 'action', 'mapping'],
      },
      {
        label: 'Relances (lecture seule)',
        href: resolve('/staff/admin/communication/relances'),
        icon: History,
        keywords: ['relance', 'rappel'],
      },
      {
        label: "Pages d'accueil",
        href: resolve('/staff/admin/welcome-pages'),
        icon: DoorOpen,
        keywords: ['welcome', 'cms'],
      },
    ],
  },
  {
    title: 'Organisation',
    items: [
      {
        label: 'Réseau Campus',
        href: resolve('/staff/admin/campuses'),
        icon: Map,
        keywords: ['campus', 'feature', 'flag'],
      },
      {
        label: 'Signataires',
        href: resolve('/staff/admin/signatures'),
        icon: Signature,
        keywords: ['signature', 'signataire', 'diplome', 'certificat', 'stage'],
      },
      {
        label: 'Membres & invitations',
        href: resolve('/staff/admin/users'),
        icon: Users,
        keywords: ['staff', 'utilisateur', 'invitation', 'role'],
      },
      {
        label: 'Talents',
        href: resolve('/staff/admin/talents'),
        icon: GraduationCap,
        keywords: ['eleve', 'etudiant', 'annuaire'],
      },
      {
        label: 'Notes',
        href: resolve('/staff/admin/notes'),
        icon: NotebookPen,
        keywords: ['note'],
      },
      {
        label: 'Suppressions',
        href: resolve('/staff/admin/account-deletions'),
        icon: UserX,
        keywords: ['rgpd', 'suppression', 'anonymisation', 'compte'],
        badge: 'deletions',
      },
    ],
  },
  {
    title: 'Pédagogie',
    items: [
      {
        label: 'Templates Officiels',
        href: resolve('/staff/admin/templates'),
        icon: FileText,
        keywords: ['activite', 'officiel'],
      },
      {
        label: 'Thèmes Officiels',
        href: resolve('/staff/admin/themes'),
        icon: Tags,
        keywords: ['theme', 'tag'],
      },
      {
        label: "Centres d'intérêt",
        href: resolve('/staff/admin/interests'),
        icon: Heart,
        keywords: ['interet', 'centre'],
      },
      {
        label: 'Modèles de Planning',
        href: resolve('/staff/admin/planning-templates'),
        icon: CalendarDays,
        keywords: ['planning', 'modele'],
      },
      {
        label: 'Mini-jeux',
        href: resolve('/staff/admin/minigames'),
        icon: Gamepad2,
        keywords: ['jeu', 'game', 'rotation'],
      },
      {
        label: 'Feedback',
        href: resolve('/staff/admin/feedback'),
        icon: MessageSquare,
        keywords: ['feedback', 'retour', 'avis', 'questionnaire'],
      },
    ],
  },
];
