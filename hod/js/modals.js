// hod/js/modals.js — Detail Modals: Student, Teacher, Lecture History, Marks

/* ═══ OVERRIDE openStudentModal — show ALL subjects correctly ═══ */
async function openStudentModal(id){
  closeAllModals(); /* close any open modal first */
  let s=allStudents.find(x=>String(x.id)===String(id));
  if(!s) return;
  try {
    await buildStuReports(s.course, s.sem, true);
  } catch (e) {
    console.warn('[HOD] Failed to refresh student attendance:', e.message);
    showToast('Could not refresh latest attendance. Showing last loaded data.', true);
  }
  currentStuId=id; stuEditMode=false;
  document.getElementById('modalAvatar').src=`${s.avatar || 'https://ui-avatars.com/api/?name='+encodeURIComponent(s.name)+'&size=150&background=random'}`;
  document.getElementById('modalName').textContent=s.name;
  document.getElementById('modalMeta').textContent=`${s.course} | Semester ${s.sem} | Roll: ${s.roll}`;
  const addressText = [s.address, s.city, s.state, s.pincode].filter(Boolean).join(', ');
  document.getElementById('modalPersonal').innerHTML=
    mField('Full Name',s.name,'name')+mField('Gender',s.gender,'gender')+
    mField('Date of Birth',s.dob,'dob')+mField('Blood Group',s.bloodGroup,'bloodGroup')+
    mField('Phone',s.phone,'phone')+mField('Email',s.email,'email')+
    mField('Address',addressText,'address')+mField('City',s.city,'city');
  document.getElementById('modalParent').innerHTML=
    mField('Parent Name',s.parentName,'parentName')+mField('Relation',s.parentRelation,'parentRelation')+
    mField('Parent Phone',s.parentPhone,'parentPhone')+mField('Parent Email',s.parentEmail,'parentEmail','email')+
    mFieldSel('Category',s.category,'category',['General','OBC','SC','ST']);
  document.getElementById('modalAcademic').innerHTML=
    mField('Course',s.course,'course')+mField('Semester',s.sem,'sem','number')+
    mField('Roll No',s.roll,'roll')+mField('Admission Year',s.admissionYear,'admissionYear','number')+
    mFieldSel('Status',s.status,'status',['Active','Inactive']);
  // Remove old dynamic sections
  document.querySelectorAll('#studentModal .att-dyn-section').forEach(el=>el.remove());
  // Build fresh attendance + full subjects section
  let rpt=stuReports.find(r=>String(r.id)===String(s.id));
  let allSubjNames=getSubjNames(s.course,s.sem);
  let subs=allSubjNames.map(subName=>{
    let ex=rpt?(rpt.subjects||[]).find(x=>x.subject===subName):null;
    if(ex) return ex;
    return {subject:subName,total:0,attended:0,pct:0};
  });
  let totalAtt=subs.reduce((a,b)=>a+b.attended,0);
  let totalAll=subs.reduce((a,b)=>a+b.total,0)||1;
  let overallPct=Math.round(totalAtt/totalAll*100);
  let pctColor=overallPct>=75?'var(--success)':overallPct>=60?'var(--warn)':'var(--danger)';
  let attHtml='<div class="modal-section att-dyn-section"><h4>Attendance Overview</h4>';
  attHtml+=`<div class="att-overview">
    <div class="att-ov-box green"><h3>${totalAtt}</h3><small>Present</small></div>
    <div class="att-ov-box red"><h3>${totalAll-totalAtt}</h3><small>Absent</small></div>
    <div class="att-ov-box purple"><h3 style="color:${pctColor}">${overallPct}%</h3><small>Overall</small></div>
  </div>`;
  attHtml+='<div class="modal-section"><h4>Subjects &mdash; Tap to View Lectures</h4><div class="subj-list">';
  subs.forEach(sub=>{
    let pctCls=sub.pct>=75?'badge-green':sub.pct>=60?'badge-yellow':'badge-red';
    let safeSubj=sub.subject.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    attHtml+=`<div class="subj-item" onclick="openLecHist('${s.id}','${safeSubj}')">
      <div class="subj-item-left"><strong>${sub.subject}</strong><small>${sub.attended}/${sub.total} classes</small></div>
      <div class="subj-item-right"><span class="pct-badge badge ${pctCls}">${sub.pct}%</span><span class="arrow">&#8250;</span></div>
    </div>`;
  });
  attHtml+='</div></div></div>';
  let firstSection=document.querySelector('#studentModal .modal-body .modal-section');
  if(firstSection) firstSection.insertAdjacentHTML('beforebegin',attHtml);
  document.getElementById('stuEditSuccess').style.display='none';
  document.getElementById('stuEditBtn').style.display='';
  document.getElementById('stuDoneBtn').style.display='none';
  document.getElementById('studentModal').classList.add('open');
}

/* ═══ OVERRIDE openLecHist — use savedAttendance if available ═══ */
async function openLecHist(stuId,subjName){
  /* close student modal before opening lecture history */
  let s=allStudents.find(x=>String(x.id)===String(stuId));
  if(!s) return;
  try {
    await buildStuReports(s.course, s.sem, true);
  } catch (e) {
    console.warn('[HOD] Failed to refresh lecture history:', e.message);
  }
  document.getElementById('lecHistTitle').textContent=subjName+' — Lecture History';
  let dates=Object.keys(((savedAttendance[s.course]||{})[s.sem]||{})[subjName]||{});
  let records=[];
  if(dates.length){
    dates.sort().forEach((date,i)=>{
      let code=((savedAttendance[s.course][s.sem][subjName][date])||{})[stuId]||'P';
      records.push({num:i+1,date,status:code==='P'?'present':code==='A'?'absent':'extra'});
    });
  } else {
    let rpt=stuReports.find(r=>String(r.id)===String(stuId));
    let sub=rpt?(rpt.subjects||[]).find(x=>x.subject===subjName):null;
    let total=sub?sub.total:0, attended=sub?sub.attended:0;
    const dd=['Mon','Tue','Wed','Thu','Fri','Sat'];
    const mm=['Jan','Feb','Mar','Apr','May'];
    for(let i=1;i<=total;i++){
      let status=i>attended?'absent':i%8===0?'extra':'present';
      records.push({num:i,date:`${dd[(i-1)%6]}, ${i} ${mm[(i-1)%5]}`,status});
    }
  }
  let present=records.filter(r=>r.status==='present').length;
  let absent=records.filter(r=>r.status==='absent').length;
  let extra=records.filter(r=>r.status==='extra').length;
  let html=`<div class="lec-hist-stats">
    <div class="lh-stat green"><h3>${present}</h3><small>Present</small></div>
    <div class="lh-stat red"><h3>${absent}</h3><small>Absent</small></div>
    <div class="lh-stat yellow"><h3>${extra}</h3><small>Late</small></div>
  </div><table class="lec-table"><thead><tr><th>#</th><th>Date</th><th>Status</th></tr></thead><tbody>`;
  records.forEach(r=>{
    let cls=r.status==='present'?'present':r.status==='absent'?'absent':'extra';
    let lbl=r.status==='present'?'Present':r.status==='absent'?'Absent':'Late';
    html+=`<tr><td>${r.num}</td><td>${r.date}</td><td><span class="status-pill ${cls}">${lbl}</span></td></tr>`;
  });
  html+='</tbody></table>';
  document.getElementById('lecHistBody').innerHTML=html;
  document.getElementById('lecHistModal').classList.add('open');
}

/* ═══ OVERRIDE openTeacherModal — clear dynamic sections properly ═══ */
async function openTeacherModal(id){
  closeAllModals(); /* close any open modal first */
  let t=allTeachers.find(x=>String(x.id)===String(id));
  if(!t) return;
  currentTchrId=id; tchrEditMode=false;
  document.getElementById('tModalAvatar').src=`${t.avatar || 'https://ui-avatars.com/api/?name='+encodeURIComponent(t.name)+'&size=150&background=random'}`;
  document.getElementById('tModalName').textContent=t.name;
  document.getElementById('tModalMeta').textContent=`${t.designation} | ${t.course}`;
  document.getElementById('tModalContact').innerHTML=
    mField('Phone',t.phone,'tphone')+mField('Email',t.email,'temail')+
    mField('Emergency Contact',t.emergencyContact,'temergency')+
    mField('Course',t.course,'tcourse')+mFieldSel('Status',t.status,'tstatus',['Active','Inactive']);
  document.getElementById('tModalProf').innerHTML=
    mFieldSel('Designation',t.designation,'tdesig',['Assistant Professor','Associate Professor','Professor'])+
    mField('Qualification',t.qualification,'tqualification')+
    mField('Experience',t.experience,'texperience')+mField('Join Date',t.joinDate,'tjoinDate');
  let detail=null;
  try {
    detail = await apiJson(`/api/hod/teachers/${encodeURIComponent(t._id||t.id)}/detail`);
  } catch (e) {
    console.warn('[HOD] Teacher detail metrics unavailable:', e.message);
  }
  const metrics = detail?.metrics || {};
  const totalLec = metrics.scheduled || 0;
  const displayTaken = metrics.taken || 0;
  const syllabusCount = metrics.syllabus || 0;
  const attendanceMarked = metrics.attendanceMarked || 0;
  let lecHtml=`<div class="modal-section tchr-dyn-section"><h4>Lecture Attendance Taken</h4>
    <div class="tchr-lec-summary">
      <div class="tls-item"><div class="tls-val">${totalLec}</div><div class="tls-label">Scheduled</div></div>
      <div class="tls-item"><div class="tls-val" style="color:var(--success);">${displayTaken}</div><div class="tls-label">Taken</div></div>
      <div class="tls-item"><div class="tls-val" style="color:var(--warn);">${syllabusCount}</div><div class="tls-label">Syllabus</div></div>
      <div class="tls-item"><div class="tls-val" style="color:var(--accent2);">${attendanceMarked}</div><div class="tls-label">Attendance marked</div></div>
    </div>
    <div class="tchr-lec-section"><h4>Recent Lecture History</h4>
    <table class="lec-table"><thead><tr><th>#</th><th>Date</th><th>Topic</th><th>Dur.</th><th>Status</th></tr></thead><tbody>`;
  const recentLectures = detail?.recentLectures || [];
  if(!recentLectures.length){
    lecHtml+=`<tr><td colspan="5" style="text-align:center;color:var(--text3)">No attendance lectures marked yet.</td></tr>`;
  }
  recentLectures.forEach((lec,i)=>{
    lecHtml+=`<tr><td>${i+1}</td><td>${fmtDate(lec.date)}</td><td>${escHtml(lec.topic || lec.subjectName || 'Lecture')}</td><td>${escHtml(lec.time || '-')}</td><td><span class="status-pill present">${lec.isProxy?'Proxy':'Taken'}</span></td></tr>`;
  });
  lecHtml+='</tbody></table></div></div>';
  document.querySelectorAll('#teacherModal .tchr-dyn-section').forEach(el=>el.remove());
  let firstTSec=document.querySelector('#teacherModal .modal-body .modal-section');
  if(firstTSec) firstTSec.insertAdjacentHTML('beforebegin',lecHtml);
  document.querySelectorAll('#teacherModal .tchr-sched-section').forEach(el=>el.remove());
  if(firstTSec) firstTSec.insertAdjacentHTML('beforebegin', teacherScheduleSectionHTML(t));
  await renderTeacherScheduleList(t);
  document.getElementById('tchrEditSuccess').style.display='none';
  document.getElementById('tchrEditBtn').style.display='';
  document.getElementById('tchrDoneBtn').style.display='none';
  document.getElementById('teacherModal').classList.add('open');
}

/* ═══════════════════════════════════════════════════════
   TEACHER WEEKLY SCHEDULE (spec item 3)
   Replaces the old free-text "Subject" field on Teacher Details.
   Reuses the same subject-lock + conflict-check engine as the
   course/sem Schedule builder (hod/js/schedule.js) — a lecture
   added here is the exact same Schedule document, just added one
   at a time and viewed from the teacher's side instead of the class's.
═════════════════════════════════════════════════════════ */

const TCHR_SCHED_DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat'];

function teacherScheduleSectionHTML(t){
  return `<div class="modal-section tchr-sched-section">
    <h4>Weekly Schedule</h4>
    <div id="tchrSchedList" class="sched-slot-list"><div class="sched-empty-day">Loading…</div></div>
    <div style="margin-top:12px">
      <button class="btn btn-ghost btn-sm" id="tchrAddLecBtn" onclick="toggleAddTeacherLectureForm()">＋ Add Lecture</button>
      <div id="tchrAddLecForm" style="display:none;margin-top:10px;padding:12px;border:1px solid var(--border,#333);border-radius:8px">
        <div class="form-grid">
          <div class="form-group"><label>Day</label><select id="tlDay">${TCHR_SCHED_DAYS.map(d=>`<option>${d}</option>`).join('')}</select></div>
          <div class="form-group"><label>Start Time</label><input type="time" id="tlStart" value="09:00"></div>
          <div class="form-group"><label>End Time</label><input type="time" id="tlEnd" value="10:00"></div>
          <div class="form-group"><label>Course</label><select id="tlCourse" onchange="updateTeacherLectureSubjects()">${HOD_COURSES.map(c=>`<option>${c}</option>`).join('')}</select></div>
          <div class="form-group"><label>Semester</label><select id="tlSem" onchange="updateTeacherLectureSubjects()">${Array.from({length:SEM_COUNT},(_,i)=>`<option value="${i+1}">Semester ${i+1}</option>`).join('')}</select></div>
          <div class="form-group"><label>Division (optional)</label><input id="tlDivision" placeholder="e.g. A"></div>
          <div class="form-group"><label>Subject (Admin list)</label><select id="tlSubject"><option value="">-- Select course/sem first --</option></select></div>
          <div class="form-group"><label>Room (optional)</label><input id="tlRoom" placeholder="e.g. A-101"></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:10px">
          <button class="btn btn-success btn-sm" onclick="saveTeacherLecture()">Save Lecture</button>
          <button class="btn btn-ghost btn-sm" onclick="toggleAddTeacherLectureForm(false)">Cancel</button>
        </div>
      </div>
    </div>
  </div>`;
}

function toggleAddTeacherLectureForm(force){
  const el=document.getElementById('tchrAddLecForm');
  if(!el) return;
  const show = force!==undefined ? force : el.style.display==='none';
  el.style.display = show ? 'block' : 'none';
  if(show) updateTeacherLectureSubjects();
}

function updateTeacherLectureSubjects(){
  const course=document.getElementById('tlCourse')?.value;
  const sem=Number(document.getElementById('tlSem')?.value||1);
  const sel=document.getElementById('tlSubject');
  if(!sel) return;
  const subs = (typeof getSubjObjects==='function') ? getSubjObjects(course,sem) : [];
  sel.innerHTML = subs.length
    ? `<option value="">-- Select subject --</option>${subs.map(s=>`<option value="${s.id}">${escHtml(s.name)}</option>`).join('')}`
    : `<option value="">No subjects for ${course} Sem ${sem} — ask Admin to add one</option>`;
}

async function renderTeacherScheduleList(t){
  const listEl=document.getElementById('tchrSchedList');
  if(!listEl) return;
  try{
    const data=await apiJson(`/api/hod/schedule?teacher=${encodeURIComponent(t._id||t.id)}`);
    const docs=(data.docs||[]).slice().sort((a,b)=>{
      const di=TCHR_SCHED_DAYS.indexOf(a.day)-TCHR_SCHED_DAYS.indexOf(b.day);
      return di!==0 ? di : String(a.startTime||'').localeCompare(String(b.startTime||''));
    });
    if(!docs.length){
      listEl.innerHTML='<div class="sched-empty-day">No lectures scheduled for this teacher yet.</div>';
      return;
    }
    listEl.innerHTML=docs.map(d=>`
      <div class="sched-slot-card">
        <div class="ssc-time"><b>${d.day}</b>&nbsp;${d.time||`${d.startTime}–${d.endTime||''}`}</div>
        <div class="ssc-info">
          <span><b>${escHtml(d.subjectName||'')}</b></span>
          <span>${escHtml(d.course||'')} Sem ${d.semester||''}${d.division?(' '+escHtml(d.division)):''}</span>
          ${d.room?`<span>Room ${escHtml(d.room)}</span>`:''}
        </div>
        <button class="ssc-del" title="Remove lecture" onclick="removeTeacherLecture('${d._id}')">✕</button>
      </div>`).join('');
  }catch(e){
    listEl.innerHTML=`<div class="sched-empty-day" style="color:var(--danger)">Could not load schedule: ${escHtml(e.message||'')}</div>`;
  }
}

async function saveTeacherLecture(){
  const t=allTeachers.find(x=>String(x.id)===String(currentTchrId));
  if(!t) return;
  const day=document.getElementById('tlDay').value;
  const startTime=document.getElementById('tlStart').value;
  const endTime=document.getElementById('tlEnd').value;
  const course=document.getElementById('tlCourse').value;
  const semester=Number(document.getElementById('tlSem').value);
  const division=document.getElementById('tlDivision').value.trim();
  const subjectId=document.getElementById('tlSubject').value;
  const room=document.getElementById('tlRoom').value.trim();
  if(!subjectId){ showToast('Please select a subject from the Admin subject list.', true); return; }
  if(!_isLectureDurationValid(startTime, endTime)){ showToast('A lecture must be at least 30 minutes long.', true); return; }
  try{
    await apiJson('/api/hod/schedule/slot', {
      method:'POST',
      body: JSON.stringify({ day, startTime, endTime, course, semester, division, subjectId, room, teacher: t._id||t.id })
    });
    showToast('Lecture added to teacher\'s timetable.');
    toggleAddTeacherLectureForm(false);
    await renderTeacherScheduleList(t);
  }catch(e){
    showToast(e.message||'Could not add lecture.', true);
  }
}

async function removeTeacherLecture(scheduleId){
  const t=allTeachers.find(x=>String(x.id)===String(currentTchrId));
  if(!t) return;
  try{
    await apiJson(`/api/hod/schedule/${scheduleId}`, { method:'DELETE' });
    showToast('Lecture removed.');
    await renderTeacherScheduleList(t);
  }catch(e){
    showToast(e.message||'Could not remove lecture.', true);
  }
}


/* ═══════════════════════════════════════════════════════
   STUDENT MARKS MODAL
   Opens when clicking 📚 Marks button on any student row.
   Shows Mid-Semester / GTU / Remedial / Practical marks.
   Includes subject search filter.
═════════════════════════════════════════════════════════ */

let currentMarksStudentId = null;
let currentMarksType = 'mid'; // 'mid' | 'gut' | 'remedial' | 'practical'

/**
 * Open the marks modal for a given student.
 * Called from student row's 📚 button.
 */
function openStuMarksModal(stuId){
  closeAllModals(); /* ensure only one modal is open */
  let s = allStudents.find(x=>String(x.id)===String(stuId));
  if(!s) return;
  currentMarksStudentId = stuId;
  currentMarksType = 'mid';
  document.getElementById('marksModalStudentName').textContent = s.name;
  document.getElementById('marksModalStudentMeta').textContent =
    `Roll: ${s.roll} · ${s.course} · Semester ${s.sem}`;
  document.getElementById('marksSubjectSearch').value = '';
  _updateMarksTypeBtns();
  renderMarksModalContent();
  document.getElementById('stuMarksModal').classList.add('open');
}

function closeStuMarksModal(){
  document.getElementById('stuMarksModal').classList.remove('open');
  currentMarksStudentId = null;
}

function setMarksModalType(type){
  currentMarksType = type;
  document.getElementById('marksSubjectSearch').value = '';
  _updateMarksTypeBtns();
  renderMarksModalContent();
}

function _updateMarksTypeBtns(){
  ['mid','gut','remedial','practical'].forEach(t=>{
    let btn = document.getElementById('mtsBtn_'+t);
    if(!btn) return;
    /* Reset all */
    btn.className = 'mts-btn';
    if(t===currentMarksType) btn.classList.add('active-'+t);
  });
}

function filterMarksSubjects(){
  renderMarksModalContent();
}

/**
 * Render the marks table for the selected student + exam type.
 * In production: fetch from /api/hod/marks/:studentId/:type
 */
function renderMarksModalContent(){
  let stuId = currentMarksStudentId;
  if(!stuId) return;
  let s = allStudents.find(x=>String(x.id)===String(stuId));
  if(!s) return;

  let q = (document.getElementById('marksSubjectSearch')?.value||'').trim().toLowerCase();

  /* Look up saved marks for this student's course+sem+type */
  let marksData = ((savedMarks[s.course]||{})[s.sem]||{})[currentMarksType]||[];
  let studentEntry = marksData.find(d=>String(d.id)===String(stuId));
  let subjects = getSubjNames(s.course, s.sem);

  /* Apply subject search */
  if(q) subjects = subjects.filter(sub=>sub.toLowerCase().includes(q));

  const typeLabel = {mid:'Mid-Semester Exam',gut:'GTU / Internal',remedial:'Remedial Exam',practical:'Practical'};
  let container = document.getElementById('marksModalContent');
  if(!container) return;

  if(!subjects.length && q){
    container.innerHTML=`<div class="marks-no-data"><div class="e-icon">🔍</div><p>No subjects match "${q}"</p></div>`;
    return;
  }

  if(!studentEntry){
    container.innerHTML=`
      <div style="background:rgba(249,199,79,.07);border:1px solid rgba(249,199,79,.25);border-radius:12px;padding:16px 18px;margin-bottom:12px;">
        <p style="font-size:13px;color:var(--warn);font-weight:600;">
          ⚠️ No ${typeLabel[currentMarksType]||currentMarksType} marks uploaded yet for ${s.course} Sem ${s.sem}.
        </p>
        <p style="font-size:12px;color:var(--text2);margin-top:5px;">
          Go to <b>Upload Marks</b> section to upload marks first.
        </p>
      </div>
      <div class="marks-table-wrap">
        <table class="marks-detail-table">
          <thead><tr><th>Subject</th><th>Max Marks</th><th>Marks Obtained</th><th>Grade</th></tr></thead>
          <tbody>
            ${subjects.map(sub=>`
              <tr>
                <td>${sub}</td>
                <td>30</td>
                <td><span style="color:var(--text3);font-style:italic;">Not uploaded</span></td>
                <td>—</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    return;
  }

  /* Student has marks data */
  let total = 0, maxTotal = subjects.length * 30;
  let rows = subjects.map(sub=>{
    let m = studentEntry.subjects?studentEntry.subjects[sub]:0; m=m||0;
    total += m;
    let pct = Math.round(m/30*100);
    let grade = pct>=90?'A+':pct>=75?'A':pct>=60?'B':pct>=50?'C':pct>=40?'D':'F';
    let cls = pct>=60?'badge-green':pct>=40?'badge-yellow':'badge-red';
    return `<tr>
      <td style="font-weight:600;">${sub}</td>
      <td style="color:var(--text2);">30</td>
      <td><span class="badge ${cls}">${m} / 30</span></td>
      <td><span class="badge ${pct>=60?'badge-green':pct>=40?'badge-yellow':'badge-red'}">${grade}</span></td>
    </tr>`;
  });

  let overallPct = maxTotal>0?Math.round(total/maxTotal*100):0;
  let result = studentEntry.result||( overallPct>=40?'Pass':'Fail' );

  container.innerHTML=`
    <!-- Summary chips -->
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;">
      <div class="att-stat-chip total" style="min-width:80px;">
        <div class="asv" style="font-size:18px;">${total}</div><div class="asl">Total</div>
      </div>
      <div class="att-stat-chip pct" style="min-width:80px;">
        <div class="asv" style="font-size:18px;">${overallPct}%</div><div class="asl">Score %</div>
      </div>
      <div class="att-stat-chip ${result==='Pass'?'present':'absent'}" style="min-width:80px;">
        <div class="asv" style="font-size:18px;">${result}</div><div class="asl">Result</div>
      </div>
    </div>
    <!-- Marks table -->
    <div class="marks-table-wrap">
      <table class="marks-detail-table">
        <thead><tr><th>Subject</th><th>Max</th><th>Marks</th><th>Grade</th></tr></thead>
        <tbody>${rows.join('')}</tbody>
        <tfoot>
          <tr style="background:var(--bg3);font-weight:700;">
            <td>Total</td><td>${maxTotal}</td>
            <td><span class="badge ${overallPct>=60?'badge-green':overallPct>=40?'badge-yellow':'badge-red'}">${total}/${maxTotal}</span></td>
            <td><span class="badge ${result==='Pass'?'badge-green':'badge-red'}">${result}</span></td>
          </tr>
        </tfoot>
      </table>
    </div>`;
}
function logoutUser(){

  let confirmLogout = confirm("Are you sure you want to logout?");

  if(confirmLogout){

    localStorage.removeItem("token");
    localStorage.removeItem("user");
    sessionStorage.clear();

    window.location.href = "login.html";
  }
}
