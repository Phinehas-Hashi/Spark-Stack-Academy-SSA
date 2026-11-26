import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc
} from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";

const projectId = "demo-spark-stack-academy-tenant-tests";
const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
const storageRules = await readFile(new URL("../storage.rules", import.meta.url), "utf8");
let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules },
    storage: { rules: storageRules }
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

after(async () => {
  await testEnv.cleanup();
});

async function seed(callback) {
  await testEnv.withSecurityRulesDisabled(async context => {
    await callback(context.firestore());
  });
}

function institutionMember(uid, institutionId, role = "institution_owner") {
  return {
    uid,
    institutionId,
    memberType: role,
    role,
    status: "active",
    verified: true,
    createdAt: new Date()
  };
}

test("a student can create only the permitted pending student profile", async () => {
  const db = testEnv.authenticatedContext("student-1").firestore();
  await assertSucceeds(setDoc(doc(db, "users/student-1"), {
    uid: "student-1",
    fullName: "Test Student",
    email: "student@example.test",
    role: "student",
    bio: "",
    expertise: "",
    profilePhoto: "",
    active: true,
    verified: false,
    status: "pending_admission",
    provider: "email",
    createdAt: serverTimestamp(),
    lastLogin: serverTimestamp()
  }));
});

test("a client cannot self-assign an institution through profile creation", async () => {
  const db = testEnv.authenticatedContext("student-2").firestore();
  await assertFails(setDoc(doc(db, "users/student-2"), {
    uid: "student-2",
    fullName: "Malicious Student",
    email: "student2@example.test",
    role: "student",
    active: true,
    verified: false,
    status: "pending_admission",
    createdAt: serverTimestamp(),
    institutionId: "institution-victim",
    institutionRole: "owner"
  }));
});

test("an institution member can read only their own tenant and its courses", async () => {
  await seed(async db => {
    await setDoc(doc(db, "institutions/college-a"), {
      institutionId: "college-a", ownerUid: "owner-a", status: "active"
    });
    await setDoc(doc(db, "institutions/college-b"), {
      institutionId: "college-b", ownerUid: "owner-b", status: "active"
    });
    await setDoc(doc(db, "institutions/college-a/members/owner-a"), institutionMember("owner-a", "college-a"));
    await setDoc(doc(db, "institutions/college-b/members/owner-b"), institutionMember("owner-b", "college-b"));
    await setDoc(doc(db, "courses/course-a"), {
      title: "A course", institutionId: "college-a", published: false, status: "draft"
    });
    await setDoc(doc(db, "courses/course-b"), {
      title: "B course", institutionId: "college-b", published: false, status: "draft"
    });
    await setDoc(doc(db, "courses/course-a/courseModules/module-a"), {
      courseId: "course-a", title: "Module A"
    });
    await setDoc(doc(db, "courses/course-b/courseModules/module-b"), {
      courseId: "course-b", title: "Module B"
    });
    await setDoc(doc(db, "courses/course-a/courseLessons/lesson-a"), {
      courseId: "course-a", moduleId: "module-a", title: "Lesson A", isPreview: false
    });
    await setDoc(doc(db, "courses/course-b/courseLessons/lesson-b"), {
      courseId: "course-b", moduleId: "module-b", title: "Lesson B", isPreview: false
    });
    await setDoc(doc(db, "assignments/assignment-a"), {
      courseId: "course-a", instructorId: "instructor-a", status: "published"
    });
    await setDoc(doc(db, "assignments/assignment-b"), {
      courseId: "course-b", instructorId: "instructor-b", status: "published"
    });
  });

  const dbA = testEnv.authenticatedContext("owner-a").firestore();
  await assertSucceeds(getDoc(doc(dbA, "institutions/college-a")));
  await assertSucceeds(getDoc(doc(dbA, "institutions/college-a/members/owner-a")));
  await assertSucceeds(getDoc(doc(dbA, "courses/course-a")));
  await assertSucceeds(getDoc(doc(dbA, "courses/course-a/courseModules/module-a")));
  await assertSucceeds(getDoc(doc(dbA, "courses/course-a/courseLessons/lesson-a")));
  await assertSucceeds(getDoc(doc(dbA, "assignments/assignment-a")));
  await assertFails(getDoc(doc(dbA, "institutions/college-b")));
  await assertFails(getDoc(doc(dbA, "courses/course-b")));
  await assertFails(getDoc(doc(dbA, "courses/course-b/courseModules/module-b")));
  await assertFails(getDoc(doc(dbA, "courses/course-b/courseLessons/lesson-b")));
  await assertFails(getDoc(doc(dbA, "assignments/assignment-b")));
});

test("a provisional applicant can read only their own restricted workspace", async () => {
  await seed(async db => {
    await setDoc(doc(db, "institutions/applicant-1"), {
      institutionId: "applicant-1",
      ownerUid: "applicant-1",
      status: "provisional",
      workspaceStage: "provisional"
    });
    await setDoc(doc(db, "institutions/applicant-1/members/applicant-1"), {
      uid: "applicant-1",
      institutionId: "applicant-1",
      memberType: "institution_owner",
      role: "institution_owner",
      status: "pending_verification",
      verified: false
    });
    await setDoc(doc(db, "institutions/applicant-2"), {
      institutionId: "applicant-2",
      ownerUid: "applicant-2",
      status: "provisional"
    });
    await setDoc(doc(db, "institutions/applicant-2/members/applicant-2"), {
      uid: "applicant-2",
      institutionId: "applicant-2",
      memberType: "institution_owner",
      role: "institution_owner",
      status: "pending_verification",
      verified: false
    });
  });

  const dbA = testEnv.authenticatedContext("applicant-1").firestore();
  await assertSucceeds(getDoc(doc(dbA, "institutions/applicant-1")));
  await assertSucceeds(getDoc(doc(dbA, "institutions/applicant-1/members/applicant-1")));
  await assertFails(getDoc(doc(dbA, "institutions/applicant-2")));
});

test("clients cannot create or modify institution membership records", async () => {
  const db = testEnv.authenticatedContext("student-3").firestore();
  await assertFails(setDoc(doc(db, "institutions/college-x/members/student-3"), {
    uid: "student-3",
    institutionId: "college-x",
    memberType: "institution_owner",
    role: "institution_owner",
    status: "active",
    verified: true
  }));
});

test("institution applications must be created by the trusted callable", async () => {
  const db = testEnv.authenticatedContext("applicant-3").firestore();
  await assertFails(setDoc(doc(db, "institutionApplications/applicant-3"), {
    institutionOwnerUid: "applicant-3",
    institutionName: "Test College",
    institutionType: "College",
    country: "Kenya",
    institutionPhone: "254700000000",
    ownerName: "Test Owner",
    ownerEmail: "owner@example.test",
    ownerPosition: "Director",
    learnerRange: "1–50",
    status: "pending_review",
    submittedAt: serverTimestamp(),
    source: "institution_registration"
  }));
});

test("an institution owner can list only their own institution members", async () => {
  await seed(async db => {
    await setDoc(doc(db, "institutions/college-a"), { institutionId: "college-a", status: "active" });
    await setDoc(doc(db, "institutions/college-a/members/owner-a"), institutionMember("owner-a", "college-a"));
    await setDoc(doc(db, "institutions/college-a/members/student-a"), {
      uid: "student-a", institutionId: "college-a", memberType: "student",
      role: "student", status: "active", verified: true
    });
  });
  const db = testEnv.authenticatedContext("owner-a").firestore();
  const result = await assertSucceeds(getDocs(collection(db, "institutions/college-a/members")));
  assert.equal(result.size, 2);
});


test("institution shared files are writable only by managers in that tenant", async () => {
  await seed(async db => {
    await setDoc(doc(db, "institutions/college-a"), { institutionId: "college-a", status: "active" });
    await setDoc(doc(db, "institutions/college-a/members/owner-a"), institutionMember("owner-a", "college-a"));
    await setDoc(doc(db, "institutions/college-b"), { institutionId: "college-b", status: "active" });
    await setDoc(doc(db, "institutions/college-b/members/owner-b"), institutionMember("owner-b", "college-b"));
  });

  const file = new Blob(["test course handout"], { type: "application/pdf" });
  const ownerAStorage = testEnv.authenticatedContext("owner-a").storage();
  const ownerBStorage = testEnv.authenticatedContext("owner-b").storage();

  await assertSucceeds(uploadBytes(ref(ownerAStorage, "institution-files/college-a/shared/handout.pdf"), file));
  await assertFails(uploadBytes(ref(ownerAStorage, "institution-files/college-b/shared/handout.pdf"), file));
  await assertSucceeds(uploadBytes(ref(ownerBStorage, "institution-files/college-b/shared/handout.pdf"), file));
});
