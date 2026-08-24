import { auth, db } from "../../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs, addDoc, serverTimestamp, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let currentUser=null, currentProfile=null, users=[];
const $=id=>document.getElementById(id);
const searchInput=$("searchUsers"), userList=$("userList"), noUsers=$("noUsers"), backBtn=$("backBtn");
backBtn?.addEventListener("click",()=>location.href="messages.html");

onAuthStateChanged(auth,async user=>{
 if(!user){location.href="../login.html";return;}
 currentUser=user;
 const profile=await getDoc(doc(db,"users",user.uid));
 currentProfile=profile.exists()?profile.data():{};
 await loadUsers();
});

async function loadUsers(){
 try{
  const snap=await getDocs(collection(db,"users"));
  users=snap.docs.map(d=>({id:d.id,...d.data()})).filter(u=>u.id!==currentUser.uid&&String(u.role||"").toLowerCase()==="instructor");
  renderUsers(users);
 }catch(error){console.error("Loading instructors failed:",error);noUsers&&(noUsers.style.display="flex");}
}
searchInput?.addEventListener("input",()=>{const q=searchInput.value.toLowerCase().trim();renderUsers(users.filter(u=>`${u.name||""} ${u.email||""}`.toLowerCase().includes(q)))});

function renderUsers(list){
 userList.innerHTML="";
 if(!list.length){noUsers.style.display="flex";return;}
 noUsers.style.display="none";
 list.forEach(user=>{
  const card=document.createElement("div");card.className="user-card";card.innerHTML=`<img src="${user.photo||"../assets/images/default-avatar.png"}"><div class="user-info"><h3>${user.name||user.displayName||"Instructor"}</h3><p>${user.email||""}</p></div><span class="user-role">Instructor</span>`;
  card.onclick=async()=>{card.classList.add("loading");await createChat(user)};userList.appendChild(card);
 });
}

async function createChat(user){
 try{
  const snap=await getDocs(collection(db,"chats"));
  let existing=null;
  snap.forEach(d=>{const m=d.data().memberIds||[];if(m.includes(currentUser.uid)&&m.includes(user.id))existing=d.id});
  if(existing){location.href=`chat.html?chatId=${existing}`;return;}
  const chat=await addDoc(collection(db,"chats"),{members:[{uid:currentUser.uid,name:currentProfile.name||currentProfile.displayName||currentUser.email||"Student",role:"student"},{uid:user.id,name:user.name||user.displayName||"Instructor",role:"instructor"}],memberIds:[currentUser.uid,user.id],lastMessage:"",createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  location.href=`chat.html?chatId=${chat.id}`;
 }catch(error){console.error("Chat creation failed:",error);alert("We couldn't start this conversation. Please try again.");}
}
