// =====================================
// SPARK STACK ACADEMY
// TYPING INDICATOR
// typing.js
// =====================================


import {

auth,
db

} from "../../js/firebase.js";


import {

onAuthStateChanged

} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


import {

doc,
setDoc,
onSnapshot,
serverTimestamp

} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


console.log("✍️ Typing Loaded");



// =====================================
// STATE
// =====================================

let currentUser = null;

let chatId = null;

let typingTimer = null;



// =====================================
// DOM
// =====================================

const messageInput =

document.getElementById(
"messageInput"
);


const typingIndicator =

document.getElementById(
"typingIndicator"
);



// =====================================
// GET CHAT ID
// =====================================

const params =

new URLSearchParams(
window.location.search
);


chatId =

params.get("chatId");



// =====================================
// AUTH
// =====================================

onAuthStateChanged(

auth,

(user)=>{


if(!user)
return;


currentUser = user;


startTypingListener();


}

);



// =====================================
// DETECT TYPING
// =====================================

messageInput?.addEventListener(

"input",

()=>{


setTyping(true);



clearTimeout(
typingTimer
);



typingTimer = setTimeout(

()=>{

setTyping(false);

},

1000

);


}

);



// =====================================
// UPDATE TYPING STATE
// =====================================

async function setTyping(status){


if(!currentUser || !chatId){

return;

}



await setDoc(

doc(

db,

"chats",

chatId

),

{

typing:{

uid:

currentUser.uid,


status,


updatedAt:

serverTimestamp()

}

},

{

merge:true

}

);


}



// =====================================
// LISTEN OTHER USER TYPING
// =====================================

function startTypingListener(){


onSnapshot(

doc(

db,

"chats",

chatId

),

(snapshot)=>{


const data =

snapshot.data();



if(!data?.typing){

hideTyping();

return;

}



if(

data.typing.uid !== currentUser.uid &&

data.typing.status

){


showTyping();


}

else{


hideTyping();


}



}

);


}



// =====================================
// UI
// =====================================

function showTyping(){


if(!typingIndicator)
return;


typingIndicator.style.display =
"flex";


}



function hideTyping(){


if(!typingIndicator)
return;


typingIndicator.style.display =
"none";


}