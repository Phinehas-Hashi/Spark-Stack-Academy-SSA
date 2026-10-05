// =====================================
// SPARK STACK ACADEMY
// CHAT CREATION SERVICE
// =====================================


import {

db,
auth

} from "../../js/firebase.js";


import {

collection,
getDocs,
addDoc,
serverTimestamp

}




export async function createChat(otherUser){



const currentUser = auth.currentUser;



if(!currentUser){

console.log("No user logged in");

return;

}




const chatsRef = collection(
db,
"chats"
);



// Check existing chat safely

const snapshot = await getDocs(chatsRef);



let existingChat = null;



snapshot.forEach(doc=>{


const data = doc.data();



if(
    Array.isArray(data.participants) &&
    data.participants.includes(otherUser.uid)
){

    existingChat = {

        id: doc.id,

        ...data

    };

}


});





if(existingChat){

return existingChat;

}




// Create new chat


const newChat = await addDoc(

chatsRef,

{


participants:[

currentUser.uid,

otherUser.uid

],



members:[

{

uid:currentUser.uid,

name:
currentUser.displayName || "Student"

},


{

uid:otherUser.uid,

name:
otherUser.name || "User",

photo:
otherUser.photo || ""

}

],



lastMessage:"",


updatedAt:

serverTimestamp(),


createdAt:

serverTimestamp()


}

);



return {

id:newChat.id

};


}