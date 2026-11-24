// =====================================
// SPARK STACK ACADEMY
// CHAT UPLOADS
// uploads.js
// =====================================


import {

auth,
storage

} from "../../js/firebase.js";


import {

onAuthStateChanged

} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


import { ref, uploadBytes } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";


console.log("📎 Uploads Loaded");



// =====================================
// STATE
// =====================================

let currentUser = null;

let chatId = null;

let selectedFile = null;



// =====================================
// DOM
// =====================================

const attachBtn =

document.getElementById(
"attachBtn"
);


const fileInput =

document.getElementById(
"fileInput"
);


const uploadPreview =

document.getElementById(
"uploadPreview"
);


const fileName =

document.getElementById(
"fileName"
);


const removeFileBtn =

document.getElementById(
"removeFileBtn"
);



// =====================================
// CHAT ID
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


}

);



// =====================================
// OPEN FILE PICKER
// =====================================

attachBtn?.addEventListener(

"click",

()=>{


fileInput.click();


}

);



// =====================================
// FILE SELECTED
// =====================================

fileInput?.addEventListener(

"change",

(event)=>{


selectedFile =

event.target.files[0];



if(!selectedFile)
return;



showPreview();


}

);



// =====================================
// PREVIEW
// =====================================

function showPreview(){


uploadPreview.classList.remove("hidden");
uploadPreview.style.display = "flex";


fileName.textContent =

selectedFile.name;


}



// =====================================
// REMOVE FILE
// =====================================

removeFileBtn?.addEventListener(

"click",

()=>{


selectedFile = null;


fileInput.value = "";


uploadPreview.classList.add("hidden");
uploadPreview.style.display = "none";


}

);



// =====================================
// UPLOAD FILE
// =====================================

export async function uploadFile(){


if(
!selectedFile ||
!auth.currentUser ||
!chatId
){

return null;

}


try{


const fileRef = ref(

storage,

`chatFiles/${chatId}/${Date.now()}_${selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`

);



await uploadBytes(

fileRef,

selectedFile

);



const fileData = {

path: fileRef.fullPath,

name: selectedFile.name,

type: selectedFile.type,

size: selectedFile.size

};



selectedFile = null;

fileInput.value = "";

uploadPreview.classList.add("hidden");
uploadPreview.style.display = "none";


return fileData;


}

catch(error){

console.error(
"Upload failed:",
error
);

return null;

}

}