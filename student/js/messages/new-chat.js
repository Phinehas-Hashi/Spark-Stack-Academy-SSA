import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let currentUser = null;
let currentProfile = {};
let users = [];

const $ = id => document.getElementById(id);
const searchInput = $("searchUsers");
const userList = $("userList");
const noUsers = $("noUsers");
const backBtn = $("backBtn");

backBtn?.addEventListener("click", () => {
  window.location.href = "messages.html";
});

onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.replace("../login.html");
    return;
  }

  currentUser = user;
  try {
    const profileSnapshot = await getDoc(doc(db, "users", user.uid));
    currentProfile = profileSnapshot.exists() ? profileSnapshot.data() : {};
    await loadUsers();
  } catch (error) {
    console.error("New chat setup failed:", error);
    showEmpty("Contacts are temporarily unavailable", "Please refresh and try again.");
  }
});

async function loadUsers() {
  try {
    const snapshot = await getDocs(query(
      collection(db, "users"),
      where("role", "==", "instructor"),
      where("status", "==", "active"),
      where("active", "==", true),
      where("verified", "==", true),
      limit(50)
    ));

    users = snapshot.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .filter(person => person.id !== currentUser.uid);

    userList.setAttribute("aria-busy", "false");
    renderUsers(users);
  } catch (error) {
    console.error("Loading instructors failed:", error);
    userList.setAttribute("aria-busy", "false");
    showEmpty("Contacts are temporarily unavailable", "We couldn't load the instructor directory.");
  }
}

function showEmpty(title, description) {
  noUsers.style.display = "flex";
  const heading = noUsers.querySelector("h2");
  const paragraph = noUsers.querySelector("p");
  if (heading) heading.textContent = title;
  if (paragraph) paragraph.textContent = description;
}

searchInput?.addEventListener("input", () => {
  const term = searchInput.value.trim().toLowerCase();
  renderUsers(users.filter(person =>
    `${person.name || person.fullName || person.displayName || ""} ${person.email || ""}`
      .toLowerCase()
      .includes(term)
  ));
});

function renderUsers(list) {
  userList.replaceChildren();

  if (!list.length) {
    showEmpty(
      users.length ? "No instructors match your search" : "No instructors available",
      users.length ? "Try another name or email address." : "There are no active instructors to contact right now."
    );
    return;
  }

  noUsers.style.display = "none";

  list.forEach(person => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "user-card";
    card.setAttribute("aria-label", `Start a conversation with ${person.name || person.fullName || person.displayName || "instructor"}`);

    const avatar = document.createElement("img");
    const photo = person.photoURL || person.photo;
    avatar.src = typeof photo === "string" && /^https:\/\//i.test(photo)
      ? photo
      : "../assets/images/default-avatar.png";
    avatar.alt = "";
    avatar.loading = "lazy";

    const info = document.createElement("span");
    info.className = "user-info";

    const name = document.createElement("strong");
    name.textContent = person.name || person.fullName || person.displayName || "Instructor";

    const email = document.createElement("span");
    email.textContent = person.email || "Academy instructor";

    info.append(name, email);

    const role = document.createElement("span");
    role.className = "user-role";
    role.textContent = "Instructor";

    card.append(avatar, info, role);
    card.addEventListener("click", () => createChat(person, card));
    userList.append(card);
  });
}

async function createChat(person, card) {
  if (!currentUser || card.disabled) return;
  card.disabled = true;
  card.classList.add("loading");

  try {
    const chats = collection(db, "chats");
    const [memberSnapshot, participantSnapshot] = await Promise.all([
      getDocs(query(chats, where("memberIds", "array-contains", currentUser.uid), limit(100))),
      getDocs(query(chats, where("participants", "array-contains", currentUser.uid), limit(100)))
    ]);

    const existingDocs = new Map();
    [...memberSnapshot.docs, ...participantSnapshot.docs]
      .forEach(item => existingDocs.set(item.id, item));

    let existingId = null;
    existingDocs.forEach(item => {
      const data = item.data();
      const ids = Array.isArray(data.memberIds) && data.memberIds.length
        ? data.memberIds
        : (Array.isArray(data.participants) ? data.participants : []);
      if (ids.includes(person.id)) existingId = item.id;
    });

    if (existingId) {
      window.location.href = `chat.html?chatId=${encodeURIComponent(existingId)}`;
      return;
    }

    const chat = await addDoc(chats, {
      members: [
        {
          uid: currentUser.uid,
          name: currentProfile.name || currentProfile.fullName || currentProfile.displayName || currentUser.displayName || currentUser.email || "Student",
          role: "student"
        },
        {
          uid: person.id,
          name: person.name || person.fullName || person.displayName || "Instructor",
          photo: person.photoURL || person.photo || "",
          role: "instructor"
        }
      ],
      memberIds: [currentUser.uid, person.id],
      lastMessage: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    window.location.href = `chat.html?chatId=${encodeURIComponent(chat.id)}`;
  } catch (error) {
    console.error("Chat creation failed:", error);
    window.SSA?.toast?.("We couldn't start this conversation. Please try again.", "error");
    card.disabled = false;
    card.classList.remove("loading");
  }
}
