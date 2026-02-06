import Papa from 'papaparse';

export interface CsvStudent {
	prenom: string;
	nom: string;
	email: string;
	phone: string;
	niveau: string;
	parentEmail: string;
	parentPhone: string;
}

export interface CsvEventImport {
	eventName: string;
	eventDate: Date;
	students: CsvStudent[];
}

// Formats "jean-pierre" to "Jean-Pierre"
function formatFirstName(name: string): string {
	if (!name) return '';
	return name
		.trim()
		.toLowerCase()
		.replace(/(?:^|\s|-)\S/g, (c) => c.toUpperCase());
}

// Formats "DUPONT" or "dupont" to "DUPONT"
function formatLastName(name: string): string {
	if (!name) return '';
	return name.trim().toUpperCase();
}

// Helper to normalize headers (remove accents, lowercase, handle encoding glitches)
function normalizeHeader(h: string): string {
	let clean = h.trim().toLowerCase();
	// Remove surrounding quotes if PapaParse didn't
	clean = clean.replace(/^"|"$/g, '');

	// Remove accents (NFD normalization splits characters from accents, then regex removes diacritics)
	clean = clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

	// Handle broken encoding for "Prénom" which might look like "prnom" or "pr?nom"
	if (clean.startsWith('pr') && clean.endsWith('nom')) return 'prenom';

	// Specific check for "etudes actuelles" or "niveau"
	if (clean.includes('etudes') || clean === 'niveau' || clean === 'level') return 'niveau';

	// --- PHONE LOGIC ---
	// "Téléphone parent" -> parentPhone
	if (
		(clean.includes('telephone') || clean.includes('phone')) &&
		(clean.includes('parent') || clean.includes('pere') || clean.includes('mere'))
	)
		return 'parentPhone';

	// "Téléphone étudiant" or just "Telephone" -> phone
	if (
		(clean.includes('telephone') || clean.includes('phone') || clean.includes('mobile')) &&
		!clean.includes('parent')
	)
		return 'phone';

	// --- EMAIL LOGIC ---
	// "Email Parent" -> parentEmail
	if (
		clean.includes('mail') &&
		(clean.includes('parent') || clean.includes('pere') || clean.includes('mere'))
	)
		return 'parentEmail';

	// "Adresse e-mail" -> email
	if (clean.includes('mail') && !clean.includes('parent')) return 'email';

	return clean;
}

// Map "Etudes actuelles" from the specific CSV format to internal 'niveau' enum
function mapLevel(csvLevel: string): string {
	const l = (csvLevel || '').toLowerCase().trim();
	if (l.includes('sixième') || l.includes('6')) return '6eme';
	if (l.includes('cinquième') || l.includes('5')) return '5eme';
	if (l.includes('quatrième') || l.includes('4')) return '4eme';
	if (l.includes('troisième') || l.includes('3')) return '3eme';
	if (l.includes('seconde') || l.includes('2')) return '2nde';
	if (l.includes('première') || l.includes('1')) return '1ere';
	if (l.includes('terminale') || l.includes('term')) return 'Terminale';
	if (l.includes('bac') || l.includes('sup') || l.includes('+')) return 'Sup';
	return 'Sup'; // Default fallback
}

function cleanPhoneNumber(raw: string | number | undefined): string {
	if (!raw) return '';
	let str = raw.toString().trim();

	// Handle scientific notation from Excel (e.g., "3,36783E+11")
	if (str.toLowerCase().includes('e+')) {
		const num = Number(str.replace(',', '.'));
		if (!isNaN(num)) {
			str = num.toLocaleString('fullwide', { useGrouping: false });
		}
	}

	// Remove spaces, dots, dashes
	str = str.replace(/[\s.-]/g, '');

	// Handle International prefix (33 -> 0)
	if (str.startsWith('33')) str = '0' + str.substring(2);
	if (str.startsWith('+33')) str = '0' + str.substring(3);

	return str;
}

export function parseEventImportCsv(csvString: string): Promise<CsvEventImport> {
	return new Promise((resolve, reject) => {
		Papa.parse(csvString, {
			header: true,
			skipEmptyLines: true,
			delimiter: ';', // Explicitly set semicolon for French CSVs
			transformHeader: normalizeHeader,
			complete: (results) => {
				if (results.data.length === 0) {
					reject(new Error('Le fichier CSV est vide.'));
					return;
				}

				// 1. Extract Event Details from the first row
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const firstRow = results.data[0] as any;

				// Look for campaign name key
				const campaignKey =
					Object.keys(firstRow).find((k) => k.includes('campagne')) || 'nom de la campagne';
				const campaignName = firstRow[campaignKey] || 'Nouvel Événement';

				let eventName = campaignName;
				let eventDate = new Date();

				// Try to extract date from string (YYYY/MM/DD)
				const dateMatch = campaignName.match(/(\d{4}\/\d{2}\/\d{2})/);
				if (dateMatch) {
					eventDate = new Date(dateMatch[1]);
					eventDate.setHours(14, 0, 0, 0); // Default 14:00
				} else {
					eventDate.setHours(14, 0, 0, 0);
				}

				// 2. Process Students
				const students: CsvStudent[] = results.data
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					.map((row: any) => {
						const rawPrenom = row['prenom'] || row['first name'] || '';
						const rawNom = row['nom'] || row['last name'] || '';

						const prenom = formatFirstName(rawPrenom);
						const nom = formatLastName(rawNom);

						const email = (row['email'] || row['mail'] || '').trim().toLowerCase();
						const phone = cleanPhoneNumber(row['phone'] || row['telephone']);
						const niveau = mapLevel(row['niveau'] || row['level']);

						const parentEmail = (row['parentEmail'] || '').trim().toLowerCase();
						const parentPhone = cleanPhoneNumber(row['parentPhone']);

						return { prenom, nom, email, phone, niveau, parentEmail, parentPhone };
					})
					.filter((s) => s.nom && s.prenom);

				resolve({
					eventName,
					eventDate,
					students
				});
			},
			error: (err: any) => reject(err)
		});
	});
}
