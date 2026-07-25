/**
 * SAL Portal – PDF Report Generator
 * File: src/utils/pdfReport.js
 *
 * Produces real, server-rendered PDF documents (via pdfkit) for attendance
 * and marks reports. Replaces the old frontend approach of opening a new
 * window and calling window.print() — that wasn't a real PDF export, it was
 * a manual "print dialog" step that breaks under popup blockers and gives no
 * control over layout.
 *
 * Usage:
 *   streamAttendanceReportPdf(res, { title, subtitle, rows, generatedBy })
 *   streamMarksReportPdf(res, { title, subtitle, rows, generatedBy })
 *   streamTablePdf(res, { title, subtitle, columns, rows, generatedBy }) — generic fallback
 *
 * Each function sets the correct headers and pipes the document directly to
 * the Express response; callers don't need to touch pdfkit themselves.
 */

import PDFDocument from 'pdfkit';

const BRAND = '#4f46e5';
const TEXT_DARK = '#1f2937';
const TEXT_MUTED = '#6b7280';
const BORDER = '#e5e7eb';
const ROW_ALT = '#f9fafb';

function setHeaders(res, filename) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
}

function drawHeader(doc, { title, subtitle, generatedBy }) {
  doc.fillColor(BRAND).fontSize(20).font('Helvetica-Bold').text('SAL Attendance Management System', { align: 'left' });
  doc.moveDown(0.2);
  doc.fillColor(TEXT_DARK).fontSize(14).font('Helvetica-Bold').text(title);
  if (subtitle) {
    doc.fillColor(TEXT_MUTED).fontSize(10).font('Helvetica').text(subtitle);
  }
  const generatedLine = `Generated ${new Date().toLocaleString('en-IN')}${generatedBy ? ` by ${generatedBy}` : ''}`;
  doc.fillColor(TEXT_MUTED).fontSize(8).text(generatedLine);
  doc.moveDown(0.6);
  doc.strokeColor(BORDER).lineWidth(1).moveTo(doc.x, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
  doc.moveDown(0.8);
}

/**
 * Generic table renderer with column widths, used by all report types below.
 * columns: [{ key, label, width }]
 * rows: [{ key: value, ... }]
 */
function drawTable(doc, { columns, rows }) {
  const startX = doc.page.margins.left;
  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colWidths = columns.map(c => c.width || usableWidth / columns.length);
  const rowHeight = 22;

  function drawRow(y, cells, { header = false, alt = false } = {}) {
    if (header) {
      doc.rect(startX, y, usableWidth, rowHeight).fill(BRAND);
    } else if (alt) {
      doc.rect(startX, y, usableWidth, rowHeight).fill(ROW_ALT);
    }
    let x = startX;
    doc.fontSize(9).font(header ? 'Helvetica-Bold' : 'Helvetica').fillColor(header ? '#ffffff' : TEXT_DARK);
    cells.forEach((cell, i) => {
      doc.text(String(cell ?? ''), x + 6, y + 6, { width: colWidths[i] - 12, ellipsis: true });
      x += colWidths[i];
    });
  }

  function drawHeaderRow() {
    drawRow(doc.y, columns.map(c => c.label), { header: true });
    doc.moveDown(rowHeight / doc.currentLineHeight());
    doc.y += 2;
  }

  drawHeaderRow();

  rows.forEach((row, idx) => {
    if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      drawHeaderRow();
    }
    const cells = columns.map(c => (typeof c.format === 'function' ? c.format(row[c.key], row) : row[c.key]));
    drawRow(doc.y, cells, { alt: idx % 2 === 1 });
    doc.y += rowHeight;
  });

  doc.strokeColor(BORDER).lineWidth(0.5).moveTo(startX, doc.y).lineTo(startX + usableWidth, doc.y).stroke();
}

function newDoc() {
  return new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
}

/**
 * Generic table PDF — used as a fallback for any tabular report.
 */
export function streamTablePdf(res, { filename, title, subtitle, columns, rows, generatedBy }) {
  const doc = newDoc();
  setHeaders(res, filename || 'report.pdf');
  doc.pipe(res);
  drawHeader(doc, { title, subtitle, generatedBy });
  if (!rows.length) {
    doc.fillColor(TEXT_MUTED).fontSize(11).text('No records found for the selected filters.');
  } else {
    drawTable(doc, { columns, rows });
  }
  doc.end();
}

/**
 * Attendance report PDF.
 * rows: [{ name, roll, course, semester, total, present, absent, percentage }]
 */
export function streamAttendanceReportPdf(res, { filename, title, subtitle, rows, generatedBy }) {
  streamTablePdf(res, {
    filename: filename || 'attendance-report.pdf',
    title: title || 'Attendance Report',
    subtitle,
    generatedBy,
    columns: [
      { key: 'roll', label: 'Roll No', width: 70 },
      { key: 'name', label: 'Student Name', width: 150 },
      { key: 'total', label: 'Total', width: 60 },
      { key: 'present', label: 'Present', width: 60 },
      { key: 'absent', label: 'Absent', width: 60 },
      { key: 'percentage', label: '%', width: 50, format: v => `${v ?? 0}%` }
    ],
    rows
  });
}

/**
 * Individual student's subject-wise attendance PDF (one row per subject, not per student).
 * Used for the student/parent "download my attendance" certificate.
 * rows: [{ name (subject name), total, present, absent, percentage }]
 */
export function streamSubjectAttendancePdf(res, { filename, title, subtitle, rows, generatedBy }) {
  streamTablePdf(res, {
    filename: filename || 'my-attendance.pdf',
    title: title || 'Attendance Certificate',
    subtitle,
    generatedBy,
    columns: [
      { key: 'name', label: 'Subject', width: 200 },
      { key: 'total', label: 'Total Lectures', width: 100 },
      { key: 'present', label: 'Present', width: 80 },
      { key: 'absent', label: 'Absent', width: 80 },
      { key: 'percentage', label: '%', width: 50, format: v => `${v ?? 0}%` }
    ],
    rows
  });
}

/**
 * Marks / results report PDF.
 * rows: [{ name, roll, totalMarks, totalMax, percentage }]
 */
export function streamMarksReportPdf(res, { filename, title, subtitle, rows, generatedBy }) {
  streamTablePdf(res, {
    filename: filename || 'marks-report.pdf',
    title: title || 'Marks Report',
    subtitle,
    generatedBy,
    columns: [
      { key: 'roll', label: 'Roll No', width: 70 },
      { key: 'name', label: 'Student Name', width: 160 },
      { key: 'totalMarks', label: 'Marks Obtained', width: 110 },
      { key: 'totalMax', label: 'Max Marks', width: 90 },
      { key: 'percentage', label: '%', width: 50, format: v => `${v ?? 0}%` }
    ],
    rows
  });
}
