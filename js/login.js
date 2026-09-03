// ============================================
// SPARK STACK ACADEMY - login.js
// DEBUG BUILD: exposes exact Firebase auth/profile errors
// ============================================
import { auth, db } from "./firebase.js";
import { GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup, browserLocalPersistence, browserSessionPersistence, setPersistence, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const loginForm=document.getElementById("loginForm");
const emailInput=document.getElementById("email");
const passwordInput=document.getElementById("password");
const rememberMe=document.getElementById("rememberMe");
const loginBtn=document.getElementById("loginBtn");
const googleLoginBtn=document.getElementById("googleLogin");
const loader=document.getElementById("authLoader");
const loaderText=document.getElementById("loaderText");
const toastContainer=document.getElementById("toastContainer");
const forgotPasswordBtn=document.getElementById("forgotPassword");
const resetModal=document.getElementById("resetModal");
const resetEmail=document.getElementById("resetEmail");
const sendResetBtn=document.getElementById("sendReset");
const cancelResetBtn=document.getElementById("cancelReset");

const provider=new GoogleAuthProvider();
provider.setCustomParameters({prompt:"select_account"});
const DASHBOARDS={founder:"founder/dashboard.html",admin:"admin/dashboard.html",instructor:"instructor/dashboard.html",student:"student/dashboard.html"};

function showLoader(message="Signing you in..."){loader.classList.add("active");loaderText.textContent=message}
function hideLoader(){loader.classList.remove("active")}
function showToast(message,type="success"){
 const toast=document.createElement("div");toast.className=`toast ${type}`;toast.innerHTML=`<strong>${message}</strong>`;toastContainer.appendChild(toast);
 setTimeout(()=>{toast.style.opacity="0";toast.style.transform="translateX(40px)";setTimeout(()=>toast.remove(),300)},7000);
}
function isValidEmail(email){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)}
function redirectByRole(role){if(DASHBOARDS[role]){window.location.href=DASHBOARDS[role];return}hideLoader();showToast(`DIAGNOSTIC — Account role is: ${role===undefined?"UNDEFINED":JSON.stringify(role)}. Check the Firebase profile details shown above.` ,"error")}
function disableButtons(){loginBtn.disabled=true;googleLoginBtn.disabled=true}
function enableButtons(){loginBtn.disabled=false;googleLoginBtn.disabled=false}

document.querySelectorAll(".toggle-password").forEach(toggle=>toggle.addEventListener("click",()=>{const input=document.getElementById(toggle.dataset.target);if(!input)return;if(input.type==="password"){input.type="text";toggle.classList.remove("fa-eye");toggle.classList.add("fa-eye-slash")}else{input.type="password";toggle.classList.remove("fa-eye-slash");toggle.classList.add("fa-eye")}}));
rememberMe.checked=localStorage.getItem("rememberMe")==="true";
if(localStorage.getItem("savedEmail"))emailInput.value=localStorage.getItem("savedEmail");
rememberMe.addEventListener("change",()=>{localStorage.setItem("rememberMe",rememberMe.checked);if(!rememberMe.checked)localStorage.removeItem("savedEmail")});

forgotPasswordBtn.addEventListener("click",e=>{e.preventDefault();resetEmail.value=emailInput.value;resetModal.classList.add("active");resetEmail.focus()});
cancelResetBtn.addEventListener("click",()=>resetModal.classList.remove("active"));
resetModal.addEventListener("click",e=>{if(e.target===resetModal)resetModal.classList.remove("active")});
sendResetBtn.addEventListener("click",async()=>{const email=resetEmail.value.trim();if(!email)return showToast("Enter your email address.","warning");if(!isValidEmail(email))return showToast("Enter a valid email address.","error");try{showLoader("Sending password reset link...");await sendPasswordResetEmail(auth,email);hideLoader();resetModal.classList.remove("active");showToast("Password reset link sent successfully.","success")}catch(error){hideLoader();console.error("[SSA AUTH DEBUG] PASSWORD RESET FAILED",error);showToast(`Firebase: ${error.code||"unknown-error"}`,"error")}});

loginForm.addEventListener("submit",async e=>{
 e.preventDefault();
 const email=emailInput.value.trim();const password=passwordInput.value;
 if(!email||!password)return showToast("Please enter your email and password.","warning");
 if(!isValidEmail(email))return showToast("Please enter a valid email address.","error");
 try{
  disableButtons();showLoader("Signing you in...");
  await setPersistence(auth,rememberMe.checked?browserLocalPersistence:browserSessionPersistence);
  if(rememberMe.checked)localStorage.setItem("savedEmail",email);else localStorage.removeItem("savedEmail");
  console.log("[SSA AUTH DEBUG] Login attempt",{projectId:auth.app.options.projectId,authDomain:auth.app.options.authDomain,email,passwordLength:password.length});
  const credential=await signInWithEmailAndPassword(auth,email,password);const user=credential.user;
  console.log("[SSA AUTH DEBUG] AUTH SUCCESS",{uid:user.uid,email:user.email,emailVerified:user.emailVerified,providerData:user.providerData});
  const userRef=doc(db,"users",user.uid);const userSnap=await getDoc(userRef);
  if(userSnap.exists()){
   const userData=userSnap.data();
   console.log("[SSA AUTH DEBUG] FIRESTORE PROFILE",userData);
   console.log("[SSA AUTH DEBUG] PROFILE CHECK",{documentPath:`users/${user.uid}`,exists:true,uid:user.uid,email:user.email,profileUid:userData.uid||null,role:Object.prototype.hasOwnProperty.call(userData,"role")?userData.role:"<MISSING FIELD>",active:Object.prototype.hasOwnProperty.call(userData,"active")?userData.active:"<MISSING FIELD>",fullName:userData.fullName||null,projectId:auth.app.options.projectId});
   if(userData.active===false){hideLoader();enableButtons();return showToast("This account has been disabled.","error")}
   await updateDoc(userRef,{lastLogin:serverTimestamp()});
   if(!DASHBOARDS[userData.role]){
     hideLoader();enableButtons();
     showToast(`DIAGNOSTIC: role=${userData.role===undefined?"UNDEFINED":JSON.stringify(userData.role)} | UID=${user.uid} | profile exists=YES | project=${auth.app.options.projectId}`,"error");
     return;
   }
   showToast(`Welcome back, ${userData.fullName||"User"}!`,"success");setTimeout(()=>redirectByRole(userData.role),1200);return;
  }
  const instructorSnap=await getDoc(doc(db,"instructors",user.uid));
  if(instructorSnap.exists()){
   const instructorData=instructorSnap.data();
   if(instructorData.active===false){hideLoader();enableButtons();return showToast("This instructor account has been disabled.","error")}
   await setDoc(userRef,{uid:user.uid,fullName:instructorData.name||user.displayName||"",email:instructorData.email||user.email||"",role:"instructor",active:true,verified:instructorData.verified===true,lastLogin:serverTimestamp(),createdAt:instructorData.createdAt||serverTimestamp()},{merge:true});
   showToast(`Welcome back, ${instructorData.name||"Instructor"}!`,"success");setTimeout(()=>redirectByRole("instructor"),1200);return;
  }
  hideLoader();enableButtons();showToast(`DIAGNOSTIC: users/${user.uid} does NOT exist in Firestore. Project=${auth.app.options.projectId}`,"error");
 }catch(error){
  hideLoader();enableButtons();
  console.error("[SSA AUTH DEBUG] LOGIN FAILED",error);
  console.error("[SSA AUTH DEBUG] code:",error.code);
  console.error("[SSA AUTH DEBUG] message:",error.message);
  console.error("[SSA AUTH DEBUG] email:",email);
  console.error("[SSA AUTH DEBUG] projectId:",auth.app.options.projectId);
  console.error("[SSA AUTH DEBUG] authDomain:",auth.app.options.authDomain);
  showToast(`Firebase: ${error.code||"unknown-error"}`,"error");
 }
});

googleLoginBtn.addEventListener("click",async()=>{
 try{
  disableButtons();showLoader("Signing in with Google...");
  await setPersistence(auth,rememberMe.checked?browserLocalPersistence:browserSessionPersistence);
  const result=await signInWithPopup(auth,provider);const user=result.user;const userRef=doc(db,"users",user.uid);const userSnap=await getDoc(userRef);
  if(!userSnap.exists())await setDoc(userRef,{uid:user.uid,fullName:user.displayName||"",email:user.email||"",role:"student",profilePhoto:user.photoURL||"",bio:"",expertise:"",provider:"google",verified:user.emailVerified,active:true,createdAt:serverTimestamp(),lastLogin:serverTimestamp()});
  else await updateDoc(userRef,{lastLogin:serverTimestamp()});
  const data=(await getDoc(userRef)).data();showToast(`Welcome back, ${data.fullName||"User"}!`,"success");setTimeout(()=>redirectByRole(data.role||"student"),1200);
 }catch(error){hideLoader();enableButtons();console.error("[SSA AUTH DEBUG] GOOGLE LOGIN FAILED",error);showToast(`Firebase: ${error.code||"unknown-error"}`,"error")}
});

const scrollBtn=document.getElementById("scrollTopBtn");
if(scrollBtn){window.addEventListener("scroll",()=>{scrollBtn.classList.toggle("show",window.scrollY>250)});scrollBtn.addEventListener("click",()=>window.scrollTo({top:0,behavior:"smooth"}))}
window.addEventListener("load",()=>{hideLoader();emailInput.focus()});
document.addEventListener("keydown",e=>{if(e.key==="Escape")resetModal.classList.remove("active")});
console.log("%cSpark Stack Academy Login DEBUG Ready 🚀","color:#0B2D5C;font-size:16px;font-weight:bold;");
