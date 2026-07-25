// hod/js/excel.js — Excel / File Import & Export: Parse, Map Columns, Import, Export

/* ═══ REPORTS ═══ */
function loadReports(){rptCourse=null;rptType=null;rptView=null;rptSem=null;renderReportStage();}
function renderReportStage(){
  let html=`<div class="course-picker" style="margin-bottom:16px;">${HOD_COURSES.map(c=>`<div class="cpick ${rptCourse===c?'active':''}" onclick="setRptCourse('${c}')"><h4>${c}</h4><p>Select for report</p></div>`).join("")}</div>`;
  if(rptCourse){
    let sc=allStudents.filter(s=>s.course===rptCourse).length,tc=allTeachers.filter(t=>t.course===rptCourse).length;
    html+=`<div class="report-type-cards"><div class="rtype-btn ${rptType==='student'?'active':''}" onclick="setRptType('student')"><h4>📚 Students</h4><p>${sc} total students</p></div><div class="rtype-btn ${rptType==='teacher'?'active':''}" onclick="setRptType('teacher')"><h4>🧑‍🏫 Teachers</h4><p>${tc} total teachers</p></div></div>`;
  }
  if(rptCourse&&rptType==="student"){
    html+=`<div class="report-type-cards"><div class="rtype-btn ${rptView==='all'?'active':''}" onclick="setRptView('all')"><h4>📋 All Students</h4><p>All ${rptCourse}</p></div><div class="rtype-btn ${rptView==='semwise'?'active':''}" onclick="setRptView('semwise')"><h4>🗂 Sem-wise</h4><p>By semester</p></div></div>`;
    if(rptView==="semwise"){html+=`<div class="sem-tabs" style="margin-bottom:16px;">${Array.from({length:SEM_COUNT},(_,i)=>`<div class="sem-tab ${rptSem===i+1?'active':''}" onclick="setRptSem(${i+1})">Sem ${i+1}</div>`).join("")}</div>`;}
    if(rptView==="all"||(rptView==="semwise"&&rptSem)){html+=renderStuAttFilters();let rows=stuReports.filter(s=>s.course===rptCourse&&(rptView==="all"||s.sem===rptSem));html+=renderStudentAttendanceTable(rows);}
  }
  if(rptCourse&&rptType==="teacher"){html+=renderTchrFilters();let rows=tchrReports.filter(t=>t.course===rptCourse);html+=renderTeacherReportTable(rows);}
  document.getElementById("reportContent").innerHTML=html;
}
function setRptCourse(c){rptCourse=c;rptType=null;rptView=null;rptSem=null;renderEnhancedReports();}
function setRptType(t){rptType=t;rptView=null;rptSem=null;renderEnhancedReports();}
function setRptView(v){rptView=v;rptSem=null;renderEnhancedReports();}
function setRptSem(s){rptSem=s;renderEnhancedReports();}
function applyRptFilter(){rptDateFrom=document.getElementById("rptFrom")?.value||rptDateFrom;rptDateTo=document.getElementById("rptTo")?.value||rptDateTo;rptDuration=document.getElementById("rptDuration")?.value||'';renderReportStage();}
function renderStuAttFilters(){return `<div class="report-filters"><div class="filter-group"><label>From Date</label><input type="date" id="rptFrom" value="${rptDateFrom}"></div><div class="filter-group"><label>To Date</label><input type="date" id="rptTo" value="${rptDateTo}"></div><div class="filter-group"><label>&nbsp;</label><button class="btn btn-primary" onclick="applyRptFilter()">Apply Filter</button></div></div>`;}
function renderTchrFilters(){return `<div class="report-filters"><div class="filter-group"><label>From Date</label><input type="date" id="rptFrom" value="${rptDateFrom}"></div><div class="filter-group"><label>To Date</label><input type="date" id="rptTo" value="${rptDateTo}"></div><div class="filter-group"><label>Duration (hrs)</label><input type="text" id="rptDuration" value="${rptDuration}" placeholder="e.g. 2.10 hr"></div><div class="filter-group"><label>&nbsp;</label><button class="btn btn-primary" onclick="applyRptFilter()">Apply Filter</button></div></div>`;}
function renderStudentAttendanceTable(rows){
  let total=rows.length,regular=rows.filter(r=>r.status==="Regular").length,shortage=rows.length-regular;
  let html=`<div class="report-summary"><div class="rsumm"><span>${total}</span><small>Total Students</small></div><div class="rsumm"><span style="color:var(--success);">${regular}</span><small>Regular ≥75%</small></div><div class="rsumm"><span style="color:var(--danger);">${shortage}</span><small>Shortage &lt;75%</small></div><div class="rsumm"><span style="color:var(--accent2);font-size:13px;">${rptDateFrom} → ${rptDateTo}</span><small>Duration</small></div></div>`;
  if(!rows.length)return html+`<div class="report-card"><div class="empty-state"><div class="e-icon">📄</div><p>No data found.</p></div></div>`;
  let semForSubs=rptSem||1;
  let sampleSubs=getSubjNames(rptCourse,semForSubs);
  html+=`<div class="report-export-bar">
    <span style="font-size:13px;font-weight:700;color:var(--text2);">Export as:</span>
    <button class="export-btn excel" onclick="exportReport('excel','student')">📚 Excel</button>
    <button class="export-btn word" onclick="exportReport('word','student')">📄 Word</button>
    <button class="export-btn pdf" onclick="exportReport('pdf','student')">📄„ PDF</button>
  </div>`;
  html+=`<div class="report-card"><h3>📚 Subject-wise Attendance — ${rptCourse}${rptSem?' Sem '+rptSem:' (All Semesters)'}</h3><div class="tbl-scroll"><table class="report-table" id="reportTableStudent"><thead><tr><th>Name</th><th>Roll</th><th>Sem</th>`;
  sampleSubs.forEach(s=>html+=`<th>${s.split(" ").slice(0,2).join(" ")}</th>`);
  html+=`<th>Overall</th><th>%</th><th>Status</th></tr></thead><tbody>`;
  rows.forEach(r=>{
    let subs=r.subjects||[];
    html+=`<tr><td><b>${r.name}</b></td><td>${r.roll}</td><td>Sem ${r.sem}</td>`;
    subs.forEach(s=>{let cls=s.pct>=75?'badge-green':s.pct>=60?'badge-yellow':'badge-red';html+=`<td><span class="badge ${cls}">${s.attended}/${s.total} (${s.pct}%)</span></td>`;});
    html+=`<td><b>${r.overallAtt}/${r.overallTotal}</b></td><td><b>${r.percentage}%</b></td><td><span class="badge ${r.status==='Regular'?'badge-green':'badge-red'}">${r.status}</span></td></tr>`;
  });
  html+=`</tbody></table></div></div>`;
  return html;
}
function renderTeacherReportTable(rows){
  let durLabel=rptDuration?` | Duration: ${rptDuration}`:'';
  let html=`<div class="report-summary"><div class="rsumm"><span>${rows.length}</span><small>Total Teachers</small></div><div class="rsumm"><span style="color:var(--success);">${rows.filter(r=>r.teacherAttendance>=90).length}</span><small>Attendance ≥90%</small></div><div class="rsumm"><span style="color:var(--accent2);">${rows.filter(r=>r.syllabusCompleted>=80).length}</span><small>Syllabus ≥80%</small></div>${rptDuration?`<div class="rsumm"><span style="color:var(--warn);">${rptDuration}</span><small>Duration Filter</small></div>`:''}</div>
  <div class="report-export-bar">
    <span style="font-size:13px;font-weight:700;color:var(--text2);">Export as:</span>
    <button class="export-btn excel" onclick="exportReport('excel','teacher')">📚 Excel</button>
    <button class="export-btn word" onclick="exportReport('word','teacher')">📄 Word</button>
    <button class="export-btn pdf" onclick="exportReport('pdf','teacher')">📄„ PDF</button>
  </div>
  <div class="report-card"><h3>🧑‍🏫 Teacher Report — ${rptCourse}${durLabel}</h3><div class="tbl-scroll"><table class="report-table" id="reportTableTeacher"><thead><tr><th>Name</th><th>Subject</th><th>Designation</th><th>Lec Sched.</th><th>Lec Taken</th><th>Syllabus %</th><th>Avg Duration</th><th>Attendance %</th></tr></thead><tbody>`;
  rows.forEach(t=>{let sCls=t.syllabusCompleted>=80?'badge-green':t.syllabusCompleted>=60?'badge-yellow':'badge-red';let aCls=t.teacherAttendance>=90?'badge-green':t.teacherAttendance>=75?'badge-yellow':'badge-red';html+=`<tr><td><b>${t.name}</b></td><td>${t.subject}</td><td>${t.designation}</td><td>${t.totalLectures}</td><td>${t.taken}</td><td><span class="badge ${sCls}">${t.syllabusCompleted}%</span></td><td>${t.avgLectureTime} min</td><td><span class="badge ${aCls}">${t.teacherAttendance}%</span></td></tr>`;});
  html+=`</tbody></table></div></div>`;
  return html;
}


// ─── Export Helpers ───
/* ═══ EXPORT REPORTS ═══ */
function exportReport(format, type){
  let tableId=type==='student'?'reportTableStudent':'reportTableTeacher';
  let table=document.getElementById(tableId);
  if(!table){showToast('No report data to export.',true);return;}
  let title=type==='student'?`Attendance_Report_${rptCourse||'All'}`:  `Teacher_Report_${rptCourse||'All'}`;
  if(format==='excel'){
    exportToExcel(table, title);
  } else if(format==='word'){
    exportToWord(table, title);
  } else if(format==='pdf'){
    exportToPDF(table, title);
  }
}
function exportToExcel(table, filename){
  try{
    let wb=XLSX.utils.book_new();
    let ws=XLSX.utils.table_to_sheet(table);
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, filename+'.xlsx');
    showToast('Excel file downloaded!');
  }catch(e){showToast('Export failed: '+e.message,true);}
}
function exportToWord(table, filename){
  try{
    let html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:Arial,sans-serif;font-size:12px;}table{border-collapse:collapse;width:100%;}th,td{border:1px solid #ddd;padding:8px;text-align:left;}th{background:#f2f2f2;font-weight:bold;}tr:nth-child(even){background:#f9f9f9;}h2{color:#2563eb;}</style></head><body><h2>${filename.replace(/_/g,' ')}</h2><p>Generated: ${new Date().toLocaleDateString()}</p>${table.outerHTML}</body></html>`;
    let blob=new Blob(['\ufeff',html],{type:'application/msword'});
    let url=URL.createObjectURL(blob);
    let a=document.createElement('a');a.href=url;a.download=filename+'.doc';a.click();URL.revokeObjectURL(url);
    showToast('Word file downloaded!');
  }catch(e){showToast('Export failed: '+e.message,true);}
}
function exportToPDF(table, filename){
  try{
    let html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:Arial,sans-serif;font-size:11px;margin:20px;}table{border-collapse:collapse;width:100%;}th,td{border:1px solid #888;padding:6px 8px;text-align:left;}th{background:#e8edf5;font-weight:bold;}tr:nth-child(even){background:#f5f7fb;}h2{color:#2563eb;margin-bottom:5px;}p{color:#666;font-size:10px;margin-bottom:15px;}@media print{body{margin:0;}}</style></head><body><h2>${filename.replace(/_/g,' ')}</h2><p>Generated: ${new Date().toLocaleString()} | HAT Portal</p>${table.outerHTML}</body></html>`;
    let w=window.open('','_blank');
    w.document.write(html);w.document.close();
    setTimeout(()=>{w.focus();w.print();},400);
    showToast('PDF opened for printing!');
  }catch(e){showToast('Export failed: '+e.message,true);}
}


// ─── Excel Upload & Column Mapper ───
/* ═══ EXCEL UPLOAD ═══ */
let _stuExcelRows=[],_stuExcelHeaders=[];
let _tchrExcelRows=[],_tchrExcelHeaders=[];
// The list of student fields the import screen knows how to map spreadsheet
// columns onto. `key` must match what the backend's createStudent() function
// expects to receive; `label` is only the human-readable text shown in the UI.
//
// IMPORTANT: `parentEmail` was missing from this list for a long time, even
// though the backend requires a parent email for every student created
// through the main "Add Student" form. Because this list — and the
// downloadable template below — never offered a way to provide one, every
// single row imported through Excel used to fail validation silently,
// which is why imports would report "0 students imported" with no
// visible error. Bulk import now treats a missing parent email as
// optional (it can be added later from the student's own details page),
// but we still list the column here so HODs *can* supply it up front if
// they already have the data.
const STU_FIELDS=[{key:'name',label:'Full Name *'},{key:'roll',label:'Roll No *'},{key:'sem',label:'Semester'},{key:'gender',label:'Gender'},{key:'phone',label:'Phone'},{key:'email',label:'Email'},{key:'dob',label:'Date of Birth'},{key:'bloodGroup',label:'Blood Group'},{key:'address',label:'Address'},{key:'city',label:'City'},{key:'parentName',label:'Parent Name'},{key:'parentEmail',label:'Parent Email'},{key:'parentPhone',label:'Parent Phone'},{key:'admissionYear',label:'Admission Year'},{key:'category',label:'Category'},{key:'status',label:'Status'}];
const TCHR_FIELDS=[{key:'name',label:'Full Name *'},{key:'subject',label:'Subject *'},{key:'designation',label:'Designation'},{key:'phone',label:'Phone'},{key:'email',label:'Email'},{key:'qualification',label:'Qualification'},{key:'experience',label:'Experience'},{key:'joinDate',label:'Join Date'},{key:'status',label:'Status'}];
function downloadTemplate(filename, sheetName, headers, sampleRows){
  if(typeof XLSX==='undefined'){showToast('Excel library is not loaded.',true);return;}
  const wb=XLSX.utils.book_new();
  const ws=XLSX.utils.json_to_sheet(sampleRows.length?sampleRows:[Object.fromEntries(headers.map(h=>[h,'']))], { header: headers });
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename+'.xlsx');
  showToast(filename.replace(/_/g,' ')+' downloaded!');
}
function downloadStudentTemplate(){
  const headers=['Full Name','Roll No','Semester','Gender','Phone','Email','Date of Birth','Blood Group','Address','City','Parent Name','Parent Email','Parent Phone','Admission Year','Category','Status'];
  downloadTemplate(`Student_Import_Template_${activeStuCourse||'AllCourses'}`, 'Students', headers, [{
    'Full Name':'Example Student','Roll No':'BCA001','Semester':activeStuSem||1,'Gender':'Male','Phone':'9876543210',
    'Email':'student@example.com','Date of Birth':'2005-01-15','Blood Group':'B+','Address':'Street address',
    'City':'Ahmedabad','Parent Name':'Parent Name','Parent Email':'parent@example.com','Parent Phone':'9876543211','Admission Year':new Date().getFullYear(),
    'Category':'General','Status':'Active'
  }]);
}
function downloadTeacherTemplate(){
  const headers=['Full Name','Subject','Designation','Phone','Email','Qualification','Experience','Join Date','Status'];
  downloadTemplate(`Teacher_Import_Template_${activeTchrCourse||'AllCourses'}`, 'Teachers', headers, [{
    'Full Name':'Example Teacher','Subject':'Mathematics','Designation':'Assistant Professor','Phone':'9876543210',
    'Email':'teacher@example.com','Qualification':'M.Tech','Experience':'3 years','Join Date':'2026-06-01','Status':'Active'
  }]);
}
function parseExcelFile(file,callback){const reader=new FileReader();reader.onload=function(e){try{const data=new Uint8Array(e.target.result);const wb=XLSX.read(data,{type:'array'});const ws=wb.Sheets[wb.SheetNames[0]];const json=XLSX.utils.sheet_to_json(ws,{defval:''});const headers=json.length>0?Object.keys(json[0]):[];callback(null,headers,json);}catch(err){callback(err,[],[]);}};reader.readAsArrayBuffer(file);}
/**
 * calculateHeaderFieldMatchScore()
 * ---------------------------------
 * Compares one Excel column header (e.g. "Parent Name") against one of our
 * known student/teacher fields (e.g. { key: 'parentName', label: 'Parent Name' })
 * and returns a numeric confidence score for "does this header belong to
 * this field?" A higher score means a more confident match. A score of 0
 * means "no match at all."
 *
 * WHY THIS FUNCTION EXISTS (bug history):
 * The previous version of this matcher only checked whether one string
 * contained the other (e.g. "does 'parentname' contain 'name'?"). That is
 * true for "Parent Name" and the field "Full Name", because the word
 * "name" appears inside both — so importing a file that had both a
 * "Full Name" column and a "Parent Name" column would sometimes map the
 * *parent's* name into the *student's* name field by mistake. This
 * function fixes that by always preferring an EXACT match first, and only
 * falling back to a loose "contains" match as a last resort.
 *
 * @param {string} excelColumnHeader - The raw column header text from the uploaded file, e.g. "Parent Name".
 * @param {string} fieldKey         - Our internal field identifier, e.g. "parentName".
 * @param {string} fieldLabel       - The human-readable label shown in the UI, e.g. "Parent Name".
 * @returns {number} A match confidence score:
 *   100 = exact match (best possible match, always preferred)
 *    90 = matched one of our known alternate spellings for this field
 *    20 = loose partial match (last-resort fallback only)
 *    15 = loose partial match against an alternate spelling
 *     0 = no match found at all
 *
 * If this function were removed, we would have no automatic column
 * matching at all — the HOD would have to manually pick the correct field
 * for every single column in the spreadsheet, every time they imported a file.
 */
function calculateHeaderFieldMatchScore(excelColumnHeader, fieldKey, fieldLabel) {
  const normalizedHeader = excelColumnHeader.toLowerCase().replace(/[\s_\-\.]/g, '');
  const normalizedFieldKey = fieldKey.toLowerCase();
  const normalizedFieldLabel = fieldLabel.toLowerCase().replace(/[\s\*]/g, '');

  // Best possible match: the header is exactly the same as our field key
  // or label (ignoring spacing/case differences). Always trust this first.
  const isExactMatch = normalizedHeader === normalizedFieldKey || normalizedHeader === normalizedFieldLabel;
  if (isExactMatch) return 100;

  // Alternate spellings/phrasings we commonly see for each field in
  // real-world spreadsheets (e.g. some colleges write "Roll No", others
  // write "Enrollment Number" for the same thing).
  const alternateSpellingsByField = {
    name:          ['fullname', 'studentname', 'teachername', 'faculty'],
    roll:          ['rollno', 'rollnum', 'enrollment', 'rollnumber'],
    sem:           ['semester', 'semno'],
    phone:         ['mobile', 'contact', 'mobileno'],
    email:         ['emailid', 'mail', 'emailaddress'],
    dob:           ['dateofbirth', 'birth', 'birthdate'],
    bloodGroup:    ['blood', 'bloodtype', 'bloodgroup'],
    parentEmail:   ['parentemail', 'parentemailid', 'guardianemail', 'fatheremail', 'motheremail'],
    parentName:    ['parent', 'guardian', 'fathername', 'parentname', 'guardianname'],
    parentPhone:   ['parentmobile', 'parentcontact', 'guardianphone', 'fatherphone'],
    subject:       ['subjectname', 'paper'],
    designation:   ['post', 'position'],
    qualification: ['degree', 'education'],
    experience:    ['exp', 'years'],
    joinDate:      ['joining', 'doj', 'joiningdate'],
    admissionYear: ['admissionyr', 'yearofadmission'],
  };
  const knownAlternateSpellings = alternateSpellingsByField[fieldKey] || [];

  const matchesKnownAlternateSpellingExactly = knownAlternateSpellings.includes(normalizedHeader);
  if (matchesKnownAlternateSpellingExactly) return 90;

  // Loose fallback: one string simply contains the other. This is how the
  // old bug happened, so it is now the LOWEST priority match, only used
  // when nothing scored an exact match anywhere else.
  const isLoosePartialMatch =
    normalizedHeader.includes(normalizedFieldKey) ||
    normalizedFieldKey.includes(normalizedHeader) ||
    normalizedHeader.includes(normalizedFieldLabel) ||
    normalizedFieldLabel.includes(normalizedHeader);
  if (isLoosePartialMatch) return 20;

  const isLoosePartialAlternateMatch = knownAlternateSpellings.some(
    alternateSpelling => normalizedHeader.includes(alternateSpelling) || alternateSpelling.includes(normalizedHeader)
  );
  if (isLoosePartialAlternateMatch) return 15;

  return 0;
}

// Kept for any older code that only needs a yes/no answer rather than a score.
function autoMatch(excelHeader, fieldKey, fieldLabel) {
  return calculateHeaderFieldMatchScore(excelHeader, fieldKey, fieldLabel) > 0;
}
/**
 * buildMapper()
 * -------------
 * Renders the "which spreadsheet column goes with which student/teacher
 * field?" mapping UI, and pre-fills each dropdown with our best guess.
 *
 * WHY THIS FUNCTION EXISTS (bug history):
 * The previous version picked the FIRST field that loosely matched each
 * header, checking headers one at a time with no memory of what earlier
 * headers had already claimed. That allowed two different headers (e.g.
 * "Full Name" and "Parent Name") to both end up auto-selected for the same
 * field, silently overwriting each other's data on import. This version
 * scores every possible (header, field) pair up front, then assigns the
 * best-scoring pairs first — once a field has been claimed by one header,
 * no other header is allowed to also claim it.
 *
 * @param {string[]} headers - Column headers read from the uploaded spreadsheet.
 * @param {Array<{key:string,label:string}>} fields - The fields we know how to import (e.g. STU_FIELDS).
 * @param {string} containerId - The id of the HTML element to render the mapping UI into.
 * @param {string} prefix - A short prefix ("stu" or "tchr") used to keep each dropdown's HTML id unique.
 * @returns {void} Nothing is returned — this function's job is only to update the page's HTML.
 *
 * If this function were removed, the HOD would see an empty mapping area
 * and would not be able to tell the app which column means what.
 */
function buildMapper(headers, fields, containerId, prefix) {
  // Step 1: score every possible (header, field) pairing.
  const allPossibleMatches = [];
  headers.forEach(header => {
    fields.forEach(field => {
      const matchScore = calculateHeaderFieldMatchScore(header, field.key, field.label);
      if (matchScore > 0) {
        allPossibleMatches.push({ header, fieldKey: field.key, matchScore });
      }
    });
  });

  // Step 2: sort so the strongest matches are assigned first.
  allPossibleMatches.sort((a, b) => b.matchScore - a.matchScore);

  // Step 3: greedily assign the best match for each header, but never let a
  // field be claimed twice (once "name" is taken, no other header can also
  // auto-select "name" — this is exactly what stops the Parent Name /
  // Full Name mix-up described above).
  const bestFieldKeyForHeader = {};
  const fieldKeysAlreadyClaimed = new Set();
  allPossibleMatches.forEach(candidateMatch => {
    const headerAlreadyHasAMatch = bestFieldKeyForHeader[candidateMatch.header] !== undefined;
    const fieldAlreadyClaimedByAnotherHeader = fieldKeysAlreadyClaimed.has(candidateMatch.fieldKey);
    if (!headerAlreadyHasAMatch && !fieldAlreadyClaimedByAnotherHeader) {
      bestFieldKeyForHeader[candidateMatch.header] = candidateMatch.fieldKey;
      fieldKeysAlreadyClaimed.add(candidateMatch.fieldKey);
    }
  });

  // Step 4: render one dropdown row per spreadsheet column, pre-selected
  // with whatever field (if any) we matched it to above. The HOD can still
  // change any of these manually before importing.
  let mappingRowsHtml = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:6px;">`;
  headers.forEach(header => {
    const bestFieldKey = bestFieldKeyForHeader[header] || '';
    const dropdownId = `${prefix}_map_${header.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const fieldOptionsHtml = fields
      .map(field => `<option value="${field.key}" ${bestFieldKey === field.key ? 'selected' : ''}>${field.label}</option>`)
      .join('');
    mappingRowsHtml += `<div class="excel-map-row">
      <div class="col-label" title="${header}">${header}</div>
      <div class="arrow">→</div>
      <select id="${dropdownId}"><option value="">— Skip —</option>${fieldOptionsHtml}</select>
    </div>`;
  });
  mappingRowsHtml += `</div>`;

  document.getElementById(containerId).innerHTML = mappingRowsHtml;
}

/**
 * buildPreviewTable()
 * --------------------
 * Renders a preview table showing the spreadsheet data that is about to be
 * imported, so the HOD can double-check it before confirming.
 *
 * WHY THIS FUNCTION EXISTS (bug history):
 * This used to always cut the preview down to only the first 3 rows,
 * labelled "Data Preview (first 3 rows)" — so if a file had 5 or 50
 * students in it, the HOD could only ever see the first 3 before
 * importing. Now every row is shown, in a scrollable box so the page
 * itself doesn't get too tall.
 *
 * @param {string[]} headers - Column headers from the uploaded spreadsheet.
 * @param {Array<Object>} rows - Every data row read from the spreadsheet (not just the first few).
 * @param {string} containerId - The id of the HTML element to render the preview table into.
 * @returns {void}
 *
 * If this function were removed, the HOD would have no way to see what
 * data is actually about to be imported before clicking the import button.
 */
function buildPreviewTable(headers, rows, containerId) {
  const tableHeaderHtml = headers.map(header => `<th>${header}</th>`).join('');

  const tableBodyHtml = rows
    .map(row => `<tr>${headers.map(header => `<td>${row[header] || ''}</td>`).join('')}</tr>`)
    .join('');

  const noDataMessageHtml = `<tr><td colspan="${headers.length}" style="text-align:center;color:var(--text3);">No data rows found</td></tr>`;

  const fullTableHtml = `
    <div style="max-height:340px;overflow-y:auto;">
      <table class="report-table" style="min-width:500px;">
        <thead><tr>${tableHeaderHtml}</tr></thead>
        <tbody>${rows.length ? tableBodyHtml : noDataMessageHtml}</tbody>
      </table>
    </div>`;

  document.getElementById(containerId).innerHTML = fullTableHtml;
}
function readMapping(headers,prefix){const map={};headers.forEach(hdr=>{const sel=document.getElementById(`${prefix}_map_${hdr.replace(/[^a-zA-Z0-9]/g,'_')}`);if(sel&&sel.value)map[hdr]=sel.value;});return map;}
function handleStuExcel(event){const file=event.target.files[0];if(!file)return;event.target.value='';document.getElementById('stuExcelFileName').textContent=file.name;parseExcelFile(file,(err,headers,rows)=>{if(err||!headers.length){showToast('Could not read file. Use .xlsx, .xls or .csv',true);return;}_stuExcelHeaders=headers;_stuExcelRows=rows;document.getElementById('stuExcelRowCount').textContent=`${rows.length} rows found`;buildMapper(headers,STU_FIELDS,'stuColumnMapper','stu');buildPreviewTable(headers,rows,'stuExcelPreview');document.getElementById('stuImportSuccess').style.display='none';document.getElementById('stuExcelOverlay').classList.add('open');});}
function closeStuExcel(){document.getElementById('stuExcelOverlay').classList.remove('open');_stuExcelRows=[];_stuExcelHeaders=[];}
/**
 * importStudentsFromExcel()
 * --------------------------
 * Reads the column mapping the HOD has chosen, converts every spreadsheet
 * row into a student record, and sends the whole batch to the backend to
 * be created. Shows a clear success/failure summary afterwards instead of
 * a bare "0 imported" with no explanation.
 *
 * WHY THIS FUNCTION EXISTS (bug history):
 * Every row used to fail silently on the backend because the backend
 * required a parent email that this import screen never even collected —
 * see the STU_FIELDS comment above for the full story. That specific bug
 * is now fixed on the backend (a missing parent email is allowed during
 * bulk import), but this function is also updated to clearly show any
 * *other* row that fails and why, instead of hiding failures behind a
 * single unhelpful number.
 *
 * @returns {Promise<void>} Nothing is returned — this function's job is to
 * talk to the server and update the page with the result.
 */
async function importStudentsFromExcel(){
  if(!_stuExcelRows.length){showToast('No data to import.',true);return;}

  const columnMapping = readMapping(_stuExcelHeaders,'stu');
  const atLeastOneColumnMapsToFullName = Object.values(columnMapping).includes('name');
  if(!atLeastOneColumnMapsToFullName){
    showToast('Please map at least the Full Name column.',true);
    return;
  }

  // A student record genuinely cannot exist without a name and a roll
  // number — those two are the only things we insist on here. Every other
  // field (parent email, phone, date of birth, etc.) is allowed to be
  // missing; it can always be filled in later from the student's own
  // Details page.
  const studentsToImport = [];
  let skippedRowCount = 0;
  _stuExcelRows.forEach((spreadsheetRow) => {
    const studentRecord = {};
    Object.entries(columnMapping).forEach(([excelColumnName, fieldKey]) => {
      const rawValue = String(spreadsheetRow[excelColumnName] || '').trim();
      if (!rawValue) return; // leave the field unset rather than storing an empty string
      const fieldNeedsToBeANumber = fieldKey === 'sem' || fieldKey === 'admissionYear';
      studentRecord[fieldKey] = fieldNeedsToBeANumber ? (parseInt(rawValue, 10) || undefined) : rawValue;
    });

    const hasMinimumRequiredFields = studentRecord.name && studentRecord.roll;
    if (hasMinimumRequiredFields) {
      studentsToImport.push(studentRecord);
    } else {
      skippedRowCount++;
    }
  });

  if (!studentsToImport.length) {
    showToast('No rows had both a Full Name and a Roll No — nothing to import.', true);
    return;
  }

  try {
    const response = await apiJson("/api/hod/import/students", {
      method: "POST",
      body: JSON.stringify({ course: activeStuCourse, sem: activeStuSem || 1, rows: studentsToImport })
    });

    await refreshStudents();
    renderStudentList();
    renderStuCourseCards();
    loadDashboard();

    const importedCount = response.imported || 0;
    const failedRows = response.errors || [];
    showStudentImportResultBanner(importedCount, failedRows, skippedRowCount);

    // Only auto-close the "import" dialog if every single row succeeded —
    // if something needs the HOD's attention, keep it open so they can read it.
    if (!failedRows.length && !skippedRowCount) {
      setTimeout(() => { closeStuExcel(); }, 1800);
    }
  } catch (networkOrServerError) {
    showToast(networkOrServerError.message || "Import failed", true);
  }
}

/**
 * showStudentImportResultBanner()
 * ---------------------------------
 * Displays a clear, honest summary of what happened during import —
 * how many students were created, and if anything failed, exactly which
 * row and why. This replaces the old behaviour of only ever showing a
 * plain success count with no way to tell why some rows didn't make it in.
 *
 * @param {number} importedCount - How many students were successfully created.
 * @param {Array<{row:number,name:string,message:string}>} failedRows - Rows the backend rejected, with a reason for each.
 * @param {number} skippedRowCount - Rows that never even reached the server because they were missing a name or roll number.
 * @returns {void}
 */
function showStudentImportResultBanner(importedCount, failedRows, skippedRowCount) {
  const bar = document.getElementById('stuImportSuccess');
  let summaryHtml = `✅ ${importedCount} student(s) imported!`;

  if (skippedRowCount > 0) {
    summaryHtml += ` ⚠️ ${skippedRowCount} row(s) skipped (missing Full Name or Roll No).`;
  }
  if (failedRows.length > 0) {
    const failureListHtml = failedRows
      .map(failure => `Row ${failure.row} (${failure.name}): ${failure.message}`)
      .join('<br>');
    summaryHtml += `<br>❌ ${failedRows.length} row(s) failed:<br>${failureListHtml}`;
  }

  bar.innerHTML = summaryHtml;
  bar.style.display = 'block';
  showToast(`${importedCount} student(s) imported${failedRows.length ? `, ${failedRows.length} failed` : ''}.`);
}
function handleTchrExcel(event){const file=event.target.files[0];if(!file)return;event.target.value='';document.getElementById('tchrExcelFileName').textContent=file.name;parseExcelFile(file,(err,headers,rows)=>{if(err||!headers.length){showToast('Could not read file.',true);return;}_tchrExcelHeaders=headers;_tchrExcelRows=rows;document.getElementById('tchrExcelRowCount').textContent=`${rows.length} rows found`;buildMapper(headers,TCHR_FIELDS,'tchrColumnMapper','tchr');buildPreviewTable(headers,rows,'tchrExcelPreview');document.getElementById('tchrImportSuccess').style.display='none';document.getElementById('tchrExcelOverlay').classList.add('open');});}
function closeTchrExcel(){document.getElementById('tchrExcelOverlay').classList.remove('open');_tchrExcelRows=[];_tchrExcelHeaders=[];}
/**
 * importTeachersFromExcel()
 * --------------------------
 * Same idea as importStudentsFromExcel() above, but for teacher records.
 * See that function's comment for the full explanation of why we now
 * report per-row failures instead of a single unexplained count.
 *
 * WHY THE "SUBJECT REQUIRED" RULE WAS REMOVED:
 * This screen used to refuse to import a teacher row unless it had both a
 * name AND a subject filled in. But a teacher's subject assignment is
 * properly handled later through the HOD's Schedule/Subject system (a
 * teacher can be assigned to teach several subjects across several
 * classes) — this import screen was only ever storing a single free-text
 * "subject" label. Requiring it here just meant teachers with no subject
 * listed in the spreadsheet were silently dropped for no good reason.
 *
 * @returns {Promise<void>}
 */
async function importTeachersFromExcel(){
  if(!_tchrExcelRows.length){showToast('No data to import.',true);return;}

  const columnMapping = readMapping(_tchrExcelHeaders,'tchr');
  const atLeastOneColumnMapsToFullName = Object.values(columnMapping).includes('name');
  if(!atLeastOneColumnMapsToFullName){
    showToast('Please map at least the Full Name column.',true);
    return;
  }

  const teachersToImport = [];
  let skippedRowCount = 0;
  _tchrExcelRows.forEach((spreadsheetRow) => {
    const teacherRecord = {};
    Object.entries(columnMapping).forEach(([excelColumnName, fieldKey]) => {
      const rawValue = String(spreadsheetRow[excelColumnName] || '').trim();
      if (rawValue) teacherRecord[fieldKey] = rawValue;
    });

    if (teacherRecord.name) {
      teachersToImport.push(teacherRecord);
    } else {
      skippedRowCount++;
    }
  });

  if (!teachersToImport.length) {
    showToast('No rows had a Full Name — nothing to import.', true);
    return;
  }

  try {
    const response = await apiJson("/api/hod/import/teachers", {
      method: "POST",
      body: JSON.stringify({ course: activeTchrCourse, rows: teachersToImport })
    });

    await refreshTeachers();
    renderTeacherList();
    renderTchrCourseCards();
    loadDashboard();

    const importedCount = response.imported || 0;
    const failedRows = response.errors || [];

    const bar = document.getElementById('tchrImportSuccess');
    let summaryHtml = `✅ ${importedCount} teacher(s) imported!`;
    if (skippedRowCount > 0) summaryHtml += ` ⚠️ ${skippedRowCount} row(s) skipped (missing Full Name).`;
    if (failedRows.length > 0) {
      const failureListHtml = failedRows.map(failure => `Row ${failure.row} (${failure.name}): ${failure.message}`).join('<br>');
      summaryHtml += `<br>❌ ${failedRows.length} row(s) failed:<br>${failureListHtml}`;
    }
    bar.innerHTML = summaryHtml;
    bar.style.display = 'block';
    showToast(`${importedCount} teacher(s) imported${failedRows.length ? `, ${failedRows.length} failed` : ''}.`);

    if (!failedRows.length && !skippedRowCount) {
      setTimeout(() => { closeTchrExcel(); }, 1800);
    }
  } catch (networkOrServerError) {
    showToast(networkOrServerError.message || "Import failed", true);
  }
}
