import jsPDF from 'jspdf';
import { formatDateFr } from '$lib/utils';

// Epitech Brand Colors (RGB)
const COLOR_BLUE = [1, 58, 251]; // #013afb
const COLOR_TEAL = [0, 255, 151]; // #00ff97
const COLOR_BLACK = [26, 27, 30]; // #1a1b1e

export function generateDiploma(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	student: any,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	event: any,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	subject: any
) {
	const doc = new jsPDF({
		orientation: 'landscape',
		unit: 'mm',
		format: 'a4'
	});

	const width = doc.internal.pageSize.getWidth();
	const height = doc.internal.pageSize.getHeight();

	// --- DESIGN ---

	// 1. Border (Blue thick border)
	doc.setDrawColor(COLOR_BLUE[0], COLOR_BLUE[1], COLOR_BLUE[2]);
	doc.setLineWidth(3);
	doc.rect(10, 10, width - 20, height - 20);

	// 2. Inner thin border (Teal)
	doc.setDrawColor(COLOR_TEAL[0], COLOR_TEAL[1], COLOR_TEAL[2]);
	doc.setLineWidth(1);
	doc.rect(13, 13, width - 26, height - 26);

	// 3. Header: "CERTIFICAT DE RÉUSSITE"
	doc.setTextColor(COLOR_BLUE[0], COLOR_BLUE[1], COLOR_BLUE[2]);
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(36);
	doc.text('CERTIFICAT DE RÉUSSITE', width / 2, 50, { align: 'center' });

	// 4. Subheader: CodeCamp
	doc.setTextColor(COLOR_TEAL[0], COLOR_TEAL[1], COLOR_TEAL[2]); // Darker teal for text readability usually, but lets stick to brand
	// Let's darken the teal slightly for text readability on white
	doc.setTextColor(0, 180, 100);
	doc.setFontSize(16);
	doc.text('CODECAMP MANAGER // EPITECH', width / 2, 60, { align: 'center' });

	// 5. "Decerné à"
	doc.setTextColor(COLOR_BLACK[0], COLOR_BLACK[1], COLOR_BLACK[2]);
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(14);
	doc.text('Ce certificat est décerné à', width / 2, 85, { align: 'center' });

	// 6. Student Name
	const fullName = `${student.prenom} ${student.nom}`.toUpperCase();
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(40);
	doc.text(fullName, width / 2, 105, { align: 'center' });

	// Underline name
	const textWidth = doc.getTextWidth(fullName);
	doc.setDrawColor(COLOR_BLUE[0], COLOR_BLUE[1], COLOR_BLUE[2]);
	doc.setLineWidth(1);
	doc.line(width / 2 - textWidth / 2, 108, width / 2 + textWidth / 2, 108);

	// 7. Context / Subject
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(14);
	doc.text('Pour sa participation active et la validation du module :', width / 2, 125, {
		align: 'center'
	});

	// Subject Name
	const subjectName = subject?.nom || 'Atelier de Programmation';
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(22);
	doc.setTextColor(COLOR_BLUE[0], COLOR_BLUE[1], COLOR_BLUE[2]);
	doc.text(subjectName, width / 2, 140, { align: 'center' });

	// 8. Footer Info (Bottom Left)
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(12);
	doc.setTextColor(100, 100, 100);

	const eventDate = new Date(event.date);
	const dateStr = formatDateFr(eventDate);

	doc.text(`Événement : ${event.titre}`, 20, height - 30);
	doc.text(`Date : ${dateStr}`, 20, height - 24);

	// 9. Signature Area (Bottom Right)
	doc.text("L'équipe pédagogique", width - 60, height - 35);
	// Fake signature line
	doc.setDrawColor(150, 150, 150);
	doc.line(width - 70, height - 25, width - 20, height - 25);

	// Epitech "Stamp" circle effect (simple)
	doc.setDrawColor(COLOR_BLUE[0], COLOR_BLUE[1], COLOR_BLUE[2]);
	doc.setLineWidth(1);
	doc.circle(width - 45, height - 32, 12);
	doc.setFontSize(8);
	doc.setTextColor(COLOR_BLUE[0], COLOR_BLUE[1], COLOR_BLUE[2]);
	doc.text('VALIDÉ', width - 45, height - 31, { align: 'center', angle: 25 });

	// --- SAVE ---
	doc.save(`Diplome_${student.nom}_${student.prenom}.pdf`);
}
