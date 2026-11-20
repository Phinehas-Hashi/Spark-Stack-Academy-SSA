// =====================================
// SPARK STACK ACADEMY
// ASSIGNMENT DETAILS CONTROLLER
// =====================================

import {

    db,
    auth

} from "../../js/firebase.js";



import {

    doc,
    getDoc,
    setDoc,
    serverTimestamp

} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";



import {

    onAuthStateChanged

} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";





const params =
new URLSearchParams(
window.location.search
);



const assignmentId =
params.get("id");



let assignmentData = null;





onAuthStateChanged(

auth,

async(user)=>{

    if(!user){

        location.href="login.html";

        return;

    }

    await loadAssignment();

    await loadSubmission(user.uid);
    setupAssignmentSubmission(user);

}

);





// ==============================
// LOAD ASSIGNMENT
// ==============================

async function loadAssignment(){

    const ref = doc(

        db,

        "assignments",

        assignmentId

    );



    const snap =
    await getDoc(ref);



    if(!snap.exists()){

        alert("Assignment not found.");

        return;

    }



    assignmentData = snap.data();



    renderAssignment();

}
// ==============================
// RENDER PAGE
// ==============================

function renderAssignment(){

document.getElementById(
"assignmentTitle"
).textContent =
assignmentData.title;



document.getElementById(
"assignmentCourse"
).textContent =
assignmentData.courseName;



document.getElementById(
"assignmentInstructions"
).textContent =
assignmentData.instructions;





const resources =
document.getElementById(
"assignmentResources"
);

resources.innerHTML="";



(assignmentData.resources || []).forEach(item=>{

resources.innerHTML += `

<div class="resource-item">

📄 ${item.name}

</div>

`;

});

}
// ==============================
// LOAD SUBMISSION
// ==============================

async function loadSubmission(uid){

const ref =
doc(

db,

"submissions",

`${assignmentId}_${uid}`

);



const snap =
await getDoc(ref);



if(!snap.exists())
return;



const submission =
snap.data();



document.getElementById(
"submissionNotes"
).value =
submission.notes || "";



document.getElementById(
"gradeBox"
).innerHTML = `

<div class="grade-score">

${submission.grade ?? "--"}

</div>

<p class="feedback">

${submission.feedback || "Waiting for grading."}

</p>

`;

}

// ==============================
// ONLINE-ONLY TEXT SUBMISSION
// File uploads remain disabled in this phase.
// ==============================
function setupAssignmentSubmission(user) {
  const button = document.getElementById("submitAssignmentBtn");
  const notes = document.getElementById("submissionNotes");
  const fileInput = document.getElementById("submissionFile");
  if (!button || !notes) return;

  button.addEventListener("click", async () => {
    if (!window.SSAOnlineActionGuard?.requireOnline("Submitting an assignment")) return;

    if (!assignmentId || !assignmentData) {
      alert("This assignment could not be verified. Refresh and try again.");
      return;
    }

    if (fileInput?.files?.length) {
      alert("File uploads are not enabled in this phase. Remove the selected file and submit your written response only.");
      return;
    }

    const content = notes.value.trim();
    if (!content) {
      alert("Write your assignment response before submitting.");
      notes.focus();
      return;
    }

    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = "Submitting…";

    try {
      await setDoc(doc(db, "submissions", `${assignmentId}_${user.uid}`), {
        assignmentId,
        userId: user.uid,
        studentId: user.uid,
        studentName: user.displayName || user.email?.split("@")[0] || "Student",
        studentEmail: user.email || "",
        content,
        notes: content,
        status: "submitted",
        submittedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });

      const status = document.getElementById("assignmentStatus");
      if (status) {
        status.textContent = "Submitted";
        status.className = "status submitted";
      }
      alert("Assignment submitted successfully.");
    } catch (error) {
      console.error("Assignment submission failed:", error);
      alert(error.message || "The assignment could not be submitted. Check your connection and try again.");
    } finally {
      button.disabled = false;
      button.textContent = originalText || "Submit Assignment";
    }
  });
}
