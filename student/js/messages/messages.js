import { auth } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getMyConversations } from "../../js/messaging-service.js";

const conversationList=document.getElementById("conversationList");
const emptyState=document.getElementById("emptyState");
let currentUser=null;
const escapeHtml=value=>String(value??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function showError(){conversationList.innerHTML=`<div class="empty-state"><div class="empty-icon">💬</div><h2>Messages are taking a quick break</h2><p>Please refresh and try again.</p></div>`;emptyState.style.display="none"}
function renderConversation(row){
 const conversation=row.conversations||{};
 const unread=Boolean(conversation.last_message_at && (!row.last_read_at || new Date(conversation.last_message_at)>new Date(row.last_read_at)));
 const button=document.createElement("button");
 button.className=`conversation-item${unread?" unread":""}`;
 button.dataset.id=row.conversation_id;
 button.innerHTML=`<div class="conversation-info"><strong>${escapeHtml(conversation.title||"Conversation")}</strong><small>${conversation.last_message_at?new Date(conversation.last_message_at).toLocaleString():"New conversation"}</small></div>${unread?'<span class="unread-dot" aria-label="Unread message"></span>':''}`;
 button.addEventListener("click",()=>{window.location.href=`chat.html?conversation=${encodeURIComponent(row.conversation_id)}`});
 conversationList.appendChild(button);
}
async function loadChats(){try{const rows=await getMyConversations(currentUser.uid);conversationList.innerHTML="";if(!rows.length){emptyState.style.display="flex";return}emptyState.style.display="none";rows.forEach(renderConversation)}catch(error){console.error("Supabase messages load error:",error);showError()}}
onAuthStateChanged(auth,async user=>{if(!user){window.location.href="../login.html";return}currentUser=user;await loadChats()});
