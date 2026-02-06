import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

/**
 * Generates a PDF by taking a screenshot of a specific HTML element.
 * The element should be rendered at the desired specific pixel dimensions (e.g. A4 at 96dpi or higher).
 */
export async function generateDiplomaFromHTML(elementId: string, filename: string) {
	const element = document.getElementById(elementId);
	if (!element) {
		console.error(`Element with id ${elementId} not found`);
		return;
	}

	try {
		// 1. Capture the element as a canvas
		// scale: 2 improves resolution for text sharpness
		const canvas = await html2canvas(element, {
			scale: 2,
			useCORS: true,
			logging: false,
			backgroundColor: '#ffffff'
		});

		const imgData = canvas.toDataURL('image/png');

		// 2. Create PDF (A4 Landscape)
		// A4 is 297mm x 210mm
		const pdf = new jsPDF({
			orientation: 'landscape',
			unit: 'mm',
			format: 'a4'
		});

		const pdfWidth = pdf.internal.pageSize.getWidth();
		const pdfHeight = pdf.internal.pageSize.getHeight();

		// 3. Add image to PDF, stretching to fit the page exactly
		pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);

		// 4. Save
		pdf.save(filename);
	} catch (error) {
		console.error('Error generating diploma:', error);
		throw error;
	}
}
