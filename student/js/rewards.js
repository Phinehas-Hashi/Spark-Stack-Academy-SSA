import {db} from "../../../js/firebase.js";
import {doc,getDoc,setDoc,arrayUnion,serverTimestamp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {showAchievement} from "./achievement-popup.js";
import {showLevelUp} from "./level-popup.js";

const XP_PER_LEVEL=250;
export function getLevelFromXP(xp=0){return Math.floor(Math.max(0,Number(xp)||0)/XP_PER_LEVEL)+1;}
export function getLevelProgress(xp=0){const n=Math.max(0,Number(xp)||0);return ((n%XP_PER_LEVEL)/XP_PER_LEVEL)*100;}

export async function giveReward(userId,amount,reason){
 try{
  const ref=doc(db,"users",userId);const snap=await getDoc(ref);if(!snap.exists())throw Error("Student profile not found.");
  const data=snap.data(),gain=Math.max(0,Number(amount)||0),oldXP=Number(data.xp||0),newXP=oldXP+gain,oldLevel=getLevelFromXP(oldXP),newLevel=getLevelFromXP(newXP);
  const updates={xp:newXP,level:newLevel,lastReward:{reason,amount:gain,time:serverTimestamp()}};
  const badges=data.badges||[];
  if(reason==="course_complete"&&!badges.includes("first_course"))updates.badges=arrayUnion("first_course");
  if(reason==="project_submit"&&!badges.includes("coder"))updates.badges=arrayUnion("coder");
  if((data.streak||0)>=7&&!badges.includes("streak"))updates.badges=arrayUnion("streak");
  await setDoc(ref,updates,{merge:true});
  if(newLevel>oldLevel){let rank="Builder";if(newLevel>=10)rank="Elite Architect";else if(newLevel>=5)rank="Innovator";showLevelUp(newLevel,rank)}
  if(reason==="course_complete"&&!badges.includes("first_course"))showAchievement("First Steps","🌱",gain);
  if(reason==="project_submit"&&!badges.includes("coder"))showAchievement("Code Builder","💻",gain);
  if((data.streak||0)>=7&&!badges.includes("streak"))showAchievement("Consistency Flame","🔥",gain);
  return {xp:newXP,level:newLevel,progress:getLevelProgress(newXP)};
 }catch(error){console.error("Reward failed:",error);throw error;}
}
