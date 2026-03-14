import { jsPDF } from 'jspdf';
import type { Prescription } from '../schemas/prescription';
import type { DoctorProfile } from '../schemas/profile';

export async function generatePrescriptionPDF(
  rx: Prescription,
  profile: DoctorProfile,
  qrDataUrl?: string
): Promise<Blob> {
  // A5 page: 148mm x 210mm
  const doc = new jsPDF({ format: 'a5', unit: 'mm' });
  const pageW = 148;
  const margin = 10;
  const contentW = pageW - margin * 2;
  let y = 12;

  // ── Header: Doctor Info (text only, stamp is in footer) ──
  const headerX = margin;
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(`Dr. ${profile.fullName}`, headerX, y + 2);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(profile.designation, headerX, y + 7);
  doc.text(`Reg. No: ${profile.regNumber}`, headerX, y + 11);
  if (profile.clinicName) {
    doc.text(profile.clinicName, headerX, y + 15);
  }
  if (profile.phone) {
    doc.text(`Ph: ${profile.phone}`, headerX, y + (profile.clinicName ? 19 : 15));
  }

  y = 36;

  // ── Divider ──
  doc.setDrawColor(30, 58, 95);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  // ── Patient Info ──
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Patient: ${rx.patient.name}`, margin, y);
  doc.text(`Age/Sex: ${rx.patient.age}y / ${rx.patient.gender}`, pageW / 2, y);

  y += 5;
  const date = rx.finalizedAt
    ? new Date(rx.finalizedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  doc.text(`Date: ${date}`, margin, y);
  doc.text(`ID: ${rx.id}`, pageW / 2, y);

  y += 3;
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  // ── Complaints ──
  if (rx.complaints) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('C/O:', margin, y);
    doc.setFont('helvetica', 'normal');
    const complaintsLines = doc.splitTextToSize(rx.complaints, contentW - 12);
    doc.text(complaintsLines, margin + 11, y);
    y += complaintsLines.length * 4 + 2;
  }

  // ── Symptoms & Signs ──
  if (rx.symptoms) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('S/S:', margin, y);
    doc.setFont('helvetica', 'normal');
    const symptomsLines = doc.splitTextToSize(rx.symptoms, contentW - 12);
    doc.text(symptomsLines, margin + 11, y);
    y += symptomsLines.length * 4 + 2;
  }

  // ── Examination ──
  if (rx.examination) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('O/E:', margin, y);
    doc.setFont('helvetica', 'normal');
    const examinationLines = doc.splitTextToSize(rx.examination, contentW - 12);
    doc.text(examinationLines, margin + 11, y);
    y += examinationLines.length * 4 + 2;
  }

  // ── Diagnosis ──
  if (rx.diagnosis) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Dx:', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(rx.diagnosis, margin + 9, y);
    y += 6;
  }

  // ── Rx Symbol ──
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Rx', margin, y);
  y += 4;

  // ── Medicines Table ──
  doc.setFontSize(8.5);
  rx.medicines.forEach((med, i) => {
    if (y > 170) {
      doc.addPage();
      y = 15;
    }
    doc.setFont('helvetica', 'bold');
    doc.text(`${i + 1}.`, margin, y);
    doc.text(med.name, margin + 6, y);

    // Generic name in parentheses
    if (med.genericName) {
      const nameWidth = doc.getTextWidth(med.name);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text(`(${med.genericName})`, margin + 6 + nameWidth + 2, y);
      doc.setFontSize(8.5);
    }

    doc.setFont('helvetica', 'normal');
    const details = [med.dosage, med.frequency, med.duration].filter(Boolean).join('  |  ');
    doc.text(details, margin + 6, y + 4);

    if (med.instructions) {
      doc.setFont('helvetica', 'italic');
      doc.text(med.instructions, margin + 10, y + 8);
      y += 12;
    } else {
      y += 9;
    }
  });

  // ── Lab Tests ──
  if (rx.labTests.length > 0) {
    y += 2;
    if (y > 175) { doc.addPage(); y = 15; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Lab Investigations:', margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    rx.labTests.forEach((test) => {
      if (y > 185) { doc.addPage(); y = 15; }
      doc.text(`\u2022 ${test}`, margin + 4, y);
      y += 4;
    });
  }

  // ── Notes ──
  if (rx.notes) {
    y += 3;
    if (y > 175) { doc.addPage(); y = 15; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Advice:', margin, y);
    y += 4;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    const lines = doc.splitTextToSize(rx.notes, contentW - 4);
    doc.text(lines, margin + 4, y);
  }

  // ── CANCELLED Watermark ──
  if (rx.status === 'cancelled') {
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setTextColor(200, 50, 50);
      doc.setFontSize(48);
      doc.setFont('helvetica', 'bold');
      const wmText = 'CANCELLED';
      doc.text(wmText, pageW / 2, 120, { align: 'center', angle: 35 });
    }
    doc.setTextColor(0, 0, 0);
    doc.setPage(1);
  }

  // ── Footer ──
  const footerY = 195;

  // QR bottom-left
  if (qrDataUrl) {
    doc.addImage(qrDataUrl, 'PNG', margin, footerY - 18, 18, 18);
  }

  // Signature + stamp bottom-right
  const sigX = pageW - margin - 42;

  // Handwriting signature above the line
  if (profile.signatureBase64) {
    doc.addImage(profile.signatureBase64, 'PNG', sigX - 2, footerY - 30, 44, 12);
  }

  if (profile.stampBase64) {
    doc.addImage(profile.stampBase64, 'PNG', sigX, footerY - 22, 20, 20);
  }
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.line(sigX, footerY, sigX + 40, footerY);
  doc.text(`Dr. ${profile.fullName}`, sigX + 2, footerY + 4);

  return doc.output('blob');
}
