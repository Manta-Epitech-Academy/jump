import Papa from 'papaparse';

export interface CsvStudent {
	prenom: string;
	nom: string;
	email: string;
	niveau: string;
}

export function parseStudentsCsv(csvString: string): Promise<CsvStudent[]> {
	return new Promise((resolve, reject) => {
		Papa.parse(csvString, {
			header: true,
			skipEmptyLines: true,
			transformHeader: (h) => h.trim().toLowerCase(),
			complete: (results) => {
				const students: CsvStudent[] = results.data
					.map((row: any) => {
						const prenom =
							row['prenom'] || row['prénom'] || row['first name'] || row['firstname'] || '';
						const nom = row['nom'] || row['last name'] || row['lastname'] || '';
						const email = row['email'] || row['e-mail'] || row['mail'] || '';
						let niveau = row['niveau'] || row['level'] || row['classe'] || '6eme';

						if (niveau.includes('6')) niveau = '6eme';
						else if (niveau.includes('5')) niveau = '5eme';
						else if (niveau.includes('4')) niveau = '4eme';
						else if (niveau.includes('3')) niveau = '3eme';
						else if (niveau.includes('2')) niveau = '2nde';
						else if (niveau.includes('1')) niveau = '1ere';
						else if (niveau.includes('term')) niveau = 'Terminale';
						else if (niveau.toLowerCase().includes('sup') || niveau.includes('+')) niveau = 'Sup';

						return { prenom, nom, email, niveau };
					})
					.filter((s) => s.nom && s.prenom);

				resolve(students);
			},
			error: (err: any) => reject(err)
		});
	});
}
