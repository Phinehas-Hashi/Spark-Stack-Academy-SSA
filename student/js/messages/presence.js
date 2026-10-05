// =====================================
// SPARK STACK ACADEMY
// PRESENCE SYSTEM
// presence.js
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


console.log("🟢 Presence Loaded");



// =====================================
// STATE
// =====================================

let currentUser = null;

let chatId = null;

let otherUserId = null;



// =====================================
// DOM
// =====================================

const chatStatus =

document.getElementById(
"chatStatus"
);


const onlineDot =

document.getElementById(
"onlineDot"
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

async(user)=>{


if(!user){

return;

}


currentUser = user;


await updateMyPresence();


listenPresence();


}

);



// =====================================
// UPDATE MY STATUS
// =====================================

async function updateMyPresence(){


const userRef =

doc(

db,

"users",

currentUser.uid

);



await setDoc(

userRef,

{

online:true,

lastSeen:

serverTimestamp()

},

{

merge:true

}

);


}



// =====================================
// SET OFFLINE WHEN EXIT
// =====================================

window.addEventListener(

"beforeunload",

()=>{


setDoc(

doc(

db,

"users",

currentUser.uid

),

{

online:false,

lastSeen:

serverTimestamp()

},

{

merge:true

}

);


}

);



// =====================================
// LISTEN OTHER USER STATUS
// =====================================

function listenPresence(){


// temporary:
// gets other user from chat document

onSnapshot(

doc(

db,

"chats",

chatId

),

(chatSnap)=>{


const data =

chatSnap.data();


if(!data)
return;



const otherUser =

data.members?.find(

member =>

member.uid !== currentUser.uid

);



if(!otherUser)
return;



otherUserId =

otherUser.uid;



onSnapshot(

doc(

db,

"users",

otherUserId

),

(userSnap)=>{


const userData =

userSnap.data();



if(!userData)
return;



updateUI(
userData
);



}

);


}

);


}



// =====================================
// UPDATE UI
// =====================================

function updateUI(data){


if(data.online){


if(chatStatus){

chatStatus.textContent =
"Online";

}



if(onlineDot){

onlineDot.classList.add(
"active"
);

}



}

else{


if(chatStatus){

chatStatus.textContent =

formatLastSeen(
data.lastSeen
);

}



if(onlineDot){

onlineDot.classList.remove(
"active"
);

}



}


}



// =====================================
// LAST SEEN FORMAT
// =====================================

function formatLastSeen(timestamp){


if(!timestamp){

return "Offline";

}



const date =

timestamp.toDate();


return (

"Last seen " +

date.toLocaleTimeString(

[],

{

hour:"2-digit",

minute:"2-digit"

}

)

);


}