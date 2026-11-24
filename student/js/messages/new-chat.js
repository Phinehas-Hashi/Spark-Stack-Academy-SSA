import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, query, where, limit, getDocs, addDoc, serverTimestamp, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
  const snap=await getDocs(query(collection(db,"users"), where("role","==","instructor"), where("status","==","active"), where("active","==",true), where("verified","==",true), limit(50)));
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
  const chats = collection(db,"chats");
  const [memberSnap, participantSnap] = await Promise.all([
    getDocs(query(chats, where("memberIds","array-contains",currentUser.uid), limit(100))),
    getDocs(query(chats, where("participants","array-contains",currentUser.uid), limit(100)))
  ]);
  const existingDocs = new Map();
  [...memberSnap.docs, ...participantSnap.docs].forEach(item => existingDocs.set(item.id, item));
  let existing = null;
  existingDocs.forEach(item => {
    const data = item.data();
    const ids = Array.isArray(data.memberIds) && data.memberIds.length
      ? data.memberIds
      : (Array.isArray(data.participants) ? data.participants : []);
    if (ids.includes(user.id)) existing = item.id;
  });
  if(existing){location.href=`chat.html?chatId=${existing}`;return;}
  const chat=await addDoc(collection(db,"chats"),{members:[{uid:currentUser.uid,name:currentProfile.name||currentProfile.fullName||currentProfile.displayName||currentUser.email||"Student",role:"student"},{uid:user.id,name:user.name||user.displayName||"Instructor",role:"instructor"}],memberIds:[currentUser.uid,user.id],lastMessage:"",createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  location.href=`chat.html?chatId=${chat.id}`;
 }catch(error){console.error("Chat creation failed:",error);alert("We couldn't start this conversation. Please try again.");}
}
