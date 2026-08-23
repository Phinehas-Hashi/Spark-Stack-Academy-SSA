/* SSA FOUNDER OS — ADMISSIONS MANAGEMENT */
import { db } from "../js/firebase.js";
import { collection, getDocs, doc, updateDoc, getDoc, serverTimestamp, onSnapshot, query, orderBy, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
    if (!applications.length) { applicationsTable.innerHTML=`<tr><td colspan="6"><div class="empty-state"><strong>No applications found</strong><span>New applications will appear here automatically.</span></div></td></tr>`; return; }
    applicationsTable.innerHTML=applications.map(app=>{
        const status=normalizeStatus(app.status), pending=status==="pending";
        return `<tr><td><div class="applicant-cell"><strong>${escapeHTML(app.name||"Unknown")}</strong><span>${escapeHTML(app.phone||"No phone")}</span></div></td><td>${escapeHTML(app.course||"—")}</td><td><a class="email-link" href="mailto:${escapeHTML(app.email||"")}">${escapeHTML(app.email||"—")}</a></td><td><span class="status ${status}">${escapeHTML(app.status||"Pending")}</span></td><td>${formatDate(app.createdAt)}</td><td><div class="action-buttons">${pending?`<button class="action-btn approve" data-action="approve" data-id="${escapeHTML(app.id)}">✓</button><button class="action-btn reject" data-action="reject" data-id="${escapeHTML(app.id)}">×</button>`:`<span class="action-complete">Processed</span>`}</div></td></tr>`;
    }).join("");
}

function subscribeApplications() {
    unsubscribe?.();
    const q=query(collection(db,"applications"),orderBy("createdAt","desc"));
    unsubscribe=onSnapshot(q,snapshot=>{ applications=snapshot.docs.map(item=>({id:item.id,...item.data()})); updateStats(); renderApplications(); setLoading(false); },error=>{ console.error("Admissions listener failed:",error); applicationsTable.innerHTML=`<tr><td colspan="6"><div class="empty-state error"><strong>Unable to load applications</strong><span>Check your connection or Firestore permissions.</span></div></td></tr>`; setLoading(false); });
}

async function generateAdmissionNumber() {
    const year=new Date().getFullYear();
    const snapshot=await getDocs(query(collection(db,"students"),where("admissionNumber","!=","Pending")));
    return `SSA-${year}-${String(snapshot.size+1).padStart(4,"0")}`;
}

async function approveApplication(id) {
    const application=applications.find(app=>app.id===id);
    if (!application || normalizeStatus(application.status)!=="pending") return;
    if (!application.studentUid) throw new Error("This application is missing its student account. Ask the applicant to sign up again.");
    if (!application.email) throw new Error("This application has no email address.");

    const confirmed=await (window.ssaConfirm ? window.ssaConfirm(`Approve ${application.name||"this applicant"}? Their existing signup account will become an active student and receive an admission number.`,{title:"Approve admission",confirmText:"Approve student",cancelText:"Keep pending"}) : Promise.resolve(false));
    if (!confirmed) return;

    const button=document.querySelector(`.approve[data-id="${CSS.escape(id)}"]`); if(button) button.disabled=true;
    try {
        const studentRef=doc(db,"students",application.studentUid);
        const userRef=doc(db,"users",application.studentUid);
        const [studentSnap,userSnap]=await Promise.all([getDoc(studentRef),getDoc(userRef)]);
        if (!studentSnap.exists()) throw new Error("Student profile was not found.");

        const admissionNo=await generateAdmissionNumber();
        const approvedAt=serverTimestamp();
        await updateDoc(studentRef,{ admissionNumber:admissionNo, admissionNo, username:admissionNo, status:"Active", onboardingStatus:"approved", approvedAt, approvedBy:"founder" });
        if (userSnap.exists()) await updateDoc(userRef,{ status:"active", admissionNumber:admissionNo, admissionNo, verified:true, approvedAt });
        await updateDoc(doc(db,"applications",id),{ status:"Approved", admissionNo, studentUid:application.studentUid, processedAt:approvedAt });

        window.showFounderToast?.(`Admission approved — ${admissionNo}`,"success");
    } catch(error) {
        console.error("Approval failed:",error);
        window.showFounderToast?.(error.message||"Approval failed.","error");
    } finally { if(button) button.disabled=false; }
}

async function rejectApplication(id) {
    const application=applications.find(app=>app.id===id);
    if (!application || normalizeStatus(application.status)!=="pending") return;
    const confirmed=await (window.ssaConfirm ? window.ssaConfirm(`Reject ${application.name||"this application"}?`,{title:"Reject application",confirmText:"Reject application",cancelText:"Keep pending",danger:true}) : Promise.resolve(false));
    if (!confirmed) return;
    try { await updateDoc(doc(db,"applications",id),{status:"Rejected",processedAt:serverTimestamp()}); window.showFounderToast?.("Application rejected.","success"); }
    catch(error){ console.error("Rejection failed:",error); window.showFounderToast?.(error.message||"Unable to reject application.","error"); }
}

document.addEventListener("click",event=>{ const button=event.target.closest("[data-action]"); if(!button)return; if(button.dataset.action==="approve") approveApplication(button.dataset.id); if(button.dataset.action==="reject") rejectApplication(button.dataset.id); });
refreshBtn?.addEventListener("click",async()=>{ setLoading(true); try { await getDocs(collection(db,"applications")); } catch(error) { console.error(error); window.showFounderToast?.(error.message||"Refresh failed.","error"); setLoading(false); } });
subscribeApplications();