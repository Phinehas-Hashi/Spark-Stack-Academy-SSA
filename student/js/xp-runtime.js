import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const LEVEL_XP = 100;
const $ = id => document.getElementById(id);

function levelData(xp){
  const safe=Math.max(0,Number(xp)||0);
  const level=Math.floor(safe/LEVEL_XP)+1;
  const current=(level-1)*LEVEL_XP;
  const next=level*LEVEL_XP;
  const progress=Math.min(100,Math.round(((safe-current)/(next-current))*100));
  return {level,next,progress};
}

function render(xp){
  const data=levelData(xp);
  if($("studentLevel")) $("studentLevel").textContent=data.level;
  if($("studentXP")) $("studentXP").textContent=Math.round(Number(xp)||0).toLocaleString();
  if($("nextXP")) $("nextXP").textContent=data.next.toLocaleString();
  if($("xpProgress")) $("xpProgress").style.width=`${data.progress}%`;
  if($("studentRank")) $("studentRank").textContent=`Level ${data.level}`;
  if($("statXP")) $("statXP").textContent=Math.round(Number(xp)||0).toLocaleString();
}

async function boot(user){
  if(!user||!location.pathname.includes("student/dashboard")) return;
  try{
    const snap=await getDoc(doc(db,"students",user.uid));
    render(snap.exists()?snap.data().xp||0:0);
  }catch(error){console.warn("XP runtime unavailable:",error.message);}
}

onAuthStateChanged(auth,boot);
