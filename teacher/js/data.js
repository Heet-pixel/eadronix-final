// teacher/js/data.js — Shared constants and pure helper utilities
// NO mock data. All student/subject/attendance data comes from the backend API.

const SUBJ_COLORS = ['#7c3aed','#059669','#2563eb','#d97706','#dc2626','#4338ca','#0284c7','#16a34a','#db2777','#ea580c'];
const DAYS        = ['Mon','Tue','Wed','Thu','Fri','Sat'];

// ─── Pure helpers ───
function hashCode(str) { let h = 0; for (const c of str) h = ((h << 5) - h + c.charCodeAt(0)) | 0; return Math.abs(h); }
function getSemSuffix(n) { return (['','1st','2nd','3rd','4th','5th','6th'][n] || n + 'th'); }

// Filter a lectures array by time range key
function filterLectures(lectures, rangeKey) {
  if (rangeKey === 'all') return lectures;
  const now    = new Date();
  const cutoff = new Date(now);
  if      (rangeKey === 'week')   cutoff.setDate(now.getDate() - 7);
  else if (rangeKey === 'month1') cutoff.setMonth(now.getMonth() - 1);
  else if (rangeKey === 'month2') cutoff.setMonth(now.getMonth() - 2);
  else if (rangeKey === 'month3') cutoff.setMonth(now.getMonth() - 3);
  const cutStr = cutoff.toISOString().split('T')[0];
  return lectures.filter(l => l.date >= cutStr);
}
