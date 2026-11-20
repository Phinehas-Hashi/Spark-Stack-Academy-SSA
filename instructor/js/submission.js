import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);
const assignmentId = params.get("assignmentId");
const submissionId = params.get("submissionId");

function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function toast(message,type="info"){if(window.ssaToast)window.ssaToast(message,type);else if(window.showToast)window.showToast(message,type);else console.log(message)}

async function load(user){
  if(!user){ location.href="../login.html"; return; }
  if(!assignmentId||!submissionId){ renderError("The submission link is incomplete."); return; }
  try{
    const [assignmentSnap,submissionSnap]=await Promise.all([
      getDoc(doc(db,"assignments",assignmentId)),
      getDoc(doc(db,"submissions",submissionId))
    ]);
    if(!assignmentSnap.exists()||!submissionSnap.exists()){renderError("This submission could not be found.");return;}
    const assignment={id:assignmentSnap.id,...assignmentSnap.data()};
    const submission={id:submissionSnap.id,...submissionSnap.data()};
    if(assignment.instructorId && assignment.instructorId!==user.uid){renderError("You do not have access to this submission.");return;}
    render(assignment,submission);
  }catch(error){console.error(error);renderError("We couldn't load this submission. Please try again.")}
}

function render(assignment,submission){
  const studentName=submission.studentName||submission.fullName||submission.name||"Student";
  const work=submission.content||submission.answer||submission.text||submission.body||submission.submission||submission.description||"No written response was provided.";
  const max=Number(assignment.maxScore??submission.maxScore??100);
  const score=submission.score??"";
  const feedback=submission.feedback||submission.instructorFeedback||"";
  const graded=["graded","reviewed"].includes(String(submission.status||"").toLowerCase())||submission.score!=null;
  $("#submissionState").innerHTML=`
    <div class="notice">Marks and feedback are saved directly to this submission. Students will see the updated result when they return to their assignment.</div>
    <div class="review-grid">
      <section class="panel">
        <div class="student-row"><div class="avatar">${esc(studentName.charAt(0).toUpperCase())}</div><div><strong>${esc(studentName)}</strong><div class="muted">${esc(submission.studentUsername?"@"+submission.studentUsername:submission.studentEmail||submission.email||"Student")}</div></div></div>
        <h2>${esc(assignment.title||"Assignment")}</h2>
        <div class="muted">${esc(assignment.courseName||"Course")} · ${graded?"Reviewed":"Awaiting review"}</div>
        <div class="work-content">${esc(work)}</div>
      </section>
      <section class="panel">
        <h2>Grade submission</h2>
        <span class="status ${graded?"graded":""}">${graded?"Graded":"Pending review"}</span>
        <div class="score-box" style="margin-top:14px"><label for="score">Mark</label><div class="score-input"><input id="score" type="number" min="0" max="${max}" step="1" value="${esc(score)}"><strong>/ ${max}</strong></div></div>
        <div class="feedback"><label for="feedback">Instructor feedback</label><textarea id="feedback" maxlength="5000" placeholder="Give the student clear, constructive feedback…">${esc(feedback)}</textarea></div>
        <button class="save-btn" id="saveGrade">Save grade & feedback</button>
      </section>
    </div>`;
  $("#saveGrade").addEventListener("click",()=>saveGrade(submission,max));
}

async function saveGrade(submission,max){
  if (!window.SSAOnlineActionGuard?.requireOnline("Saving a grade and feedback")) return;
  const score=Number($("#score").value);
  const feedback=$("#feedback").value.trim();
  if(!Number.isFinite(score)||score<0||score>max){toast(`Enter a mark between 0 and ${max}.`,"warning");return;}
  const button=$("#saveGrade"); button.disabled=true;
  try{
    await updateDoc(doc(db,"submissions",submission.id),{
      score,
      maxScore:max,
      feedback,
      instructorFeedback:feedback,
      status:"graded",
      gradedAt:serverTimestamp(),
      reviewedAt:serverTimestamp()
    });
    toast("Grade and feedback saved successfully.","success");
    button.textContent="Saved ✓";
  }catch(error){console.error(error);toast("We couldn't save the grade. Please try again.","error");button.disabled=false;}
}

function renderError(message){$("#submissionState").innerHTML=`<div class="submission-loading"><h2>Submission unavailable</h2><p>${esc(message)}</p></div>`}
onAuthStateChanged(auth,load);
