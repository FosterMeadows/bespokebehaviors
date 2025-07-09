// src/StudentService.jsx
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "./firebaseConfig";

const studentsCol = collection(db, "students");

export async function createStudent(name) {
  return addDoc(studentsCol, { name, hasServedReteach: false, created: Date.now() });
}

export async function fetchStudents() {
  const q = query(studentsCol, orderBy("created", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
