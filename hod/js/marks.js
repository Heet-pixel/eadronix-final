// hod/js/marks.js — Marks Module: Upload, Template, Process, Render, Export

/* ═══════════════════════════════════════════════════════
   MARKS UPLOAD MODULE
   Mid-Sem (30 marks) & GUT/Internal (30 marks) — separate
═════════════════════════════════════════════════════════ */

let marksType = 'mid';   // 'mid' | 'gut'
let marksCourse = '';
let marksSem = '';
let savedMarks = {};     // client-side cache, now populated FROM the server: savedMarks[course][sem][type] = [{id,name,roll,subjects:{subj:marks},total,totalMax,percentage,result}]
let marksLoading = false;
let marksThreshold = 60; // pass threshold (%) for marks reports — shared with reports.js, user-adjustable

// Maps our UI's short marksType keys to the examType string stored on the Mark
// document in MongoDB, so the same exam shows up consistently across reloads.
// Shared by both the Marks Upload screen (mid/gut only) and the Marks Report
// wizard (mid/gut/practical/remedial).
const MARKS_TYPE_TO_EXAM = { mid: 'Mid-Semester', gut: 'GTU/Internal', practical: 'Practical', remedial: 'Remedial' };

function loadMarksUpload(){
  marksType='mid'; marksCourse=''; marksSem='';
  renderMarksUpload();
}

// Fetches Mark documents for this course/sem/type from the server and reshapes
// them into the same { id, name, roll, subjects:{name:marks}, total, totalMax,
// percentage, result } shape the render/export functions already expect —
// so existing UI code below needs no changes, only the data source changes.
async function fetchExistingMarks(course, sem, type){
  const subjObjs = getSubjObjects(course, parseInt(sem));
  const students = allStudents.filter(s=>s.course===course && String(s.sem)===String(sem));
  if (!subjObjs.length || !students.length) return [];

  const examType = MARKS_TYPE_TO_EXAM[type] || type;
  const subjIdToName = Object.fromEntries(subjObjs.filter(s=>s.id).map(s=>[String(s.id), s.name]));
  const studentIds = new Set(students.map(s=>String(s.id || s._id)));

  const data = await apiJson(`/api/hod/marks?examType=${encodeURIComponent(examType)}`);
  const marks = data.marks || [];
  const maxPerSubj = 30;
  const totalMax = subjObjs.length * maxPerSubj;

  const byStudent = {};
  for (const m of marks) {
    const sid = String(m.student?._id || m.student);
    if (!studentIds.has(sid)) continue; // belongs to a different course/sem
    const subjId = String(m.subject?._id || m.subject || '');
    const subjName = subjIdToName[subjId];
    if (!subjName) continue; // not one of this sem's subjects
    if (!byStudent[sid]) byStudent[sid] = { student: students.find(s=>String(s.id||s._id)===sid), subjects: {} };
    byStudent[sid].subjects[subjName] = m.marks;
  }

  return Object.values(byStudent).filter(r => r.student).map(r => {
    let total = 0;
    subjObjs.forEach(s => { total += Number(r.subjects[s.name]) || 0; });
    const pct = totalMax > 0 ? Math.round(total / totalMax * 100) : 0;
    return {
      id: r.student.id || r.student._id,
      name: r.student.name,
      roll: r.student.roll,
      subjects: r.subjects,
      total, totalMax,
      percentage: pct,
      result: pct >= 40 ? 'Pass' : 'Fail'
    };
  });
}

function renderMarksUpload(){
  let html = `
  <div class="marks-type-tabs">
    <div class="mtype-tab mid ${marksType==='mid'?'active mid':''}" onclick="setMarksType('mid')">
      📄 Mid-Semester Exam <small style="font-size:10px;margin-left:4px;opacity:.7;">(30 Marks)</small>
    </div>
    <div class="mtype-tab gut ${marksType==='gut'?'active gut':''}" onclick="setMarksType('gut')">
      📋 GUT / Internal Exam <small style="font-size:10px;margin-left:4px;opacity:.7;">(30 Marks)</small>
    </div>
  </div>
  <div class="marks-info-banner">
    <b>How it works:</b> Select course & semester → Click <b>Download Template</b> to get an Excel file pre-filled with student names, roll numbers and all subject columns → Fill in marks → Upload the file back here. Totals & percentages are auto-calculated.
    <br>Currently editing: <b>${marksType==='mid'?'Mid-Semester Exam (Max 30 marks per subject)':'GUT / Internal Exam (Max 30 marks per subject)'}</b>
  </div>
  <div class="marks-selector-card">
    <h3>📄 Select Class</h3>
    <div class="marks-select-row">
      <div class="ms-group">
        <label>Course</label>
        <select onchange="setMarksCourse(this.value)">
          <option value="">-- Select Course --</option>
          ${HOD_COURSES.map(c=>`<option value="${c}" ${marksCourse===c?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="ms-group">
        <label>Semester</label>
        <select onchange="setMarksSem(this.value)" ${!marksCourse?'disabled':''}>
          <option value="">-- Select Semester --</option>
          ${marksCourse ? Array.from({length:SEM_COUNT},(_,i)=>`<option value="${i+1}" ${marksSem==i+1?'selected':''}>Semester ${i+1}</option>`).join('') : ''}
        </select>
      </div>
    </div>
    <div class="marks-action-row">
      <button class="btn btn-primary" onclick="downloadMarksTemplate()" ${!marksCourse||!marksSem?'disabled style="opacity:.5;cursor:not-allowed;"':''}>
        📄 Download Template Excel
      </button>
      <label class="btn btn-success" style="cursor:pointer;" ${!marksCourse||!marksSem?'title="Select course & sem first"':''}>
        📄 Upload Filled Excel
        <input type="file" accept=".xlsx,.xls,.csv" style="display:none;" onchange="handleMarksUpload(event)" ${!marksCourse||!marksSem?'disabled':''}>
      </label>
    </div>
  </div>`;

  // Show existing marks if available
  if(marksCourse && marksSem){
    if (marksLoading) {
      html += `<div class="empty-state" style="margin-top:10px;"><div class="e-icon">⏳</div><p>Loading existing marks…</p></div>`;
    } else {
      let existing = ((savedMarks[marksCourse]||{})[marksSem]||{})[marksType];
      if(existing && existing.length){
        html += renderMarksTable(existing, marksCourse, marksSem, marksType);
      } else {
        html += `<div class="empty-state" style="margin-top:10px;"><div class="e-icon">📄</div><p>No ${marksType==='mid'?'Mid-Sem':'GUT'} marks uploaded yet for ${marksCourse} Sem ${marksSem}.<br><small>Download the template, fill marks and upload.</small></p></div>`;
      }
    }
  }

  document.getElementById('marksUploadContent').innerHTML = html;
}

// Loads marks for the current course/sem/type from the server into the
// savedMarks cache, then re-renders. Called whenever course, sem, or type changes.
async function loadMarksForSelection(){
  if (!marksCourse || !marksSem) { renderMarksUpload(); return; }
  marksLoading = true;
  renderMarksUpload();
  try {
    const rows = await fetchExistingMarks(marksCourse, marksSem, marksType);
    if (!savedMarks[marksCourse]) savedMarks[marksCourse] = {};
    if (!savedMarks[marksCourse][marksSem]) savedMarks[marksCourse][marksSem] = {};
    savedMarks[marksCourse][marksSem][marksType] = rows;
  } catch (e) {
    showToast('Failed to load existing marks: ' + e.message, true);
  } finally {
    marksLoading = false;
    renderMarksUpload();
  }
}

function setMarksCourse(c){ marksCourse=c; marksSem=''; renderMarksUpload(); }
function setMarksSem(s){ marksSem=s; loadMarksForSelection(); }
function setMarksType(t){ marksType=t; if(marksCourse && marksSem) loadMarksForSelection(); else renderMarksUpload(); }

/* ═══════════════════════════════════════════════════════
   CLASS COORDINATOR / CUSTOM-NAMED EXAM SHEETS
   Separate from the Mid-Sem/GUT Excel workflow above — these are the
   arbitrarily-named sheets (e.g. "Unit Test 2") created from the teacher
   or Class Coordinator's "Add Marks" page. Read/publish only from here;
   HOD doesn't type marks in directly (that stays with the teacher/CC),
   but can view every subject + any student-uploaded proof screenshot, and
   can publish/unpublish on the CC's behalf.
═════════════════════════════════════════════════════════ */
let ccCourse = '';
let ccSem = '';
let ccExamType = '';
let ccSheetSubjects = [];
let ccSheetStudents = [];
let ccSheetMarks = [];
let ccSheetLoading = false;

function renderCCSheetPanel(){
  const el = document.getElementById('ccSheetPanel');
  if (!el) return;
  el.innerHTML = `
    <div class="marks-selector-card">
      <h3>🧑‍🏫 Class Coordinator / Custom Exam Sheets</h3>
      <p style="font-size:12px;color:var(--muted,#5c6480);margin:-6px 0 12px;">
        View any sheet a teacher or Class Coordinator has created from their own Add Marks page —
        works for any exam name, not just Mid-Sem/GUT. Also shows students' self-uploaded marksheet
        screenshots, and lets you send (publish) or withdraw the results.
      </p>
      <div class="marks-select-row">
        <div class="ms-group">
          <label>Course</label>
          <select onchange="setCCCourse(this.value)">
            <option value="">-- Select Course --</option>
            ${HOD_COURSES.map(c=>`<option value="${c}" ${ccCourse===c?'selected':''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="ms-group">
          <label>Semester</label>
          <select onchange="setCCSem(this.value)" ${!ccCourse?'disabled':''}>
            <option value="">-- Select Semester --</option>
            ${ccCourse ? Array.from({length:SEM_COUNT},(_,i)=>`<option value="${i+1}" ${ccSem==i+1?'selected':''}>Semester ${i+1}</option>`).join('') : ''}
          </select>
        </div>
        <div class="ms-group">
          <label>Exam / test name</label>
          <input type="text" id="ccExamTypeInput" placeholder="e.g. Unit Test 2" value="${ccExamType}"
            onchange="setCCExamType(this.value)" ${!ccCourse||!ccSem?'disabled':''}>
        </div>
      </div>
    </div>
    <div id="ccSheetTableWrap"></div>
  `;
  renderCCSheetTable();
}

function setCCCourse(c){ ccCourse=c; ccSem=''; ccExamType=''; ccSheetSubjects=[]; ccSheetStudents=[]; ccSheetMarks=[]; renderCCSheetPanel(); }
function setCCSem(s){ ccSem=s; ccExamType=''; ccSheetSubjects=[]; ccSheetStudents=[]; ccSheetMarks=[]; renderCCSheetPanel(); }
function setCCExamType(v){
  ccExamType = (v || '').trim();
  if (ccCourse && ccSem && ccExamType) loadCCSheet();
  else renderCCSheetTable();
}

async function loadCCSheet(){
  ccSheetLoading = true;
  renderCCSheetTable();
  try {
    ccSheetSubjects = getSubjObjects(ccCourse, parseInt(ccSem));
    ccSheetStudents = allStudents.filter(s => s.course === ccCourse && String(s.sem) === String(ccSem));
    if (!ccSheetSubjects.length || !ccSheetStudents.length) {
      ccSheetMarks = [];
      return;
    }
    const data = await apiJson(`/api/hod/marks?examType=${encodeURIComponent(ccExamType)}`);
    const subjIds = new Set(ccSheetSubjects.filter(s=>s.id).map(s=>String(s.id)));
    const stuIds  = new Set(ccSheetStudents.map(s=>String(s.id||s._id)));
    ccSheetMarks = (data.marks || []).filter(m => {
      const sid = String(m.subject?._id || m.subject || '');
      const stid = String(m.student?._id || m.student || '');
      return subjIds.has(sid) && stuIds.has(stid);
    });
  } catch (e) {
    showToast('Failed to load sheet: ' + e.message, true);
    ccSheetMarks = [];
  } finally {
    ccSheetLoading = false;
    renderCCSheetTable();
  }
}

function renderCCSheetTable(){
  const wrap = document.getElementById('ccSheetTableWrap');
  if (!wrap) return;
  if (!ccCourse || !ccSem || !ccExamType) {
    wrap.innerHTML = `<div class="empty-state" style="margin-top:10px;"><div class="e-icon">🧑‍🏫</div><p>Select course, semester &amp; type an exam name to load a sheet.</p></div>`;
    return;
  }
  if (ccSheetLoading) {
    wrap.innerHTML = `<div class="empty-state" style="margin-top:10px;"><div class="e-icon">⏳</div><p>Loading…</p></div>`;
    return;
  }
  if (!ccSheetSubjects.length || !ccSheetStudents.length) {
    wrap.innerHTML = `<div class="empty-state" style="margin-top:10px;"><div class="e-icon">📄</div><p>No subjects/students found for ${ccCourse} Sem ${ccSem}.</p></div>`;
    return;
  }

  const byKey = {};
  ccSheetMarks.forEach(m => {
    const sid = String(m.subject?._id || m.subject || '');
    const stid = String(m.student?._id || m.student || '');
    byKey[`${stid}__${sid}`] = m;
  });

  const anyPublished = ccSheetMarks.some(m => m.published);
  const anyRows = ccSheetMarks.length > 0;

  const head = `
    <tr>
      <th style="text-align:left">Student</th>
      ${ccSheetSubjects.map(s=>`<th>${s.name}</th>`).join('')}
    </tr>`;
  const rows = ccSheetStudents.map(stu => {
    const cells = ccSheetSubjects.map(subj => {
      const m = subj.id ? byKey[`${stu.id||stu._id}__${subj.id}`] : null;
      if (!m) return `<td style="color:var(--muted2,#9aa3bf)">—</td>`;
      const hasNum = typeof m.marks === 'number';
      const proof = m.image ? `<a href="${m.image}" target="_blank" title="View student-uploaded screenshot">🖼️</a>` : '';
      const pub = m.published ? '<span style="color:var(--green,#16a34a);font-weight:900" title="Sent to student">✓</span>' : '<span style="color:var(--yellow,#d97706)" title="Not sent yet">•</span>';
      return `<td>${hasNum ? m.marks : (proof ? 'Uploaded' : '—')} ${proof} ${pub}</td>`;
    }).join('');
    return `<tr><td style="text-align:left">${stu.name}<br><small style="color:var(--muted2,#9aa3bf)">${stu.roll||''}</small></td>${cells}</tr>`;
  }).join('');

  wrap.innerHTML = `
    <div class="marks-selector-card">
      <table class="marks-table" style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>${head}</thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="marks-action-row" style="margin-top:14px">
        <button class="btn btn-success" onclick="ccSheetPublish(true)" ${!anyRows?'disabled':''}>📤 Send to Students</button>
        <button class="btn btn-ghost" onclick="ccSheetPublish(false)" ${!anyRows?'disabled':''}>↩️ Unpublish</button>
        ${anyRows ? `<span style="margin-left:10px;font-size:12px;color:var(--muted,#5c6480)">${anyPublished ? 'Some/all rows already sent.' : 'Not sent to students yet.'}</span>` : ''}
      </div>
    </div>`;
}

async function ccSheetPublish(publish){
  try {
    const res = await apiJson('/api/hod/marks/publish', {
      method: 'PATCH',
      body: JSON.stringify({ course: ccCourse, semester: Number(ccSem), examType: ccExamType, publish }),
    });
    showToast(res.message || (publish ? 'Marks sent.' : 'Marks unpublished.'));
    loadCCSheet();
  } catch (e) {
    showToast('Failed: ' + e.message, true);
  }
}

function downloadMarksTemplate(){
  if(!marksCourse||!marksSem){showToast('Please select course and semester.',true);return;}
  let subjects = getSubjNames(marksCourse, parseInt(marksSem));
  if(!subjects.length){showToast('No subjects found for this selection.',true);return;}
  let students = allStudents.filter(s=>s.course===marksCourse && String(s.sem)===String(marksSem));
  if(!students.length){showToast('No students found.',true);return;}

  let typeLbl = marksType==='mid'?'Mid_Sem':'GUT_Internal';
  let maxMarks = 30;

  // Build workbook
  let wb = XLSX.utils.book_new();

  // Header rows
  let headerRow1 = ['Student Name','Roll Number'];
  let headerRow2 = ['',''];
  subjects.forEach(sub=>{
    headerRow1.push(sub);
    headerRow2.push(`Max: ${maxMarks}`);
  });
  headerRow1.push('Total','Percentage (%)','Result');
  headerRow2.push(`Max: ${subjects.length*maxMarks}`,'','');

  let data = [headerRow1, headerRow2];

  students.forEach(s=>{
    let row = [s.name, s.roll];
    subjects.forEach(()=>row.push(''));  // blank marks columns
    let totalFormula = '';
    row.push('', '', '');  // Total, %, Result — blank for user to fill or auto
    data.push(row);
  });

  let ws = XLSX.utils.aoa_to_sheet(data);

  // Column widths
  ws['!cols'] = [
    {wch:24}, {wch:14},
    ...subjects.map(()=>({wch:18})),
    {wch:10},{wch:16},{wch:10}
  ];

  // Freeze first row
  ws['!freeze'] = {xSplit:2, ySplit:2};

  let sheetName = `${marksCourse}_Sem${marksSem}_${typeLbl}`;
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0,31));

  XLSX.writeFile(wb, `${sheetName}_Marks_Template.xlsx`);
  showToast('Template downloaded! Fill in marks and upload back.');
}

function handleMarksUpload(event){
  let file = event.target.files[0];
  event.target.value = '';
  if(!file) return;
  if(!marksCourse||!marksSem){showToast('Please select course and semester first.',true);return;}
  parseExcelFile(file,(err,headers,rows)=>{
    if(err||!headers.length){showToast('Could not read file.',true);return;}
    processMarksData(headers, rows);
  });
}

async function processMarksData(headers, rows){
  let subjObjs = getSubjObjects(marksCourse, parseInt(marksSem));
  let subjects = subjObjs.map(s=>s.name);
  let students = allStudents.filter(s=>s.course===marksCourse && String(s.sem)===String(marksSem));
  let maxPerSubj = 30;
  let totalMax = subjects.length * maxPerSubj;
  let examType = MARKS_TYPE_TO_EXAM[marksType] || marksType;

  // Try to match by roll number first, then name
  let processed = [];
  let apiRecords = []; // flattened per-subject records to send to the bulk-upsert endpoint

  rows.forEach(row=>{
    // Skip header rows
    let rollVal = String(row[headers[1]]||'').trim();
    let nameVal = String(row[headers[0]]||'').trim();
    if(!nameVal || nameVal.toLowerCase().includes('student') || nameVal.toLowerCase().includes('name') || nameVal.toLowerCase().includes('max')) return;

    let student = students.find(s=>s.roll===rollVal) || students.find(s=>s.name.toLowerCase()===nameVal.toLowerCase());
    if(!student) return;

    let subjectMarks = {};
    let total = 0;
    subjObjs.forEach((sub,i)=>{
      let colHeader = headers[2+i];
      let val = parseFloat(row[colHeader]||0)||0;
      val = Math.min(val, maxPerSubj); // cap at max
      subjectMarks[sub.name] = val;
      total += val;
      if (sub.id) {
        apiRecords.push({ student: student.id || student._id, subject: sub.id, subjectName: sub.name, examType, marks: val, maxMarks: maxPerSubj });
      }
    });

    let pct = totalMax>0 ? Math.round(total/totalMax*100) : 0;
    processed.push({
      id: student.id,
      name: student.name,
      roll: student.roll,
      subjects: subjectMarks,
      total,
      totalMax,
      percentage: pct,
      result: pct>=40?'Pass':'Fail'
    });
  });

  if(!processed.length){showToast('No matching student data found. Ensure Roll Numbers match.',true);return;}

  // Persist to the database (upsert — re-uploading the same sheet updates rows
  // instead of creating duplicates). If subjects have no resolvable ID (older
  // SUBJECTS data shape), we still update the local cache so the UI keeps working,
  // but warn since those marks won't survive a page reload.
  if (apiRecords.length) {
    try {
      await apiJson('/api/hod/marks/bulk-upsert', { method: 'POST', body: JSON.stringify({ records: apiRecords }) });
    } catch (e) {
      showToast('Marks parsed but failed to save to server: ' + e.message, true);
      return;
    }
  } else {
    showToast('Marks updated locally, but subjects are missing IDs — they will not be saved permanently. Please refresh subjects and retry.', true);
  }

  if(!savedMarks[marksCourse]) savedMarks[marksCourse]={};
  if(!savedMarks[marksCourse][marksSem]) savedMarks[marksCourse][marksSem]={};
  savedMarks[marksCourse][marksSem][marksType] = processed;

  showToast(`✅ Marks uploaded and saved! ${processed.length} students updated.`);
  renderMarksUpload();
}

function renderMarksTable(data, course, sem, type){
  let subjects = getSubjNames(course, parseInt(sem));
  let typeLbl = type==='mid'?'Mid-Semester':'GUT / Internal';
  let pass = data.filter(d=>d.result==='Pass').length;
  let fail = data.length - pass;
  let avg = data.length ? Math.round(data.reduce((a,b)=>a+b.percentage,0)/data.length) : 0;

  let html = `
  <div class="marks-result-card">
    <h3>📚 ${typeLbl} Marks — ${course} Semester ${sem}</h3>
    <div class="marks-result-summary">
      <div class="mrs-chip"><div class="mrs-val">${data.length}</div><div class="mrs-lbl">Students</div></div>
      <div class="mrs-chip"><div class="mrs-val" style="color:var(--success);">${pass}</div><div class="mrs-lbl">Pass</div></div>
      <div class="mrs-chip"><div class="mrs-val" style="color:var(--danger);">${fail}</div><div class="mrs-lbl">Fail</div></div>
      <div class="mrs-chip"><div class="mrs-val" style="color:var(--accent2);">${avg}%</div><div class="mrs-lbl">Avg %</div></div>
    </div>
    <div class="report-export-bar">
      <span style="font-size:13px;font-weight:700;color:var(--text2);">Export:</span>
      <button class="export-btn excel" onclick="exportMarksExcel()">📚 Excel</button>
    </div>
    <div class="tbl-scroll">
      <table class="report-table" id="marksResultTable">
        <thead>
          <tr>
            <th>#</th><th>Student Name</th><th>Roll No.</th>
            ${subjects.map(s=>`<th>${s.split(' ').slice(0,2).join(' ')}<br><small style="font-weight:500;opacity:.7;">/ 30</small></th>`).join('')}
            <th>Total</th><th>%</th><th>Result</th>
          </tr>
        </thead>
        <tbody>
          ${data.map((d,i)=>{
            let rc = d.result==='Pass'?'badge-green':'badge-red';
            return `<tr>
              <td>${i+1}</td>
              <td><b>${d.name}</b></td>
              <td>${d.roll}</td>
              ${subjects.map(s=>{
                let m=d.subjects[s]||0;
                let pct2=Math.round(m/30*100); let cls=pct2>=(marksThreshold||60)?'badge-green':pct2>=(marksThreshold*0.67||40)?'badge-yellow':'badge-red';
                return `<td><span class="badge ${cls}">${m}</span></td>`;
              }).join('')}
              <td><b>${d.total}/${d.totalMax}</b></td>
              <td><b>${d.percentage}%</b></td>
              <td><span class="badge ${rc}">${d.result}</span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
  return html;
}

function exportMarksExcel(){
  let table = document.getElementById('marksResultTable');
  if(!table){showToast('No data to export.',true);return;}
  try{
    let wb = XLSX.utils.book_new();
    let ws = XLSX.utils.table_to_sheet(table);
    let fn = `${marksCourse}_Sem${marksSem}_${marksType==='mid'?'MidSem':'GUT'}_Marks`;
    XLSX.utils.book_append_sheet(wb, ws, 'Marks');
    XLSX.writeFile(wb, fn+'.xlsx');
    showToast('Marks Excel downloaded!');
  }catch(e){showToast('Export failed: '+e.message,true);}
}

