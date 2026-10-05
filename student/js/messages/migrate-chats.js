// =====================================
// SPARK STACK ACADEMY
// CHAT MIGRATION
// Add memberIds to old chats
// =====================================

import {

db

} from "../../js/firebase.js";


import {

collection,
getDocs,
updateDoc,
doc

} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


console.log("🔥 Chat Migration Started");


async function migrateChats(){


try{


const chatsSnap = await getDocs(

collection(db,"chats")

);



for(const chatDoc of chatsSnap.docs){


const data = chatDoc.data();



if(data.memberIds){

console.log(
"Already migrated:",
chatDoc.id
);

continue;

}



const memberIds =

data.members?.map(

member => member.uid

) || [];



if(memberIds.length){


await updateDoc(

doc(
db,
"chats",
chatDoc.id
),

{

memberIds

}

);



console.log(
"Updated:",
chatDoc.id
);


}


}



console.log(
"✅ Migration Complete"
);


}

catch(error){

console.error(
"Migration failed:",
error
);

}


}


migrateChats();