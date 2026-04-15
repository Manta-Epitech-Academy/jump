import ejs from 'ejs';
import { withBrowser } from '../infra/browserPool';
import { epitechLogoSvg } from '../templates/epitechLogo';
import onboardingTemplate from '../templates/onboarding-document.html?raw';

type DocumentType = 'charter' | 'rules' | 'image-rights';

const TITLES: Record<DocumentType, string> = {
  charter: 'Charte Informatique et Éthique',
  rules: 'Règlement Intérieur',
  'image-rights': "Autorisation de Droit à l'Image",
};

const DOCUMENT_CONTENT: Record<DocumentType, string> = {
  charter: '',
  rules: `En tant qu'entreprise d'accueil et école d'enseignement supérieur, Epitech dispose d'un règlement intérieur pour s'assurer d'une vie de campus respectueuse et propice à l'apprentissage.

Tout manquement aux règles établies par le règlement intérieur entrainerait de fait une rupture à prise effet immédiat de la convention de stage.

PRÉSENCE ET PONCTUALITÉ
• La présence sur le campus est obligatoire de 10h à 17h, hors pause méridienne.
• Les stagiaires doivent être ponctuels et respecter les horaires du stage. Tout retard ou absence doit être justifié par écrit par les responsables légaux avant 10h30.
• Un stagiaire est considéré en retard s'il se présente jusqu'à 15 minutes après l'heure de début de l'activité. Au-delà, il est considéré comme absent.
• Les retardataires peuvent ne pas être autorisés à rejoindre l'activité si leur retard perturbe le bon déroulé de celle-ci.
• Les stagiaires sont autorisés à quitter le campus pendant la pause médiane pour déjeuner. En dehors de cette pause, aucune sortie n'est autorisée.
• Les stagiaires ne sont plus sous la responsabilité d'Epitech de 12h30 à 13h30.
• Les stagiaires sont sous la responsabilité d'Epitech dès lors qu'ils ont émargé en arrivant le matin et jusqu'à 17h, excepté sur la pause médiane.

COMPORTEMENT ET RESPECT D'AUTRUI
• Les stagiaires doivent respecter les règles de bonne conduite et de savoir-vivre.
• Il est strictement proscrit de tenir des propos injurieux ou d'adopter un comportement violent.
• Chaque stagiaire se doit de faire preuve de neutralité en matière de religion et de politique.
• Il est formellement interdit de crier ou de courir au sein de l'établissement.
• Le port de couvre-chef (casquette, bonnet…) est interdit sur le campus.
• Le voile religieux couvrant les cheveux est toléré s'il reste discret.

MATÉRIEL ET RESPONSABILITÉ
• Aucun prêt de matériel informatique ne peut être assuré par Epitech.
• Toute détérioration constatée sera à la charge du stagiaire responsable et de son responsable légal.
• Le stagiaire est entièrement responsable de son matériel. En cas de casse ou de vol, Epitech ne pourra être tenue responsable.
• Tout oubli de matériel informatique sera considéré comme une absence.
• L'utilisation du téléphone portable est interdite dans les salles d'activité, sauf sur autorisation d'un encadrant.

TRAVAIL ET SÉCURITÉ
• Les stagiaires doivent respecter les consignes de sécurité et les règles d'évacuation en cas d'urgence.
• Le travail en groupe doit s'effectuer dans le respect des autres groupes.
• Les stagiaires doivent respecter les règles de confidentialité et de protection des données personnelles.
• Les stagiaires doivent respecter les règles relatives aux droits d'auteur et à la propriété intellectuelle.
• Les stagiaires doivent vérifier et laisser la salle de classe propre avant de la quitter.
• Il est interdit d'apporter boisson ou nourriture dans certaines salles du campus.

OBLIGATIONS DU STAGIAIRE
• Les stagiaires s'engagent à profiter activement des activités proposées par Epitech.
• Les stagiaires doivent remplir à l'issue de leur stage un questionnaire d'évaluation.
• Les stagiaires veilleront à utiliser le bon logo et le bon nom de l'école en entier (Epitech).`,
  'image-rights': `Je soussigné(e), agissant en qualité de représentant légal, autorise Epitech à utiliser l'image de mon enfant dans le cadre du stage de seconde.

Je certifie avoir pris connaissance des dispositions du droit à l'image, telles que prévues par la loi, et être informé(e) que je peux à tout moment révoquer mon consentement et demander la cessation de l'utilisation de l'image de mon enfant, en adressant une demande écrite à Epitech.

Je m'engage à ne pas porter atteinte aux droits d'Epitech et à ne pas utiliser l'image de mon enfant à des fins contraires à la loi ou aux bonnes mœurs.`,
};

export async function generateOnboardingPDF(data: {
  type: DocumentType;
  studentName: string;
  signerName?: string;
  signedAt: Date;
}): Promise<Uint8Array<ArrayBuffer>> {
  const formattedDate = data.signedAt.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const htmlContent = await ejs.render(
    onboardingTemplate,
    {
      data: {
        title: TITLES[data.type],
        documentContent: DOCUMENT_CONTENT[data.type],
        studentName: data.studentName,
        signerName: data.signerName ?? null,
        signedAt: formattedDate,
        logoSvg: epitechLogoSvg,
      },
    },
    { async: true },
  );

  return withBrowser(async (browser) => {
    const page = await browser.newPage();
    try {
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
      await page.evaluateHandle('document.fonts.ready');

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
      });

      return new Uint8Array(pdfBuffer) as Uint8Array<ArrayBuffer>;
    } finally {
      await page.close();
    }
  });
}
