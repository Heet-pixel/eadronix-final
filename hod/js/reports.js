// hod/js/reports.js — Reports: Attendance, Marks, Department — Render & Export

/* ═══════════════════════════════════════════════════════
   ENHANCED REPORTS MODULE  (Production-ready, wizard UI)
   All data is fetched from server via apiJson() in production.
   NO table is shown until ALL required filters are selected.
   ─ Attendance Report : Course → Sem (All/specific)
   ─ Marks Report      : Course → Sem → Type (Mid/GTU/Practical/Remedial)
                         Remedial also asks Subject + Sem
   ─ Department Report : Always shown (full overview)
   After every required selection → table + Excel/Word/PDF export
═════════════════════════════════════════════════════════ */

let activeReportTab = 'attendance'; // 'attendance' | 'marks' | 'department'

// ── Attendance report state ──
let rptAttCourse = '', rptAttSem = ''; // '' = nothing chosen, null = All Sems

// ── Marks report state ──
let marksRptCourse = '', marksRptSem = '', marksRptType = '';
let marksRptRemedialSubject = '', marksRptRemedialSem = '';

/* Override loadReports — reset state on section open */
function loadReports(){
  rptCourse=null; rptType=null; rptView=null; rptSem=null;
  rptAttCourse=''; rptAttSem='';
  marksRptCourse=''; marksRptSem=''; marksRptType='';
  marksRptRemedialSubject=''; marksRptRemedialSem='';
  rptAttSubjectFilter=''; rptAttDateFrom=''; rptAttDateTo='';
  deptReportLoaded = false; deptReportRows = [];
  renderEnhancedReports();
  if (activeReportTab === 'department') loadDeptReport();
}

function renderEnhancedReports(){
  let html = `
  <div class="report-main-tabs">
    <div class="rmt-btn ${activeReportTab==='attendance'?'active':''}" onclick="setReportTab('attendance')">📄… Attendance</div>
    <div class="rmt-btn ${activeReportTab==='marks'?'active':''}" onclick="setReportTab('marks')">📄 Marks</div>
    <div class="rmt-btn ${activeReportTab==='department'?'active':''}" onclick="setReportTab('department')">🏛️ Department</div>
  </div>`;
  if(activeReportTab==='attendance') html += renderAttendanceReportSection();
  else if(activeReportTab==='marks')      html += renderMarksReportSection();
  else if(activeReportTab==='department') html += renderDepartmentReportSection();
  document.getElementById('reportContent').innerHTML = html;
}

function setReportTab(t){
  activeReportTab=t;
  renderEnhancedReports();
  if (t === 'department') loadDeptReport();
}

let deptReportLoaded = false;
let deptReportLoading = false;
let deptReportRows = []; // [{student, course, sem, total, present, percentage}] across ALL courses/sems

// Department report spans every course+semester, unlike the per-course wizard
// above, so it fetches its own un-scoped attendance-report summary once per
// "Reports" screen visit rather than reusing the wizard's stuReports cache.
async function loadDeptReport(){
  deptReportLoading = true; deptReportLoaded = false;
  renderEnhancedReports();
  try {
    const data = await apiJson('/api/hod/attendance-report');
    deptReportRows = (data.summary || []).map(row => ({
      student: row.student,
      course: row.student?.course || row.student?.courseName || '',
      sem: row.student?.semester || row.student?.sem || 1,
      total: row.total, present: row.present, percentage: row.percentage
    }));
  } catch (e) {
    showToast('Failed to load department report: ' + e.message, true);
    deptReportRows = [];
  } finally {
    deptReportLoading = false; deptReportLoaded = true;
    renderEnhancedReports();
  }
}

/* ─────────────────────────────────────────────────────
   ATTENDANCE REPORT  Step-by-step wizard
   Step 1: Course  →  Step 2: Semester (All / Sem N)
   Table only appears after Step 2 is selected.
───────────────────────────────────────────────────── */
function renderAttendanceReportSection(){
  let step1Done = !!rptAttCourse;
  // step2Done: null means "All Sems" was selected (valid), '' means untouched
  let step2Done = step1Done && rptAttSem !== '';

  let html = '<div class="rpt-wizard">';

  // Step 1 — Course
  html += `<div class="rpt-step">
    <div class="rpt-step-hdr">
      <div class="rpt-step-num ${step1Done?'done':''}">1</div>
      <div>
        <div class="rpt-step-title">Select Course</div>
        <div class="rpt-step-sub">Which course's attendance report?</div>
      </div>
      ${step1Done?`<span style="margin-left:auto;font-size:12px;font-weight:700;color:var(--success);">✓ ${rptAttCourse}</span>`:''}
    </div>
    <div class="rpt-option-grid">
      ${HOD_COURSES.map(c=>`
        <div class="rpt-opt ${rptAttCourse===c?'active':''}" onclick="setAttRptCourse('${c}')">
          🏛️ ${c}
          <small style="font-size:10px;opacity:.7;">(${allStudents.filter(s=>s.course===c).length} students)</small>
        </div>`).join('')}
    </div>
  </div>`;

  // Step 2 — Semester (locked until course chosen)
  html += `<div class="rpt-step ${!step1Done?'locked':''}">
    <div class="rpt-step-hdr">
      <div class="rpt-step-num ${step2Done?'done':''}">2</div>
      <div>
        <div class="rpt-step-title">Select Semester</div>
        <div class="rpt-step-sub">All students or a specific semester?</div>
      </div>
      ${step2Done?`<span style="margin-left:auto;font-size:12px;font-weight:700;color:var(--success);">✓ ${rptAttSem===null?'All Semesters':'Sem '+rptAttSem}</span>`:''}
    </div>
    <div class="rpt-option-grid">
      <div class="rpt-opt ${rptAttSem===null?'active-green':''}" onclick="setAttRptSem(null)">
        📋 All Students
      </div>
      ${Array.from({length:SEM_COUNT},(_,i)=>`
        <div class="rpt-opt ${rptAttSem===i+1?'active':''}" onclick="setAttRptSem(${i+1})">
          Sem ${i+1}
          <small style="font-size:10px;opacity:.7;">(${allStudents.filter(s=>s.course===rptAttCourse&&s.sem===i+1).length})</small>
        </div>`).join('')}
    </div>
  </div>`;

  html += '</div>'; // close wizard

  // Only show table after both steps done
  if(step2Done){
    if (rptAttLoading) {
      html += `<div class="empty-state" style="margin-top:10px;"><div class="e-icon">⏳</div><p>Loading attendance data…</p></div>`;
    } else {
      html += renderAttReportResult();
    }
  } else {
    html += `<div class="empty-state" style="margin-top:10px;">
      <div class="e-icon">🎯</div>
      <p>${!step1Done?'Select a course above to begin':'Now choose a semester to generate the report'}</p>
    </div>`;
  }
  return html;
}

let rptAttLoading = false;

function setAttRptCourse(c){ rptAttCourse=c; rptAttSem=''; renderEnhancedReports(); }
async function setAttRptSem(s){
  rptAttSem=s;
  rptAttLoading = true;
  renderEnhancedReports();
  try {
    await buildStuReports(rptAttCourse, s === null ? null : s, true);
  } catch (e) {
    showToast('Failed to load attendance report: ' + e.message, true);
  } finally {
    rptAttLoading = false;
    renderEnhancedReports();
  }
}

/* ══════════════════════════════════════════════════
   Attendance Report Result — with user-defined filters
   No hardcoded 75% thresholds — HOD sets their own
════════════════════════════════════════════════════ */
let rptAttThreshold = 75;   /* default — user can change */
let rptAttSubjectFilter = ''; /* filter by subject */
let rptAttDateFrom = '', rptAttDateTo = '';

function renderAttReportResult(){
  let allRows = stuReports.filter(s=>
    s.course===rptAttCourse &&
    (rptAttSem===null || s.sem===rptAttSem)
  );

  /* Apply subject filter if set */
  let subjectFilter = rptAttSubjectFilter;
  let filteredRows = allRows;
  if(subjectFilter){
    filteredRows = allRows.map(r=>{
      let matchSub = (r.subjects||[]).find(s=>s.subject===subjectFilter);
      if(!matchSub) return null;
      return {...r, _filteredPct: matchSub.pct};
    }).filter(Boolean);
  }

  /* Apply threshold filter */
  let threshold = parseInt(rptAttThreshold)||0;
  let above = filteredRows.filter(r=>(r._filteredPct!==undefined ? r._filteredPct : r.percentage)>=threshold).length;
  let below = filteredRows.length - above;

  let semForSubs = (typeof rptAttSem==='number') ? rptAttSem : 1;
  let sampleSubs = getSubjNames(rptAttCourse, semForSubs);

  let html = '<div class="rpt-result-wrap">';

  /* ── Advanced filter card ── */
  let subjectOpts=sampleSubs.map(s=>`<option value="${s}" ${rptAttSubjectFilter===s?'selected':''}>${s}</option>`).join('');
  html += `<div class="rpt-filter-card">
    <h4>🎛️ Advanced Filters</h4>
    <div class="rpt-filter-grid">
      <div class="rpt-filter-group">
        <label>Attendance Threshold (%)</label>
        <input type="number" min="0" max="100" value="${rptAttThreshold}"
          oninput="rptAttThreshold=this.value;renderEnhancedReports()"
          placeholder="e.g. 75">
      </div>
      <div class="rpt-filter-group">
        <label>Filter by Subject</label>
        <select onchange="rptAttSubjectFilter=this.value;renderEnhancedReports()">
          <option value="">All Subjects</option>${subjectOpts}
        </select>
      </div>
      <div class="rpt-filter-group">
        <label>Date From</label>
        <input type="date" value="${rptAttDateFrom}" oninput="rptAttDateFrom=this.value">
      </div>
      <div class="rpt-filter-group">
        <label>Date To</label>
        <input type="date" value="${rptAttDateTo}" oninput="rptAttDateTo=this.value">
      </div>
    </div>
  </div>`;

  /* Summary */
  html += `<div class="report-summary" style="margin-bottom:14px;">
    <div class="rsumm"><span>${filteredRows.length}</span><small>Total Students</small></div>
    <div class="rsumm"><span style="color:var(--success);">${above}</span><small>≥ ${threshold}%</small></div>
    <div class="rsumm"><span style="color:var(--danger);">${below}</span><small>&lt; ${threshold}%</small></div>
    <div class="rsumm"><span style="color:var(--accent2);">${rptAttSem===null?'All Sems':'Sem '+rptAttSem}</span><small>Semester</small></div>
  </div>`;

  /* Export bar */
  html += `<div class="report-export-bar">
    <span style="font-size:13px;font-weight:700;color:var(--text2);">Export as:</span>
    <button class="export-btn excel" onclick="exportAttendanceExcel()">📚 Excel</button>
    <button class="export-btn word" onclick="exportToWord(document.getElementById('attendanceReportTable'),'Attendance_${rptAttCourse}')">📄 Word</button>
    <button class="export-btn pdf" onclick="downloadAttendanceReportPdf()">📄 PDF</button>
  </div>`;

  if(!filteredRows.length){
    return html + '<div class="report-card"><div class="empty-state"><div class="e-icon">📄</div><p>No data for this selection.</p></div></div></div>';
  }

  html += `<div class="report-card">
    <div class="rpt-result-hdr">
      <h3>📄… Attendance — ${rptAttCourse} ${rptAttSem===null?'(All Semesters)':'Sem '+rptAttSem}
        ${subjectFilter?'<span style="font-size:12px;color:var(--accent2);margin-left:6px;">· '+subjectFilter+'</span>':''}
      </h3>
    </div>
    <div class="tbl-scroll"><table class="report-table" id="attendanceReportTable">
      <thead><tr><th>#</th><th>Name</th><th>Roll</th><th>Sem</th>`;
  if(typeof rptAttSem==='number' && !subjectFilter){
    sampleSubs.forEach(s=>{ html+=`<th>${s.split(' ').slice(0,2).join(' ')}</th>`; });
  }
  if(subjectFilter) html+=`<th>${subjectFilter}</th>`;
  html += `<th>Present</th><th>Total</th><th>%</th><th>Status</th></tr></thead><tbody>`;

  filteredRows.forEach((r,i)=>{
    let displayPct = r._filteredPct!==undefined ? r._filteredPct : r.percentage;
    let statusLabel = displayPct>=threshold ? 'Regular' : 'Shortage';
    let stCls = displayPct>=threshold ? 'badge-green' : 'badge-red';
    html += `<tr><td>${i+1}</td><td><b>${r.name}</b></td><td>${r.roll}</td><td>Sem ${r.sem}</td>`;
    if(typeof rptAttSem==='number' && !subjectFilter){
      (r.subjects||[]).forEach(s=>{
        let cls=s.pct>=threshold?'badge-green':s.pct>=(threshold*0.8)?'badge-yellow':'badge-red';
        html+=`<td><span class="badge ${cls}">${s.attended}/${s.total}</span></td>`;
      });
    }
    if(subjectFilter){
      let matchSub=(r.subjects||[]).find(s=>s.subject===subjectFilter);
      if(matchSub){
        let cls=matchSub.pct>=threshold?'badge-green':matchSub.pct>=(threshold*0.8)?'badge-yellow':'badge-red';
        html+=`<td><span class="badge ${cls}">${matchSub.attended}/${matchSub.total} (${matchSub.pct}%)</span></td>`;
      } else { html+=`<td>—</td>`; }
    }
    html+=`<td>${r.overallAtt}</td><td>${r.overallTotal}</td><td><b>${displayPct}%</b></td>
      <td><span class="badge ${stCls}">${statusLabel}</span></td></tr>`;
  });

  html += '</tbody></table></div></div></div>';
  return html;
}

function exportAttendanceExcel(){
  let table=document.getElementById('attendanceReportTable');
  if(!table){showToast('No data to export.',true);return;}
  try{
    let wb=XLSX.utils.book_new();
    let ws=XLSX.utils.table_to_sheet(table);
    ws['!cols']=[{wch:5},{wch:24},{wch:14},{wch:8},...Array(20).fill({wch:14})];
    XLSX.utils.book_append_sheet(wb,ws,'Attendance Report');
    let fn=`Attendance_${rptAttCourse}${rptAttSem?'_Sem'+rptAttSem:''}_${new Date().toLocaleDateString('en-GB').replace(/\//g,'-')}`;
    XLSX.writeFile(wb,fn+'.xlsx');
    showToast('Attendance Excel downloaded!');
  }catch(e){showToast('Export failed: '+e.message,true);}
}

// Downloads a real, server-rendered PDF (not a print-dialog screenshot) for the
// currently selected course/semester attendance report.
async function downloadAttendanceReportPdf(){
  try{
    const qs = new URLSearchParams({ course: rptAttCourse });
    if (rptAttSem) qs.set('semester', rptAttSem);
    const fn = `Attendance_${rptAttCourse}${rptAttSem?'_Sem'+rptAttSem:''}_${new Date().toLocaleDateString('en-GB').replace(/\//g,'-')}.pdf`;
    await downloadFile('/hod/attendance-report/pdf?' + qs.toString(), fn);
    showToast('Attendance PDF downloaded!');
  }catch(e){ showToast('PDF export failed: '+e.message, true); }
}

/* ─────────────────────────────────────────────────────
   MARKS REPORT  Step-by-step wizard
   Step 1: Course  →  Step 2: Sem  →  Step 3: Type
   Remedial: also asks Subject + which Sem (extra sub-form)
   Table only appears after all required steps done.
───────────────────────────────────────────────────── */
function renderMarksReportSection(){
  let step1Done = !!marksRptCourse;
  let step2Done = step1Done && !!marksRptSem;
  let step3Done = step2Done && !!marksRptType;
  let remedialReady = marksRptType!=='remedial' || (!!marksRptRemedialSubject && !!marksRptRemedialSem);
  let allDone = step3Done && remedialReady;

  const markTypes = [
    {key:'mid',       label:'📄 Mid-Semester Exam',  color:'active-orange'},
    {key:'gut',       label:'📋 GTU / Internal',      color:'active-teal'},
    {key:'practical', label:'🔬 Practical Marks',     color:'active'},
    {key:'remedial',  label:'🔄 Remedial Exam',       color:'active-green'},
  ];

  let html = '<div class="rpt-wizard">';

  // Step 1 — Course
  html += `<div class="rpt-step">
    <div class="rpt-step-hdr">
      <div class="rpt-step-num ${step1Done?'done':''}">1</div>
      <div><div class="rpt-step-title">Select Course</div><div class="rpt-step-sub">Which course's marks?</div></div>
      ${step1Done?`<span style="margin-left:auto;font-size:12px;font-weight:700;color:var(--success);">✓ ${marksRptCourse}</span>`:''}
    </div>
    <div class="rpt-option-grid">
      ${HOD_COURSES.map(c=>`<div class="rpt-opt ${marksRptCourse===c?'active':''}" onclick="setMrktCourse('${c}')">🏛️ ${c}</div>`).join('')}
    </div>
  </div>`;

  // Step 2 — Semester (locked until course chosen)
  html += `<div class="rpt-step ${!step1Done?'locked':''}">
    <div class="rpt-step-hdr">
      <div class="rpt-step-num ${step2Done?'done':''}">2</div>
      <div><div class="rpt-step-title">Select Semester</div><div class="rpt-step-sub">Which semester's marks?</div></div>
      ${step2Done?`<span style="margin-left:auto;font-size:12px;font-weight:700;color:var(--success);">✓ Sem ${marksRptSem}</span>`:''}
    </div>
    <div class="rpt-option-grid">
      ${Array.from({length:SEM_COUNT},(_,i)=>`
        <div class="rpt-opt ${marksRptSem==i+1?'active':''}" onclick="setMrktSem(${i+1})">
          Sem ${i+1}
          <small style="font-size:10px;opacity:.7;">(${allStudents.filter(s=>s.course===marksRptCourse&&s.sem===i+1).length})</small>
        </div>`).join('')}
    </div>
  </div>`;

  // Step 3 — Marks Type (locked until sem chosen)
  html += `<div class="rpt-step ${!step2Done?'locked':''}">
    <div class="rpt-step-hdr">
      <div class="rpt-step-num ${step3Done?'done':''}">3</div>
      <div><div class="rpt-step-title">Select Marks Type</div><div class="rpt-step-sub">Which exam's marks?</div></div>
      ${step3Done?`<span style="margin-left:auto;font-size:12px;font-weight:700;color:var(--success);">✓ ${markTypes.find(m=>m.key===marksRptType)?.label||marksRptType}</span>`:''}
    </div>
    <div class="rpt-option-grid">
      ${markTypes.map(mt=>`<div class="rpt-opt ${marksRptType===mt.key?mt.color:''}" onclick="setMrktType('${mt.key}')">${mt.label}</div>`).join('')}
    </div>`;

  // Sub-question for Remedial — subject + semester
  if(marksRptType==='remedial'){
    let subjList = getSubjNames(marksRptCourse, parseInt(marksRptRemedialSem||marksRptSem)||1);
    html += `<div class="rpt-sub-ask">
      <label>⚠️ Specify Remedial Subject &amp; Semester</label>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <select onchange="marksRptRemedialSem=this.value;onRemedialSelectionChange()">
          <option value="">-- Semester --</option>
          ${Array.from({length:SEM_COUNT},(_,i)=>`<option value="${i+1}" ${marksRptRemedialSem==i+1?'selected':''}>Semester ${i+1}</option>`).join('')}
        </select>
        <select onchange="marksRptRemedialSubject=this.value;onRemedialSelectionChange()">
          <option value="">-- Subject --</option>
          ${subjList.map(s=>`<option value="${s}" ${marksRptRemedialSubject===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
    </div>`;
  }

  html += '</div>'; // close step 3
  html += '</div>'; // close wizard

  // Show table only after all done
  if(allDone){
    if (marksRptLoading) {
      html += `<div class="empty-state" style="margin-top:10px;"><div class="e-icon">⏳</div><p>Loading marks data…</p></div>`;
    } else {
      html += renderMarksReportResult();
    }
  } else {
    let msg = !step1Done?'Select a course to begin'
            : !step2Done?'Now select a semester'
            : !step3Done?'Choose the marks type'
            : 'Select subject and semester for the remedial exam above';
    html += `<div class="empty-state" style="margin-top:10px;"><div class="e-icon">🎯</div><p>${msg}</p></div>`;
  }
  return html;
}

let marksRptLoading = false;

function setMrktCourse(c){ marksRptCourse=c; marksRptSem=''; marksRptType=''; marksRptRemedialSubject=''; marksRptRemedialSem=''; renderEnhancedReports(); }
function setMrktSem(s){ marksRptSem=s; marksRptType=''; marksRptRemedialSubject=''; marksRptRemedialSem=''; renderEnhancedReports(); }
async function setMrktType(t){
  marksRptType=t; marksRptRemedialSubject=''; marksRptRemedialSem='';
  renderEnhancedReports();
  if (t !== 'remedial') await loadMarksReportData(marksRptCourse, marksRptSem, t);
}

// Fetches marks for the report wizard's selection and caches into savedMarks,
// reusing the same shape fetchExistingMarks() (marks.js) already produces.
async function loadMarksReportData(course, sem, type){
  if (!course || !sem || !type) return;
  marksRptLoading = true;
  renderEnhancedReports();
  try {
    const rows = await fetchExistingMarks(course, sem, type);
    if (!savedMarks[course]) savedMarks[course] = {};
    if (!savedMarks[course][sem]) savedMarks[course][sem] = {};
    savedMarks[course][sem][type] = rows;
  } catch (e) {
    showToast('Failed to load marks report: ' + e.message, true);
  } finally {
    marksRptLoading = false;
    renderEnhancedReports();
  }
}

// Called when either remedial sub-select (subject/semester) changes; only
// fetches once both are chosen, since the report needs both to know what to load.
async function onRemedialSelectionChange(){
  renderEnhancedReports();
  if (marksRptRemedialSubject && marksRptRemedialSem) {
    await loadMarksReportData(marksRptCourse, marksRptRemedialSem, 'remedial');
  }
}

/* Render marks result table */
function renderMarksReportResult(){
  // In production: replace with await apiJson(`/api/hod/reports/marks?...`)
  let lookupSem  = marksRptType==='remedial' ? marksRptRemedialSem : marksRptSem;
  let data = ((savedMarks[marksRptCourse]||{})[lookupSem]||{})[marksRptType] || [];

  // For remedial, only show students with that subject
  if(marksRptType==='remedial' && marksRptRemedialSubject){
    data = data.filter(d=> d.subjects && d.subjects[marksRptRemedialSubject]!==undefined);
  }

  let subjects = (marksRptType==='remedial' && marksRptRemedialSubject)
    ? [marksRptRemedialSubject]
    : getSubjNames(marksRptCourse, parseInt(lookupSem)||1);

  const typeLabels = {mid:'Mid-Semester',gut:'GTU / Internal',practical:'Practical',remedial:'Remedial'};
  let typeLbl = typeLabels[marksRptType]||marksRptType;

  let html = '<div class="rpt-result-wrap">';

  if(!data.length){
    html += `<div class="empty-state"><div class="e-icon">📄</div>
      <p>No <b>${typeLbl}</b> marks uploaded for <b>${marksRptCourse} Sem ${lookupSem}</b>.
      ${marksRptType==='remedial'?'<br>Subject: <b>'+marksRptRemedialSubject+'</b>':''}
      <br><small>Go to <b>Upload Marks</b> to add data first.</small></p></div>`;
    return html+'</div>';
  }

  let pass=data.filter(d=>d.percentage>=marksThreshold).length, fail=data.length-pass;
  let avg=data.length?Math.round(data.reduce((a,b)=>a+b.percentage,0)/data.length):0;

  /* ── User-defined threshold filter card ── */
  html += `<div class="rpt-filter-card">
    <h4>🎛️ Advanced Filters</h4>
    <div class="rpt-filter-grid">
      <div class="rpt-filter-group">
        <label>Pass Threshold (%)</label>
        <input type="number" min="0" max="100" value="${marksThreshold}"
          oninput="marksThreshold=parseInt(this.value)||60;renderEnhancedReports()"
          placeholder="e.g. 60">
      </div>
      <div class="rpt-filter-group">
        <label>Marks Type</label>
        <select onchange="setMrktType(this.value)">
          <option value="mid" ${marksRptType==='mid'?'selected':''}>Mid-Semester</option>
          <option value="gut" ${marksRptType==='gut'?'selected':''}>GTU / Internal</option>
          <option value="practical" ${marksRptType==='practical'?'selected':''}>Practical</option>
          <option value="remedial" ${marksRptType==='remedial'?'selected':''}>Remedial</option>
        </select>
      </div>
      <div class="rpt-filter-group">
        <label>Semester</label>
        <select onchange="setMrktSem(this.value)">
          ${Array.from({length:SEM_COUNT},(_,i)=>`<option value="${i+1}" ${marksRptSem==i+1?'selected':''}>Sem ${i+1}</option>`).join('')}
        </select>
      </div>
    </div>
  </div>`;

  // Summary
  html += `<div class="report-summary" style="margin-bottom:14px;">
    <div class="rsumm"><span>${data.length}</span><small>Students</small></div>
    <div class="rsumm"><span style="color:var(--success);">${pass}</span><small>≥ ${marksThreshold}% Pass</small></div>
    <div class="rsumm"><span style="color:var(--danger);">${fail}</span><small>&lt; ${marksThreshold}% Fail</small></div>
    <div class="rsumm"><span style="color:var(--accent2);">${avg}%</span><small>Avg %</small></div>
  </div>`;

  // Export bar
  html += `<div class="report-export-bar">
    <span style="font-size:13px;font-weight:700;color:var(--text2);">Export as:</span>
    <button class="export-btn excel" onclick="exportMarksReport()">📚 Excel</button>
    <button class="export-btn word" onclick="exportToWord(document.getElementById('marksReportTable'),'Marks_${marksRptCourse}_Sem${marksRptSem}')">📄 Word</button>
    <button class="export-btn pdf" onclick="downloadMarksReportPdf()">📄 PDF</button>
  </div>`;

  // Table
  html += `<div class="report-card">
    <div class="rpt-result-hdr">
      <h3>📄 ${typeLbl} — ${marksRptCourse} Sem ${lookupSem}${marksRptType==='remedial'?' · '+marksRptRemedialSubject:''}</h3>
    </div>
    <div class="tbl-scroll"><table class="report-table" id="marksReportTable">
      <thead><tr><th>#</th><th>Name</th><th>Roll</th>
        ${subjects.map(s=>`<th>${s.split(' ').slice(0,2).join(' ')}<br><small>/30</small></th>`).join('')}
        <th>Total</th><th>%</th><th>Result</th>
      </tr></thead><tbody>`;

  data.forEach((d,i)=>{
    let rc=d.result==='Pass'?'badge-green':'badge-red';
    html+=`<tr><td>${i+1}</td><td><b>${d.name}</b></td><td>${d.roll}</td>`;
    subjects.forEach(s=>{
      let m=d.subjects?d.subjects[s]:0; m=m||0;
      let pct2=Math.round(m/30*100); let cls=pct2>=(marksThreshold||60)?'badge-green':pct2>=(marksThreshold*0.67||40)?'badge-yellow':'badge-red';
      html+=`<td><span class="badge ${cls}">${m}/30</span></td>`;
    });
    html+=`<td><b>${d.total}/${d.totalMax}</b></td><td><b>${d.percentage}%</b></td>
      <td><span class="badge ${rc}">${d.result}</span></td></tr>`;
  });

  html += '</tbody></table></div></div></div>';
  return html;
}

function exportMarksReport(){
  let table=document.getElementById('marksReportTable');
  if(!table){showToast('No data.',true);return;}
  try{
    const lbl={mid:'MidSem',gut:'GTU',practical:'Practical',remedial:'Remedial'};
    let fn=`Marks_${lbl[marksRptType]||marksRptType}_${marksRptCourse}_Sem${marksRptSem}_${new Date().toLocaleDateString('en-GB').replace(/\//g,'-')}`;
    let wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.table_to_sheet(table),'Marks Report');
    XLSX.writeFile(wb,fn+'.xlsx');
    showToast('Marks Excel downloaded!');
  }catch(e){showToast('Export failed: '+e.message,true);}
}

// Downloads a real, server-rendered PDF for the currently selected marks report.
async function downloadMarksReportPdf(){
  try{
    const lookupSem = marksRptType==='remedial' ? marksRptRemedialSem : marksRptSem;
    const qs = new URLSearchParams({ course: marksRptCourse, semester: lookupSem });
    if (MARKS_TYPE_TO_EXAM[marksRptType]) qs.set('examType', MARKS_TYPE_TO_EXAM[marksRptType]);
    const lbl={mid:'MidSem',gut:'GTU',practical:'Practical',remedial:'Remedial'};
    const fn = `Marks_${lbl[marksRptType]||marksRptType}_${marksRptCourse}_Sem${lookupSem}_${new Date().toLocaleDateString('en-GB').replace(/\//g,'-')}.pdf`;
    await downloadFile('/hod/marks-report/pdf?' + qs.toString(), fn);
    showToast('Marks PDF downloaded!');
  }catch(e){ showToast('PDF export failed: '+e.message, true); }
}

/* ─────────────────────────────────────────────────────
   DEPARTMENT REPORT  — no filter needed, always shows
   Full combined overview: students + teachers per course
   Excel export has 3 sheets: Students | Teachers | Summary
───────────────────────────────────────────────────── */
function renderDepartmentReportSection(){
  let html = `<div class="marks-info-banner">
    <b>Department Report</b> — Full overview of your department: courses, students, teachers, attendance &amp; marks summary.
    The Excel export contains 3 sheets: <b>Students</b>, <b>Teachers</b> and a <b>Summary</b>.
  </div>`;

  if (deptReportLoading) {
    return html + `<div class="empty-state" style="margin-top:10px;"><div class="e-icon">⏳</div><p>Loading department report…</p></div>`;
  }

  // Per-course summary cards — attendance % is real, pulled from deptReportRows
  // (a department-wide attendance-report fetch), not the per-course wizard cache.
  html += '<div class="dept-report-grid">';
  HOD_COURSES.forEach(c=>{
    let stuList=allStudents.filter(s=>s.course===c);
    let tchrList=allTeachers.filter(t=>t.course===c);
    let courseRows=deptReportRows.filter(r=>r.course===c);
    let avgAtt=courseRows.length?Math.round(courseRows.reduce((a,b)=>a+b.percentage,0)/courseRows.length):0;
    let regular=courseRows.filter(r=>r.percentage>=75).length;
    html+=`<div class="dept-report-card">
      <div class="drc-header">
        <div class="drc-icon">🏛️</div>
        <div><div class="drc-title">${c}</div><div class="drc-sub">${currentHOD.department}</div></div>
      </div>
      <div class="drc-stats">
        <div class="drc-stat"><div class="dsv">${stuList.length}</div><div class="dsl">Students</div></div>
        <div class="drc-stat"><div class="dsv">${tchrList.length}</div><div class="dsl">Teachers</div></div>
        <div class="drc-stat"><div class="dsv" style="color:var(--success);">${avgAtt}%</div><div class="dsl">Avg Att.</div></div>
        <div class="drc-stat"><div class="dsv" style="color:var(--accent2);">${regular}</div><div class="dsl">Regular</div></div>
      </div>
    </div>`;
  });
  html += '</div>';

  // Export button
  html += `<div class="report-export-bar">
    <span style="font-size:13px;font-weight:700;color:var(--text2);">Export Full Department Report:</span>
    <button class="export-btn excel" onclick="exportDepartmentExcel()">📚 Download Excel</button>
  </div>`;

  // Full student table — attendance from deptReportRows, marks from savedMarks
  // cache (populated lazily as the HOD visits the Marks Upload/Report screens;
  // shows "—" for students whose marks haven't been loaded/uploaded yet).
  const rowsByStudentId = {};
  for (const r of deptReportRows) rowsByStudentId[String(r.student?._id || r.student)] = r;

  html += `<div class="report-card"><h3>🏛️ Students — ${currentHOD.department}</h3>
  <div class="tbl-scroll"><table class="report-table" id="deptReportTable">
    <thead><tr><th>#</th><th>Name</th><th>Roll</th><th>Course</th><th>Sem</th>
      <th>Present</th><th>Total Cls</th><th>Att %</th><th>Status</th><th>Mid-Sem</th><th>GTU</th>
    </tr></thead><tbody>`;
  allStudents.forEach((s,i)=>{
    const r = rowsByStudentId[String(s.id || s._id)];
    const present = r ? r.present : 0, total = r ? r.total : 0, pct = r ? r.percentage : 0;
    const status = pct >= 75 ? 'Regular' : 'Shortage';
    let midData=((savedMarks[s.course]||{})[s.sem]||{})['mid']||[];
    let gutData=((savedMarks[s.course]||{})[s.sem]||{})['gut']||[];
    let midEntry=midData.find(d=>String(d.id)===String(s.id));
    let gutEntry=gutData.find(d=>String(d.id)===String(s.id));
    html+=`<tr><td>${i+1}</td><td><b>${s.name}</b></td><td>${s.roll}</td><td>${s.course}</td><td>Sem ${s.sem}</td>
      <td>${present}</td><td>${total}</td><td><b>${pct}%</b></td>
      <td><span class="badge ${status==='Regular'?'badge-green':'badge-red'}">${status}</span></td>
      <td>${midEntry?`${midEntry.total}/${midEntry.totalMax} (${midEntry.percentage}%)`:'—'}</td>
      <td>${gutEntry?`${gutEntry.total}/${gutEntry.totalMax} (${gutEntry.percentage}%)`:'—'}</td></tr>`;
  });
  html += '</tbody></table></div></div>';

  // Full teacher table
  html += `<div class="report-card" style="margin-top:18px;"><h3>🧑‍🏫 Teachers — ${currentHOD.department}</h3>
  <div class="tbl-scroll"><table class="report-table" id="deptTchrTable">
    <thead><tr><th>#</th><th>Name</th><th>Course</th><th>Subject</th><th>Designation</th>
      <th>Lec Taken</th><th>Syllabus %</th><th>Att %</th>
    </tr></thead><tbody>`;
  tchrReports.forEach((t,i)=>{
    let sc=t.syllabusCompleted!=null?(t.syllabusCompleted>=80?'badge-green':t.syllabusCompleted>=60?'badge-yellow':'badge-red'):'badge-grey';
    let ac=t.teacherAttendance!=null?(t.teacherAttendance>=90?'badge-green':t.teacherAttendance>=75?'badge-yellow':'badge-red'):'badge-grey';
    html+=`<tr><td>${i+1}</td><td><b>${t.name}</b></td><td>${t.course}</td><td>${t.subject}</td>
      <td>${t.designation}</td><td>${t.taken ?? '—'}</td>
      <td><span class="badge ${sc}">${t.syllabusCompleted!=null?t.syllabusCompleted+'%':'N/A'}</span></td>
      <td><span class="badge ${ac}">${t.teacherAttendance!=null?t.teacherAttendance+'%':'N/A'}</span></td></tr>`;
  });
  html += '</tbody></table></div></div>';
  return html;
}

function exportDepartmentExcel(){
  try{
    let wb=XLSX.utils.book_new();
    // Sheet 1: Students
    let st=document.getElementById('deptReportTable');
    if(st){ XLSX.utils.book_append_sheet(wb,XLSX.utils.table_to_sheet(st),'Students'); }
    // Sheet 2: Teachers
    let tc=document.getElementById('deptTchrTable');
    if(tc){ XLSX.utils.book_append_sheet(wb,XLSX.utils.table_to_sheet(tc),'Teachers'); }
    // Sheet 3: Summary
    let sum=[
      ['Department Report — '+currentHOD.department],
      ['Generated',new Date().toLocaleString()],['HOD',currentHOD.name],[''],
      ['Course','Total Students','Total Teachers','Avg Attendance %','Regular','Shortage']
    ];
    HOD_COURSES.forEach(c=>{
      let sl=allStudents.filter(s=>s.course===c).length;
      let tl=allTeachers.filter(t=>t.course===c).length;
      let cr=deptReportRows.filter(r=>r.course===c);
      let avg=cr.length?Math.round(cr.reduce((a,b)=>a+b.percentage,0)/cr.length):0;
      let reg=cr.filter(r=>r.percentage>=75).length;
      sum.push([c,sl,tl,avg+'%',reg,cr.length-reg]);
    });
    let ws3=XLSX.utils.aoa_to_sheet(sum);
    ws3['!cols']=[{wch:24},{wch:16},{wch:16},{wch:20},{wch:12},{wch:12}];
    XLSX.utils.book_append_sheet(wb,ws3,'Summary');
    let fn=`Department_Report_${currentHOD.department.replace(/\s/g,'_')}_${new Date().toLocaleDateString('en-GB').replace(/\//g,'-')}`;
    XLSX.writeFile(wb,fn+'.xlsx');
    showToast('Department Report Excel downloaded!');
  }catch(e){showToast('Export failed: '+e.message,true);}
}
