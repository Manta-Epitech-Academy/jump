import ejs from 'ejs';
import { withBrowser } from './browserPool';
import { epitechLogoSvg } from './epitechLogo';

// --- Staff Diploma Template ---
const diplomaTemplate = `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="https://fonts.googleapis.com/css2?family=Anton&family=Dancing+Script:wght@700&family=IBM+Plex+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300&display=swap" rel="stylesheet">
    <style>
        body, html { margin: 0; padding: 0; width: 1123px; height: 794px; background-color: #ffffff; font-family: 'IBM Plex Sans', sans-serif; color: #0f172a; position: relative; overflow: hidden; box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        @page { size: 1123px 794px; margin: 0; }
        .accent-bar { position: absolute; top: 0; bottom: 0; left: 0; width: 20px; background-color: #013afb; }
        .triangle { position: absolute; top: -128px; right: -128px; height: 160px; width: 160px; transform: rotate(45deg); background-color: #013afb; }
        .glow { position: absolute; bottom: -128px; right: -40px; height: 384px; width: 384px; border-radius: 50%; background-color: #00ff97; opacity: 0.2; filter: blur(64px); }
        .dots { position: absolute; top: 40px; left: 64px; opacity: 0.2; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; }
        .dot { height: 6px; width: 6px; border-radius: 50%; background-color: #94a3b8; }
        .content { position: relative; z-index: 10; display: flex; flex-direction: column; justify-content: space-between; align-items: center; height: 100%; padding: 64px 96px; box-sizing: border-box; }
        .header { display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; width: 100%; }

        .header-logo { display: flex; align-items: center; justify-content: center; margin-bottom: 8px; }
        .header-logo svg { width: auto; height: 48px; }

        .header h1 { font-family: 'Anton', sans-serif; font-size: 72px; font-weight: normal; text-transform: uppercase; margin: 0; color: #0f172a; letter-spacing: 0.025em; line-height: 1; }
        .header-line { margin-top: 16px; height: 6px; width: 128px; border-radius: 9999px; background-color: #00ff97; }
        .body { flex: 1; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px; width: 100%; }
        .body-subtitle { font-size: 24px; font-weight: 300; font-style: italic; color: #64748b; margin: 0; }
        .student-name-container { position: relative; padding: 16px 0; }
        .student-name { font-family: 'Anton', sans-serif; font-size: 60px; font-weight: normal; text-transform: uppercase; color: #013afb; margin: 0; line-height: 1; letter-spacing: 0; }
        .student-name-line { position: absolute; bottom: -8px; left: 50%; transform: translateX(-50%); width: 66.666667%; height: 2px; background-color: #e2e8f0; }
        .body-desc { max-width: 768px; font-size: 20px; color: #475569; margin: 0; line-height: 1.5; }
        .subject-box { border: 2px solid rgba(1, 58, 251, 0.2); background-color: rgba(239, 246, 255, 0.5); padding: 20px 48px; border-radius: 8px; box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05); margin-top: 8px; }
        .subject-box h3 { font-family: monospace; font-size: 30px; font-weight: 700; color: #013afb; margin: 0; }
        .footer { width: 100%; display: flex; justify-content: space-between; align-items: flex-end; border-top: 2px solid #f1f5f9; padding-top: 32px; margin-top: 16px; }
        .footer-left { display: flex; flex-direction: column; gap: 4px; text-align: left; }
        .footer-label { font-size: 12px; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; color: #94a3b8; }
        .event-title { font-size: 20px; font-weight: 700; text-transform: uppercase; color: #1e293b; }
        .event-date { font-size: 14px; font-weight: 500; color: #64748b; }
        .stamp-container { display: flex; flex-direction: column; align-items: center; justify-content: center; padding-bottom: 8px; }
        .stamp { display: flex; align-items: center; justify-content: center; height: 96px; width: 96px; border-radius: 50%; border: 4px double #00ff97; color: #00ff97; opacity: 0.9; }
        .stamp span { margin-top: -8px; transform: rotate(-12deg); font-size: 14px; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; }
        .footer-right { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; text-align: right; }
        .signature { padding-right: 16px; font-size: 36px; font-family: 'Dancing Script', cursive; color: #1e293b; }
        .date-fait { font-size: 12px; color: #94a3b8; }
    </style>
</head>
<body>
    <div class="accent-bar"></div>
    <div class="triangle"></div>
    <div class="glow"></div>
    <div class="dots"><% for(let i=0; i<24; i++) { %><div class="dot"></div><% } %></div>
    <div class="content">
        <div class="header">
            <div class="header-logo">
                <%- data.logoSvg %>
            </div>
            <h1>Certificat de Réussite</h1>
            <div class="header-line"></div>
        </div>
        <div class="body">
            <p class="body-subtitle">Ce certificat est officiellement décerné à</p>
            <div class="student-name-container">
                <h2 class="student-name"><%= data.studentName %></h2>
                <div class="student-name-line"></div>
            </div>
            <p class="body-desc">Pour sa participation active, son sérieux et la validation des compétences du module :</p>
            <div class="subject-box"><h3>&lt; <%= data.subjectName %> /&gt;</h3></div>
        </div>
        <div class="footer">
            <div class="footer-left">
                <span class="footer-label">Événement</span>
                <span class="event-title"><%= data.eventTitle %></span>
                <span class="event-date"><%= data.eventDate %></span>
            </div>
            <div class="stamp-container"><div class="stamp"><span>Validé</span></div></div>
            <div class="footer-right">
                <span class="footer-label">L'équipe Pédagogique</span>
                <div class="signature">Epitech Team</div>
                <span class="date-fait">Fait le <%= data.todayDate %></span>
            </div>
        </div>
    </div>
</body>
</html>
`;

// --- Student Comprehensive Certificate Template ---
const certificateTemplate = `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <link href="https://fonts.googleapis.com/css2?family=Anton&family=IBM+Plex+Sans:wght@400;700;900&display=swap" rel="stylesheet">
    <style>
        body, html { margin: 0; padding: 0; width: 794px; height: 1123px; background-color: #ffffff; font-family: 'IBM Plex Sans', sans-serif; color: #1e293b; -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
        @page { size: 794px 1123px; margin: 0; }

        .container { position: relative; width: 100%; height: 100%; padding: 60px; box-sizing: border-box; display: flex; flex-direction: column; }
        .bg-shape-1 { position: absolute; top: -100px; left: -100px; width: 300px; height: 300px; border-radius: 50%; background-color: #f1f5f9; z-index: -1; }
        .bg-shape-2 { position: absolute; bottom: 40px; right: -50px; width: 200px; height: 200px; border-radius: 50%; background: radial-gradient(circle, #00ff97 0%, transparent 70%); opacity: 0.15; z-index: -1; }

        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 4px solid #013afb; padding-bottom: 20px; margin-bottom: 30px; }
        .title-area h1 { font-family: 'Anton', sans-serif; font-size: 54px; font-weight: normal; text-transform: uppercase; color: #0f172a; margin: 0; line-height: 1.1; letter-spacing: 0.02em; }
        .title-area h2 { font-size: 20px; color: #013afb; text-transform: uppercase; font-weight: 900; letter-spacing: 0.1em; margin: 5px 0 0 0; }

        .logo svg { width: auto; height: 40px; }

        .intro { font-size: 18px; line-height: 1.6; margin-bottom: 30px; }
        .student-name { font-size: 24px; font-weight: 900; color: #013afb; text-transform: uppercase; background: #eff6ff; padding: 4px 12px; border-radius: 6px; }

        .stats-grid { display: flex; justify-content: space-between; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 25px; margin-bottom: 30px; }
        .stat-item { display: flex; flex-direction: column; align-items: center; width: 30%; }
        .stat-value { font-size: 36px; font-weight: 900; color: #0f172a; line-height: 1; margin-bottom: 5px; }
        .stat-label { font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }

        .section-title { font-size: 18px; font-weight: 900; color: #0f172a; text-transform: uppercase; margin-bottom: 15px; display: flex; align-items: center; gap: 10px; }
        .section-title::after { content: ''; flex-grow: 1; height: 2px; background: #e2e8f0; }

        .subjects ul { list-style: none; padding: 0; margin: 0 0 30px 0; display: flex; flex-wrap: wrap; gap: 10px; }
        .subjects li { background: #013afb; color: white; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 700; letter-spacing: 0.05em; }

        .portfolio { margin-bottom: auto; }
        .gallery { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
        .gallery-item { position: relative; height: 160px; border-radius: 8px; overflow: hidden; border: 2px solid #e2e8f0; }
        .gallery-item img { width: 100%; height: 100%; object-fit: cover; }

        .footer { display: flex; justify-content: space-between; align-items: flex-end; border-top: 2px solid #e2e8f0; padding-top: 20px; margin-top: 40px; }
        .footer-info { font-size: 14px; color: #64748b; }
        .footer-info strong { color: #0f172a; }
        .watermark { font-family: 'Anton', sans-serif; font-size: 24px; color: #cbd5e1; text-transform: uppercase; letter-spacing: 0.1em; }
    </style>
</head>
<body>
    <div class="container">
        <div class="bg-shape-1"></div>
        <div class="bg-shape-2"></div>

        <div class="header">
            <div class="title-area">
                <h1>Attestation <br/>de Compétences</h1>
                <h2>Epitech TekCamp</h2>
            </div>
            <div class="logo">
                <%- data.logoSvg %>
            </div>
        </div>

        <div class="intro">
            Nous certifions que <span class="student-name"><%= data.studentName %></span> a participé activement au programme d'immersion technique Epitech TekCamp.
            L'étudiant(e) y a développé des compétences en programmation, résolution de problèmes et gestion de projets numériques.
        </div>

        <div class="stats-grid">
            <div class="stat-item">
                <div class="stat-value"><%= data.hours %>h</div>
                <div class="stat-label">Volume de pratique</div>
            </div>
            <div class="stat-item">
                <div class="stat-value"><%= data.xp %></div>
                <div class="stat-label">Points d'XP</div>
            </div>
            <div class="stat-item">
                <div class="stat-value" style="color: #ff5f3a;"><%= data.level %></div>
                <div class="stat-label">Niveau final</div>
            </div>
        </div>

        <div class="subjects">
            <div class="section-title">Domaines & Technologies explorés</div>
            <ul>
                <% data.subjects.forEach(function(sub) { %>
                    <li><%= sub %></li>
                <% }); %>
            </ul>
        </div>

        <% if (data.images && data.images.length > 0) { %>
        <div class="portfolio">
            <div class="section-title">Extraits du Portfolio Technique</div>
            <div class="gallery">
                <% data.images.forEach(function(img) { %>
                    <div class="gallery-item">
                        <img src="<%= img %>" />
                    </div>
                <% }); %>
            </div>
        </div>
        <% } %>

        <div class="footer">
            <div class="footer-info">
                Fait le <strong><%= data.todayDate %></strong><br/>
                Certificat généré automatiquement. Document destiné à enrichir les dossiers académiques (ex: Parcoursup).
            </div>
            <div class="watermark">EPITECH 2026</div>
        </div>
    </div>
</body>
</html>
`;

export async function generateDiplomaPDF(data: {
	studentName: string;
	subjectName: string;
	eventTitle: string;
	eventDate: string;
	todayDate: string;
}): Promise<Uint8Array<ArrayBuffer>> {
	// Inject the SVG into the data payload
	return await generatePDF(
		diplomaTemplate,
		{ ...data, logoSvg: epitechLogoSvg },
		{ width: '1123px', height: '794px' }
	); // Landscape
}

export async function generateCertificatePDF(data: {
	studentName: string;
	xp: number;
	hours: number;
	level: string;
	subjects: string[];
	todayDate: string;
	images: string[];
}): Promise<Uint8Array<ArrayBuffer>> {
	// Inject the SVG into the data payload
	return await generatePDF(
		certificateTemplate,
		{ ...data, logoSvg: epitechLogoSvg },
		{ width: '794px', height: '1123px' }
	); // Portrait (A4)
}

// Shared Puppeteer logic — uses a browser pool instead of launching per request
async function generatePDF(
	templateString: string,
	data: any,
	format: { width: string; height: string }
): Promise<Uint8Array<ArrayBuffer>> {
	const htmlContent = await ejs.render(templateString, { data }, { async: true });

	return withBrowser(async (browser) => {
		const page = await browser.newPage();
		try {
			await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
			await page.evaluateHandle('document.fonts.ready');

			const pdfBuffer = await page.pdf({
				width: format.width,
				height: format.height,
				printBackground: true,
				preferCSSPageSize: true,
				margin: { top: 0, right: 0, bottom: 0, left: 0 }
			});

			return new Uint8Array(pdfBuffer) as Uint8Array<ArrayBuffer>;
		} finally {
			await page.close();
		}
	});
}
