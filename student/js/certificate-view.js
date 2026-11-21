// Spark Stack Academy — authenticated certificate viewer.
// Certificate details are fetched from Firestore by document ID.
// URL parameters never supply trusted certificate content.
import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const params = new URLSearchParams(location.search);
const certificateId = params.get("id");
const statusNode = document.getElementById("certificateStatus");
const printButton = document.getElementById("printCertificate");
const closeButton = document.getElementById("closeCertificate");
let verified = false;

function setStatus(kind,message){
  if(!statusNode)return;
  statusNode.className="certificate-status "+kind;
  statusNode.textContent=message;
}
function dateText(value){
  if(!value)return "—";
  const date=typeof value.toDate==="function"?value.toDate():new Date(value);
  return Number.isNaN(date.getTime())?"—":date.toLocaleDateString("en-KE",{day:"numeric",month:"long",year:"numeric"});
}
function render(c){
  const put=(id,value,fallback="—")=>{const el=document.getElementById(id);if(el)el.textContent=value||fallback;};
  put("studentName",c.studentName,"Student");
  put("courseTitle",c.courseTitle,"Course Completion");
  put("certificateNumber",c.certificateNumber||c.id);
  put("admissionNumber",c.admissionNumber);
  put("instructorName",c.instructorName,"Academy Instructor");
  put("headquarters",c.headquarters,"Kenya");
  put("website",c.website,"sparkstackacademy.com");
  put("issuedAt",dateText(c.issuedAt));
  document.title=(c.courseTitle||"Certificate")+" | Spark Stack Academy";
}
function showFailure(message){
  setStatus("invalid",message);
  if(printButton)printButton.disabled=true;
  document.getElementById("certificate").classList.add("certificate-unverified");
  document.getElementById("studentName").textContent="Certificate unavailable";
}
onAuthStateChanged(auth,async user=>{
  if(!user){location.replace("../login.html");return;}
  if(!certificateId){showFailure("No certificate reference was provided. This certificate cannot be verified.");return;}
  try{
    const snap=await getDoc(doc(db,"certificates",certificateId));
    if(!snap.exists()){showFailure("Certificate not found. No matching issued record exists.");return;}
    const certificate={id:snap.id,...snap.data()};
    if(certificate.studentId!==user.uid){showFailure("Access denied. This certificate belongs to another student account.");return;}
    const state=String(certificate.status||"valid").toLowerCase();
    if(!["valid","active","issued"].includes(state)){showFailure("This certificate is marked "+state+" and is not currently valid.");return;}
    if(!certificate.issuedAt){showFailure("The certificate record has no verified issue date.");return;}
    render(certificate);
    verified=true;
    setStatus("valid","Verified certificate · Issued by Spark Stack Academy");
    if(params.get("download")==="true")setTimeout(()=>{if(verified)window.print();},700);
  }catch(error){
    console.error("Certificate verification failed:",error);
    showFailure("Unable to verify this certificate. Check your connection and try again.");
  }
});
printButton?.addEventListener("click",()=>{if(verified)window.print();});
closeButton?.addEventListener("click",()=>{if(history.length>1)history.back();else location.href="certificates.html";});
