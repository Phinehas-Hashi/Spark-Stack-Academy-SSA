// ===================================
// SPARK STACK ACADEMY
// ACADEMY PROFILE
// ===================================

import { db, storage } from "../../js/firebase.js";

import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

console.log("🏫 Academy Profile Loaded");

const profileRef = doc(db, "settings", "academyProfile");
const imageFields = [
    ["academyLogo", "logoPreview", "logo"],
    ["academyBanner", "bannerPreview", "banner"],
    ["academySeal", "sealPreview", "seal"],
    ["academyFavicon", "faviconPreview", "favicon"],
    ["founderPhoto", "founderPreview", "founderPhoto"]
];

async function loadProfile(){
    try{
        const snap = await getDoc(profileRef);
        if(!snap.exists()) return;
        const data = snap.data();

        [
            ["academyName",data.academyName],["academyTagline",data.tagline],["academyDescription",data.description],
            ["founderName",data.founderName],["founderTitle",data.founderTitle],["founderBio",data.founderBio],
            ["academyEmail",data.email],["academyPhone",data.phone],["academyWhatsapp",data.whatsapp],["academyWebsite",data.website],
            ["academyAddress",data.address],["academyCity",data.city],["academyCountry",data.country],
            ["facebook",data.facebook],["instagram",data.instagram],["twitter",data.twitter],["linkedin",data.linkedin],
            ["youtube",data.youtube],["tiktok",data.tiktok],["github",data.github],
            ["language",data.language],["currency",data.currency],["timezone",data.timezone],
            ["studentPrefix",data.studentPrefix],["certificatePrefix",data.certificatePrefix]
        ].forEach(([id,value]) => setValue(id,value));

        imageFields.forEach(([,preview,key]) => setImage(preview,data[key]));
    }catch(error){ console.error("Profile load failed:",error); }
}

function setValue(id,value){ const el=document.getElementById(id); if(el) el.value=value||""; }
function setImage(id,url){ if(!url) return; const img=document.getElementById(id); if(img){ img.src=url; img.classList.add("has-image"); } }
function getValue(id){ const el=document.getElementById(id); return el ? el.value.trim() : ""; }

async function uploadSelectedImages(){
    const uploaded = {};
    for(const [inputId,,field] of imageFields){
        const input=document.getElementById(inputId);
        const file=input?.files?.[0];
        if(!file) continue;
        if(!file.type.startsWith("image/")) throw new Error(`${field} must be an image.`);
        if(file.size > 5*1024*1024) throw new Error(`${field} is larger than 5MB.`);
        const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"-");
        const storageRef=ref(storage,`academy-profile/${field}-${Date.now()}-${safeName}`);
        const snapshot=await uploadBytes(storageRef,file,{contentType:file.type});
        uploaded[field]=await getDownloadURL(snapshot.ref);
    }
    return uploaded;
}

const saveBtn=document.getElementById("saveProfileBtn");
saveBtn?.addEventListener("click",saveProfile);

async function saveProfile(){
    if(saveBtn){ saveBtn.disabled=true; saveBtn.textContent="Saving..."; }
    try{
        const uploaded=await uploadSelectedImages();
        const existing=(await getDoc(profileRef)).data()||{};
        const profile={
            academyName:getValue("academyName"), tagline:getValue("academyTagline"), description:getValue("academyDescription"),
            founderName:getValue("founderName"), founderTitle:getValue("founderTitle"), founderBio:getValue("founderBio"),
            email:getValue("academyEmail"), phone:getValue("academyPhone"), whatsapp:getValue("academyWhatsapp"), website:getValue("academyWebsite"),
            address:getValue("academyAddress"), city:getValue("academyCity"), country:getValue("academyCountry"),
            facebook:getValue("facebook"), instagram:getValue("instagram"), twitter:getValue("twitter"), linkedin:getValue("linkedin"),
            youtube:getValue("youtube"), tiktok:getValue("tiktok"), github:getValue("github"),
            language:getValue("language"), currency:getValue("currency"), timezone:getValue("timezone"),
            studentPrefix:getValue("studentPrefix"), certificatePrefix:getValue("certificatePrefix"),
            ...uploaded,
            updatedAt:serverTimestamp()
        };
        imageFields.forEach(([,preview,field])=>{
            if(!uploaded[field] && existing[field]) profile[field]=existing[field];
            const img=document.getElementById(preview);
            if(uploaded[field] && img) img.src=uploaded[field];
        });
        await setDoc(profileRef,profile,{merge:true});
        alert("✅ Academy profile saved.");
    }catch(error){
        console.error("Profile save failed:",error);
        alert(`❌ ${error.message||"Failed to save profile."}`);
    }finally{
        if(saveBtn){ saveBtn.disabled=false; saveBtn.textContent="Save Profile"; }
    }
}

imageFields.forEach(([inputId,previewId])=>{
    const input=document.getElementById(inputId), preview=document.getElementById(previewId);
    input?.addEventListener("change",()=>{
        const file=input.files?.[0];
        if(!file || !preview) return;
        if(!file.type.startsWith("image/")){ alert("Please select an image file."); input.value=""; return; }
        if(file.size>5*1024*1024){ alert("Image must be 5MB or smaller."); input.value=""; return; }
        preview.src=URL.createObjectURL(file); preview.classList.add("has-image");
    });
});

document.getElementById("resetProfileBtn")?.addEventListener("click",()=>{ if(confirm("Reset all unsaved changes?")) location.reload(); });

async function loadStatistics(){
    try{
        const [students,instructors,courses,certificates]=await Promise.all([
            getDocs(collection(db,"students")),getDocs(collection(db,"instructors")),getDocs(collection(db,"courses")),getDocs(collection(db,"certificates"))
        ]);
        document.getElementById("totalStudents").textContent=students.size.toLocaleString();
        document.getElementById("totalInstructors").textContent=instructors.size.toLocaleString();
        document.getElementById("totalCourses").textContent=courses.size.toLocaleString();
        document.getElementById("totalCertificates").textContent=certificates.size.toLocaleString();
    }catch(error){ console.error("Statistics Error:",error); }
}

window.addEventListener("DOMContentLoaded",()=>{ loadProfile(); loadStatistics(); });