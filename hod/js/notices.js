// hod/js/notices.js — Notices & Announcements: View, Post, Refresh

// hod/js/notices.js — View notices (HOD reads notices)
const Notices = {
  async load(){
    const el=document.getElementById('notices-list');
    el.innerHTML='<p class="loading-text">Loading notices…</p>';
    const {ok,data}=await API.getNotices();
    if(!ok){ el.innerHTML=`<p class="error-text">${data.message}</p>`; return; }
    if(!data.notices.length){ el.innerHTML='<div class="empty-state"><p>No notices yet.</p></div>'; return; }
    el.innerHTML=data.notices.map(n=>`
      <div class="notice-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
          <div class="notice-title">${n.title}</div>
          <span class="badge badge-info">${n.targetRole==='all'?'Everyone':n.targetRole}</span>
        </div>
        <div class="notice-body">${n.body}</div>
        <div class="notice-meta">By <strong>${n.postedBy?.name||'Unknown'}</strong> · ${UI.date(n.createdAt)}</div>
      </div>`).join('');
  },
};

// ─── Announcements (Post / Manage) ───
/* ═══ ANNOUNCEMENTS ═══ */
async function refreshAnnouncements(){
  const data = await apiJson("/api/hod/announcements");
  announcements = data.announcements || [];
}
async function loadAnnouncements(){
  annCourse=null;annSem=null;annTarget="student";
  try{ await refreshAnnouncements(); }catch(e){}
  renderAnnPage();
}
function renderAnnPage(){
  let html=`<div class="course-picker" style="margin-bottom:16px;">${HOD_COURSES.map(c=>`<div class="cpick ${annCourse===c?'active':''}" onclick="setAnnCourse('${c}')"><h4>${c}</h4><p>Select course</p></div>`).join("")}</div>`;
  if(annCourse){
    html+=`<div class="sem-tabs" style="margin-bottom:18px;"><div class="sem-tab select-all ${annSem===null?'active':''}" onclick="setAnnSem(null)">All Sems</div>${Array.from({length:SEM_COUNT},(_,i)=>`<div class="sem-tab ${annSem===i+1?'active':''}" onclick="setAnnSem(${i+1})">Sem ${i+1}</div>`).join("")}</div>`;
    let stuCnt=allStudents.filter(s=>s.course===annCourse&&(annSem===null||s.sem===annSem)).length;
    let tch=allTeachers.filter(t=>t.course===annCourse);
    html+=`<div class="ann-sem-info">📚 ${annCourse}${annSem?' — Sem '+annSem:' — All Semesters'} &nbsp;|&nbsp; 👤 ${stuCnt} Students &nbsp;|&nbsp; 🧑‍🏫 ${tch.length} Teachers</div>`;
    html+=`<div class="ann-compose"><h4>✉️ Compose Announcement</h4>
      <div class="ann-target-tabs">
        <div class="ann-target-tab ${annTarget==='student'?'active':''}" onclick="setAnnTarget('student')">📚 Students</div>
        <div class="ann-target-tab ${annTarget==='teacher'?'active':''}" onclick="setAnnTarget('teacher')">🧑‍🏫 Teachers</div>
        <div class="ann-target-tab ${annTarget==='all'?'active':''}" onclick="setAnnTarget('all')">📄¢ All</div>
      </div>
      <input id="annTitleInput" placeholder="Announcement Title" value="">
      <textarea id="annBodyInput" rows="3" placeholder="Write your message here..."></textarea>
      ${annTarget==='teacher'||annTarget==='all'?`<p style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px;">Select Teachers:</p><div class="teacher-select-list"><label class="tchr-chk-item"><input type="checkbox" id="tchrAll" onchange="toggleAllTchrs(this)"> <b>Select All</b></label>${tch.map(t=>`<label class="tchr-chk-item"><input type="checkbox" class="tchr-chk" value="${t.id}"> ${t.name} — ${t.subject}</label>`).join("")}</div>`:""}
      <label class="file-upload-label" for="annFileInput">📎 Attach File <small>(PDF, Image, Doc)</small><input type="file" id="annFileInput" style="display:none;" onchange="showFileName(this)"></label>
      <span id="annFileName" style="font-size:12px;color:var(--text3);"></span>
      <div style="margin-top:12px;"><button class="btn btn-primary" onclick="postAnnouncement()">📄 Post Announcement</button></div>
    </div>`;
  }
  let posted=announcements.filter(a=>!annCourse||a.course===annCourse);
  html+=`<div style="margin-top:6px;"><div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:14px;">📄 Posted Announcements</div><div class="ann-list-section">${posted.length?posted.map(a=>`<div class="ann-item ${a.targetRole==='student'?'student-ann':'teacher-ann'}"><div style="display:flex;justify-content:space-between;align-items:flex-start;"><h4>${a.title}</h4><span class="badge badge-blue">${a.targetRole==='student'?'Students':a.targetRole==='teacher'?'Teachers':'All'}</span></div><p>${a.body}</p><div class="ann-meta"><span>📚 ${a.course}</span>${a.semester?`<span>🗂 Sem ${a.semester}</span>`:'<span>🗂 All Sems</span>'}${a.attachment?`<span><a href="${a.attachment}" download="${a.attachmentName||'Announcement.pdf'}">📎 ${a.attachmentName||'Download PDF'}</a></span>`:''}${a.teachers?`<span>🧑‍🏫 ${a.teachers}</span>`:''}<span>🕒 ${fmtDate(a.createdAt||a.date)}</span></div></div>`).join(""):`<div class="empty-state"><div class="e-icon">📄</div><p>No announcements posted yet.</p></div>`}</div></div>`;
  document.getElementById("annContent").innerHTML=html;
}
function setAnnCourse(c){annCourse=c;annSem=null;renderAnnPage();}
function setAnnSem(s){annSem=s;renderAnnPage();}
function setAnnTarget(t){annTarget=t;renderAnnPage();}
function toggleAllTchrs(cb){document.querySelectorAll(".tchr-chk").forEach(c=>c.checked=cb.checked);}
function showFileName(inp){let el=document.getElementById("annFileName");if(el)el.textContent=inp.files[0]?inp.files[0].name:"";}
async function postAnnouncement(){
  let title=document.getElementById("annTitleInput")?.value.trim();
  let body=document.getElementById("annBodyInput")?.value.trim();
  if(!title||!body){showToast('Please enter title and message.',true);return;}
  let fileEl=document.getElementById("annFileInput");
  let file=fileEl&&fileEl.files[0];
  let teacherNames="", targetTeacherIds=[];
  if(annTarget!=="student"){
    let sel=[...document.querySelectorAll(".tchr-chk:checked")].map(c=>String(c.value));
    let tch=allTeachers.filter(t=>t.course===annCourse);
    // If specific teachers were ticked (not "Select All"), only those get it.
    // If none ticked / Select All was used, leave the array empty = whole department.
    if(sel.length && sel.length < tch.length) targetTeacherIds = sel;
    teacherNames=(sel.length?allTeachers.filter(t=>sel.includes(String(t.id))):tch).map(t=>t.name).join(", ");
  }

  // Was previously only sending the filename as plain text — the actual PDF
  // was never uploaded. Now reads and sends the real file content.
  let attachment, attachmentName;
  if(file){
    if(file.type!=='application/pdf'){showToast('Only PDF attachments are supported.',true);return;}
    if(file.size>5*1024*1024){showToast('PDF is too large (max 5MB).',true);return;}
    try{
      attachment = await new Promise((resolve,reject)=>{
        const reader=new FileReader();
        reader.onerror=()=>reject(new Error('Could not read the file.'));
        reader.onload=()=>resolve(reader.result);
        reader.readAsDataURL(file);
      });
      attachmentName = file.name;
    }catch(e){ showToast(e.message,true); return; }
  }

  try{
    await apiJson("/api/hod/announcements", {
      method:"POST",
      body: JSON.stringify({
        title,
        body,
        course: annCourse,
        semester: annSem || undefined,
        targetRole: annTarget,
        targetTeacherIds,
        priority: "normal",
        attachment, attachmentName
      })
    });
    await refreshAnnouncements();
    showToast('Announcement posted!');renderAnnPage();
  }catch(e){
    showToast(e.message||"Post failed",true);
  }
}

