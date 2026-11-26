/* SSA FOUNDER OS — ADMISSIONS MANAGEMENT */
import { auth, db } from "../js/firebase.js";
import { collection, getDocs, doc, updateDoc, getDoc, serverTimestamp, onSnapshot, query, orderBy, where, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = id => document.getElementById(id);
const applicationsTable = $("applicationsTable");
const pendingCount = $("pendingCount");
const approvedCount = $("approvedCount");
const rejectedCount = $("rejectedCount");
const totalCount = $("totalCount");
const applicationTotal = $("applicationTotal");
const refreshBtn = $("refreshAdmissions");
let applications = [];
let unsubscribe = null;
const searchInput = $("admissionsSearch");
const statusFilter = $("admissionsStatus");

const escapeHTML = (value = "") => String(value).replace(/[&<>'"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[char]));
const normalizeStatus = status => String(status || "Pending").toLowerCase();
function formatDate(timestamp) { if (!timestamp) return "—"; try { const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"}); } catch { return "—"; } }
function setLoading(value) { if (!refreshBtn) return; refreshBtn.disabled=value; refreshBtn.classList.toggle("is-loading",value); refreshBtn.setAttribute("aria-busy",String(value)); }

function updateStats() {
    const counts = applications.reduce((acc, app) => { const status=normalizeStatus(app.status); acc[status]=(acc[status]||0)+1; return acc; },{});
    if (pendingCount) pendingCount.textContent=counts.pending||0;
    if (approvedCount) approvedCount.textContent=counts.approved||0;
    if (rejectedCount) rejectedCount.textContent=counts.rejected||0;
    if (totalCount) totalCount.textContent=applications.length;
    if (applicationTotal) applicationTotal.textContent=`${applications.length} ${applications.length===1?"Application":"Applications"}`;
}

function renderApplications() {
    const search=String(searchInput?.value||"").trim().toLowerCase();
    const filter=String(statusFilter?.value||"all").toLowerCase();
    const visible=applications.filter(app=>{
        const status=normalizeStatus(app.status);
        const matchesStatus=filter==="all"||status===filter;
        const haystack=[app.name,app.email,app.course,app.phone].filter(Boolean).join(" ").toLowerCase();
        return matchesStatus&&(!search||haystack.includes(search));
    });
    if (!visible.length) {
        const message=applications.length?"No applications match these filters.":"New applications will appear here automatically.";
        applicationsTable.innerHTML=`<tr><td colspan="6"><div class="empty-state"><strong>No applications found</strong><span>${escapeHTML(message)}</span></div></td></tr>`;
        return;
    }
    applicationsTable.innerHTML=visible.map(app=>{
        const status=normalizeStatus(app.status), pending=status==="pending";
        return `<tr>
          <td><div class="applicant-cell"><strong>${escapeHTML(app.name||"Unknown")}</strong><span>${escapeHTML(app.phone||"No phone")}</span></div></td>
          <td>${escapeHTML(app.course||"—")}</td>
          <td><a class="email-link" href="mailto:${escapeHTML(app.email||"")}">${escapeHTML(app.email||"—")}</a></td>
          <td><span class="status ${escapeHTML(status)}">${escapeHTML(app.status||"Pending")}</span></td>
          <td>${formatDate(app.createdAt)}</td>
          <td><div class="action-buttons">${pending?`<button class="action-btn approve" aria-label="Approve ${escapeHTML(app.name||"applicant")}" title="Approve" data-action="approve" data-id="${escapeHTML(app.id)}">✓</button><button class="action-btn reject" aria-label="Reject ${escapeHTML(app.name||"applicant")}" title="Reject" data-action="reject" data-id="${escapeHTML(app.id)}">×</button>`:`<span class="action-complete">Processed</span>`}</div></td>
        </tr>`;
    }).join("");
}
function subscribeApplications() {
    unsubscribe?.();
    const q=query(collection(db,"applications"),orderBy("createdAt","desc"));
    unsubscribe=onSnapshot(q,snapshot=>{ applications=snapshot.docs.map(item=>({id:item.id,...item.data()})); updateStats(); renderApplications(); setLoading(false); },error=>{ console.error("Admissions listener failed:",error); applicationsTable.innerHTML=`<tr><td colspan="6"><div class="empty-state error"><strong>Unable to load applications</strong><span>Check your connection or Firestore permissions.</span></div></td></tr>`; setLoading(false); });
}

function generateAdmissionNumber() {
    const year=new Date().getFullYear();
    const suffix=crypto.randomUUID().replaceAll("-","").slice(0,8).toUpperCase();
    return `SSA-${year}-${suffix}`;
}

async function approveApplication(id) {
    const application=applications.find(app=>app.id===id);
    if (!application || normalizeStatus(application.status)!=="pending") return;
    if (!application.studentUid) throw new Error("This application is missing its student account. Ask the applicant to sign up again.");
    if (!application.email) throw new Error("This application has no email address.");
    const confirmed=await (window.ssaConfirm ? window.ssaConfirm(
      `Approve ${application.name||"this applicant"}? Their existing account will be activated and assigned a unique admission number.`,
      {title:"Approve admission",confirmText:"Approve student",cancelText:"Keep pending"}
    ) : Promise.resolve(false));
    if (!confirmed) return;

    const button=document.querySelector(`.approve[data-id="${CSS.escape(id)}"]`);
    if(button) button.disabled=true;
    try {
        const admissionNo=generateAdmissionNumber();
        const approvedAt=serverTimestamp();
        const studentRef=doc(db,"students",application.studentUid);
        const userRef=doc(db,"users",application.studentUid);
        const applicationRef=doc(db,"applications",id);
        const numberRef=doc(db,"admissionNumbers",admissionNo);
        const founderUid=auth.currentUser?.uid;
        if(!founderUid) throw new Error("Founder session expired. Sign in again.");

        await runTransaction(db,async transaction=>{
            const [applicationSnap,studentSnap,userSnap,numberSnap]=await Promise.all([
                transaction.get(applicationRef),transaction.get(studentRef),transaction.get(userRef),transaction.get(numberRef)
            ]);
            if(!applicationSnap.exists()||normalizeStatus(applicationSnap.data().status)!=="pending") throw new Error("This application has already been processed.");
            if(!studentSnap.exists()) throw new Error("Student profile was not found.");
            if(!userSnap.exists()) throw new Error("The student's Academy account is missing. Do not approve until the account is repaired.");
            if(numberSnap.exists()) throw new Error("Admission number collision. Refresh and try again.");

            transaction.set(numberRef,{admissionNumber:admissionNo,studentUid:application.studentUid,createdBy:founderUid,createdAt:serverTimestamp()});
            transaction.update(studentRef,{admissionNumber:admissionNo,admissionNo,username:admissionNo,status:"Active",onboardingStatus:"approved",approvedAt,approvedBy:founderUid});
            transaction.update(userRef,{status:"active",active:true,admissionNumber:admissionNo,admissionNo,verified:true,approvedAt,approvedBy:founderUid});
            transaction.update(applicationRef,{status:"Approved",admissionNo,studentUid:application.studentUid,processedAt:approvedAt,processedBy:founderUid});
        });
        window.ssaSecuritySignal?.("suspicious_action",{portal:"founder",note:"Founder approved an admission"});
        window.showFounderToast?.(`Admission approved — ${admissionNo}`,"success");
    } catch(error) {
        console.error("Approval failed:",error);
        window.showFounderToast?.(error.message||"Approval failed.","error");
    } finally { if(button) button.disabled=false; }
}
async function rejectApplication(id) {
    const application=applications.find(app=>app.id===id);
    if (!application || normalizeStatus(application.status)!=="pending") return;
    const reason=String(await (window.ssaPrompt?.("Provide a reason for rejecting this application.",{title:"Rejection reason",confirmText:"Continue",type:"text"}) ?? "")).trim();
    if(!reason) return window.showFounderToast?.("A rejection reason is required.","error");
    const confirmed=await (window.ssaConfirm ? window.ssaConfirm(`Reject ${application.name||"this application"}? The reason will be saved with the application.`,{title:"Reject application",confirmText:"Reject application",cancelText:"Keep pending",danger:true}) : Promise.resolve(false));
    if (!confirmed) return;
    try { await updateDoc(doc(db,"applications",id),{status:"Rejected",rejectionReason:reason,processedAt:serverTimestamp(),processedBy:auth.currentUser?.uid||""}); window.showFounderToast?.("Application rejected.","success"); }
    catch(error){ console.error("Rejection failed:",error); window.showFounderToast?.(error.message||"Unable to reject application.","error"); }
}

document.addEventListener("click",event=>{ const button=event.target.closest("[data-action]"); if(!button)return; if(button.dataset.action==="approve") approveApplication(button.dataset.id); if(button.dataset.action==="reject") rejectApplication(button.dataset.id); });
searchInput?.addEventListener("input",renderApplications);
statusFilter?.addEventListener("change",renderApplications);
refreshBtn?.addEventListener("click",()=>{ setLoading(true); subscribeApplications(); });
subscribeApplications();