import { auth, db } from "../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, doc, getDoc, onSnapshot, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const certificateRef=doc(db,"settings","certificates");
const certificatesRef=collection(db,"certificates");
const $=id=>document.getElementById(id);
let stopCertificates=null;
let previousSettings={};
const showNotice=(message,type="success")=>{
  if(window.showFounderToast){window.showFounderToast(message,type);return;}
  const notice=document.createElement("div");
  notice.className=`founder-notice ${type}`;
  notice.textContent=message;
  document.body.appendChild(notice);
  setTimeout(()=>notice.remove(),3200);
};
function setStatus(message,isError=false){
  const box=$("certificateDataStatus"),label=$("certificateDataStatusText");
  if(!box||!label)return;
  box.classList.toggle("has-error",isError);
  box.classList.toggle("is-ready",!isError);
  label.textContent=message;
}
async function verifyFounder(user){
  const snap=await getDoc(doc(db,"founder",user.uid));
  const profile=snap.exists()?snap.data():{};
  if(!snap.exists()||profile.role!=="founder"||profile.status!=="active"||profile.active===false||profile.verified===false){
    throw new Error("Active Founder authorization required.");
  }
  const token=await user.getIdTokenResult();
  if(token.claims.firebase?.sign_in_second_factor!=="totp"){
    throw new Error("Complete Founder authenticator verification first.");
  }
}
async function loadCertificateSettings(){
  const snapshot=await getDoc(certificateRef);
  const data=snapshot.exists()?snapshot.data():{};
  previousSettings={...data};
  $("certificateTitle").value=data.certificateTitle||"";
  $("certificatePrefix").value=data.certificatePrefix||"SSA";
  $("founderName").value=data.founderName||"";
  $("founderTitle").value=data.founderTitle||"";
  $("enableQR").checked=data.enableQR===true;
  $("autoIssue").checked=data.autoIssue===true;
  $("allowDownloads").checked=data.allowDownloads===true;
}
async function saveCertificateSettings(){
  const settings={
    certificateTitle:$("certificateTitle").value.trim().slice(0,120),
    certificatePrefix:($("certificatePrefix").value.trim()||"SSA").toUpperCase(),
    founderName:$("founderName").value.trim().slice(0,100),
    founderTitle:$("founderTitle").value.trim().slice(0,100),
    enableQR:$("enableQR").checked,
    autoIssue:$("autoIssue").checked,
    allowDownloads:$("allowDownloads").checked,
    updatedAt:serverTimestamp(),
    updatedBy:auth.currentUser?.uid||""
  };
  if(!settings.certificateTitle)throw new Error("Certificate title is required.");
  if(!/^[A-Z0-9-]{2,10}$/.test(settings.certificatePrefix))throw new Error("Certificate prefix must contain 2–10 letters, numbers or hyphens.");
  if(settings.autoIssue&&!previousSettings.autoIssue){
    const confirmed=await window.ssaConfirm?.("Automatic certificate issuance will create certificate records when the configured completion workflow runs. Enable it only after verifying the course completion criteria.",{title:"Enable automatic issuance",confirmText:"Enable auto-issue",cancelText:"Keep disabled"});
    if(!confirmed)return;
  }else{
    const confirmed=await window.ssaConfirm?.("Save these certificate settings?",{title:"Save certificate configuration",confirmText:"Save settings",cancelText:"Cancel"});
    if(!confirmed)return;
  }
  await setDoc(certificateRef,settings,{merge:true});
  previousSettings={...settings};
  window.ssaSecuritySignal?.("founder_action",{portal:"founder",note:"Certificate settings updated"});
  showNotice("Certificate settings saved.");
}
function statusOf(data){return String(data.status||data.verificationStatus||"issued").toLowerCase();}
function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));}
function formatDate(value){
  const date=value?.toDate?.()||(value instanceof Date?value:null);
  if(date)return date.toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"});
  return value?"Date unavailable":"—";
}
function renderCertificates(records){
  $("certificateCount").textContent=`${records.length} Certificate${records.length===1?"":"s"}`;
  if(!records.length){$("certificateList").innerHTML='<p class="empty-state">No certificates have been issued yet.</p>';return;}
  $("certificateList").innerHTML=records.slice(0,30).map(({id,data})=>{
    const recipient=data.studentName||data.recipientName||data.userName||data.email||"Unknown recipient";
    const number=data.certificateNumber||data.number||id;
    const course=data.courseName||data.courseTitle||"Course completion";
    const status=statusOf(data);
    const issued=data.issuedAt||data.createdAt;
    return `<article class="certificate-item">
      <div class="certificate-main"><div><h4>${escapeHtml(recipient)}</h4><p>${escapeHtml(course)} · ${escapeHtml(number)}</p></div>
      <span class="status-pill ${escapeHtml(status)}">${escapeHtml(status)}</span></div>
      <small>Issued: ${formatDate(issued)}</small>
    </article>`;
  }).join("");
}
function renderStats(records){
  const issued=records.filter(({data})=>["issued","verified","completed"].includes(statusOf(data))).length;
  const verified=records.filter(({data})=>statusOf(data)==="verified"||data.verified===true).length;
  const pending=records.filter(({data})=>["pending","processing","requested"].includes(statusOf(data))).length;
  const downloads=records.reduce((total,{data})=>total+Math.max(0,Number(data.downloads||data.downloadCount||0)||0),0);
  $("issuedCertificates").textContent=issued;
  $("verifiedCertificates").textContent=verified;
  $("pendingCertificates").textContent=pending;
  $("certificateDownloads").textContent=downloads;
}
async function startPage(user){
  await verifyFounder(user);
  await loadCertificateSettings();
  stopCertificates=onSnapshot(certificatesRef,snapshot=>{
    const records=snapshot.docs.map(item=>({id:item.id,data:item.data()}));
    records.sort((a,b)=>(b.data.issuedAt?.toMillis?.()||b.data.createdAt?.toMillis?.()||0)-(a.data.issuedAt?.toMillis?.()||a.data.createdAt?.toMillis?.()||0));
    renderStats(records);
    renderCertificates(records);
    setStatus(`Connected · ${records.length} certificate records`);
  },error=>{
    console.error("[Founder Certificates] Listener failed:",error);
    setStatus("Certificate records could not be loaded. Check Founder permissions and Firestore connectivity.",true);
    $("certificateList").innerHTML='<p class="empty-state">Certificate data is temporarily unavailable.</p>';
    window.ssaSecuritySignal?.("access_denied",{portal:"founder",note:"Certificate collection listener denied"});
    showNotice("Live certificate data could not be loaded.","error");
  });
  $("saveCertificateSettings")?.addEventListener("click",async event=>{
    const button=event.currentTarget;
    button.disabled=true;
    try{await saveCertificateSettings();}
    catch(error){console.error("[Founder Certificates] Save failed:",error);showNotice(error.message||"Failed to save settings.","error");}
    finally{button.disabled=false;}
  });
}
onAuthStateChanged(auth,async user=>{
  if(!user){window.ssaSecuritySignal?.("access_denied",{portal:"founder",note:"Unauthenticated access to certificate settings"});location.replace("../login.html");return;}
  try{await startPage(user);}
  catch(error){console.error("[Founder Certificates] Access check failed:",error);setStatus(error.message||"Founder authorization failed.",true);showNotice(error.message||"Founder authorization failed.","error");location.replace("security.html");}
});
window.addEventListener("beforeunload",()=>stopCertificates?.());
