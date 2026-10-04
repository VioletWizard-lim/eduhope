// 데이터 저장소
// Firebase 설정이 있으면 Firestore + Google 로그인을 쓰고,
// 없으면 브라우저 localStorage 를 쓰는 "데모 모드"로 동작한다.
// 화면 코드(app.js)는 어느 모드인지 몰라도 되도록 같은 함수를 제공한다.

import { firebaseConfig, ID_DOMAIN } from "./firebase-config.js";

export const ROLES = {
  admin: "관리자",
  editor: "편집자",
  calendar: "일정 담당",
  member: "회원",
  guest: "방문자",
};

// 역할별로 할 수 있는 일. Firestore 보안 규칙(firestore.rules)과 반드시 같게 유지할 것.
const PERMISSIONS = {
  "events.write": ["admin", "editor", "calendar"],
  "prayers.write": ["admin", "editor"],
  "photos.write": ["admin", "editor"],
  "newsletters.write": ["admin"],
  "donors.read": ["admin", "member", "editor"],
  "donors.write": ["admin"],
  "roles.manage": ["admin"],
};

export function can(role, action) {
  return (PERMISSIONS[action] || []).includes(role);
}

const SDK = "https://www.gstatic.com/firebasejs/10.12.2";
const COLLECTIONS = ["events", "prayers", "donors", "newsletters", "roles", "photos", "photoFiles"];

let backend = null;
export let mode = "demo";

export async function init() {
  if (firebaseConfig.apiKey) {
    backend = await createFirebaseBackend();
    mode = "firebase";
  } else {
    backend = createDemoBackend();
    mode = "demo";
  }
  return mode;
}

export const onAuth = (cb) => backend.onAuth(cb);
export const signIn = (...a) => backend.signIn(...a);
// 아이디/비밀번호 로그인. "admin" 처럼 @ 없이 쓰면 admin@eduhope.app 으로 바꿔서 로그인한다.
export const signInWithId = (id, password) => backend.signInWithId(idToEmail(id), password);
export const signOut = () => backend.signOut();
export const subscribe = (col, cb, onError) => backend.subscribe(col, cb, onError);
export const add = (col, data) => backend.add(col, data);
export const update = (col, id, data) => backend.update(col, id, data);
export const remove = (col, id) => backend.remove(col, id);
export const setRole = (email, role) => backend.setRole(normEmail(idToEmail(email)), role);
// 사진은 목록용 작은 사진(photos)과 원본(photoFiles)을 따로 저장한다.
// 목록을 열 때 원본까지 다 받지 않도록 하기 위함.
export const addPhoto = (meta, full) => backend.addPhoto(meta, full);
export const getPhotoFull = (id) => backend.getPhotoFull(id);
export const removePhoto = (id) => backend.removePhoto(id);
export const removeRole = (email) => backend.remove("roles", normEmail(email));

export function idToEmail(id) {
  const v = String(id || "").trim().toLowerCase();
  return v && !v.includes("@") ? `${v}@${ID_DOMAIN}` : v;
}

// 로그인 아이디로 보여줄 이름 (admin@eduhope.app → admin)
export function displayId(email) {
  return String(email || "").replace(new RegExp(`@${ID_DOMAIN.replace(/\./g, "\\.")}$`), "");
}

function normEmail(email) {
  return String(email || "").trim().toLowerCase();
}

// ---------------------------------------------------------------
// Firebase (실제 운영)
// ---------------------------------------------------------------
async function createFirebaseBackend() {
  const [{ initializeApp }, authMod, fs] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`),
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = authMod.getAuth(app);
  const db = fs.getFirestore(app);
  let currentEmail = null;

  const stamp = () => ({
    updatedBy: currentEmail,
    updatedAt: fs.serverTimestamp(),
  });

  return {
    onAuth(cb) {
      let unsubRole = null;
      return authMod.onAuthStateChanged(auth, (user) => {
        if (unsubRole) unsubRole();
        unsubRole = null;
        if (!user) {
          currentEmail = null;
          cb({ user: null, role: "guest" });
          return;
        }
        currentEmail = normEmail(user.email);
        const info = { name: user.displayName || user.email, email: currentEmail };
        // 역할 문서가 바뀌면(관리자가 권한을 주면) 새로고침 없이 반영된다.
        unsubRole = fs.onSnapshot(
          fs.doc(db, "roles", currentEmail),
          (snap) => cb({ user: info, role: snap.exists() ? snap.data().role : "guest" }),
          () => cb({ user: info, role: "guest" }),
        );
      });
    },
    signIn() {
      return authMod.signInWithPopup(auth, new authMod.GoogleAuthProvider());
    },
    signInWithId(email, password) {
      return authMod.signInWithEmailAndPassword(auth, email, password);
    },
    signOut() {
      return authMod.signOut(auth);
    },
    async addPhoto(meta, full) {
      const ref = fs.doc(fs.collection(db, "photos"));
      const batch = fs.writeBatch(db);
      batch.set(fs.doc(db, "photoFiles", ref.id), { data: full, ...stamp() });
      batch.set(ref, { ...meta, ...stamp() });
      await batch.commit();
    },
    async getPhotoFull(id) {
      const snap = await fs.getDoc(fs.doc(db, "photoFiles", id));
      return snap.exists() ? snap.data().data : null;
    },
    async removePhoto(id) {
      const batch = fs.writeBatch(db);
      batch.delete(fs.doc(db, "photos", id));
      batch.delete(fs.doc(db, "photoFiles", id));
      await batch.commit();
    },
    subscribe(col, cb, onError) {
      return fs.onSnapshot(
        fs.collection(db, col),
        (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        (err) => onError && onError(err),
      );
    },
    add(col, data) {
      return fs.addDoc(fs.collection(db, col), { ...data, ...stamp() });
    },
    update(col, id, data) {
      return fs.updateDoc(fs.doc(db, col, id), { ...data, ...stamp() });
    },
    remove(col, id) {
      return fs.deleteDoc(fs.doc(db, col, id));
    },
    setRole(email, role) {
      return fs.setDoc(fs.doc(db, "roles", email), { role, ...stamp() });
    },
  };
}

// ---------------------------------------------------------------
// 데모 모드 (설정 없이 바로 체험)
// ---------------------------------------------------------------
const DEMO_KEY = "eduhope-demo-v2";

function createDemoBackend() {
  let state = load();
  const listeners = Object.fromEntries(COLLECTIONS.map((c) => [c, new Set()]));
  const authListeners = new Set();
  let session = state.session || null;

  function load() {
    try {
      const raw = localStorage.getItem(DEMO_KEY);
      if (raw) return { photos: {}, photoFiles: {}, ...JSON.parse(raw) };
    } catch {}
    return seed();
  }
  function save() {
    try {
      localStorage.setItem(DEMO_KEY, JSON.stringify({ ...state, session }));
    } catch {}
  }
  function emit(col) {
    const rows = Object.entries(state[col] || {}).map(([id, v]) => ({ id, ...v }));
    listeners[col].forEach((cb) => cb(rows));
  }
  function emitAuth() {
    const role = session ? state.roles[session.email]?.role || "guest" : "guest";
    authListeners.forEach((cb) => cb({ user: session, role }));
  }
  // 데모에서도 실제와 같은 권한 검사를 흉내 낸다.
  function guard(col, op) {
    const role = session ? state.roles[session.email]?.role || "guest" : "guest";
    const action = col === "roles" ? "roles.manage" : `${col}.${op}`;
    if (!can(role, action)) {
      const err = new Error("permission-denied");
      err.code = "permission-denied";
      throw err;
    }
  }
  const stamp = () => ({ updatedBy: session?.email || null, updatedAt: new Date().toISOString() });

  return {
    onAuth(cb) {
      authListeners.add(cb);
      queueMicrotask(emitAuth);
      return () => authListeners.delete(cb);
    },
    async signIn(email) {
      session = { email: normEmail(email), name: normEmail(email) };
      save();
      emitAuth();
    },
    async signInWithId(email) {
      return this.signIn(email);
    },
    async addPhoto(meta, full) {
      guard("photos", "write");
      const id = Math.random().toString(36).slice(2, 10);
      state.photoFiles[id] = { data: full };
      state.photos[id] = { ...meta, ...stamp() };
      try {
        localStorage.setItem(DEMO_KEY, JSON.stringify({ ...state, session }));
      } catch (e) {
        delete state.photoFiles[id];
        delete state.photos[id];
        throw new Error("데모 모드 저장 공간이 가득 찼습니다. (실제 운영에서는 문제없습니다)");
      }
      emit("photos");
    },
    async getPhotoFull(id) {
      return state.photoFiles[id]?.data || null;
    },
    async removePhoto(id) {
      guard("photos", "write");
      delete state.photos[id];
      delete state.photoFiles[id];
      save();
      emit("photos");
    },
    async signOut() {
      session = null;
      save();
      emitAuth();
    },
    subscribe(col, cb, onError) {
      if (col === "donors") {
        try {
          const role = session ? state.roles[session.email]?.role || "guest" : "guest";
          if (!can(role, "donors.read")) throw Object.assign(new Error("permission-denied"), { code: "permission-denied" });
        } catch (e) {
          queueMicrotask(() => onError && onError(e));
          return () => {};
        }
      }
      listeners[col].add(cb);
      queueMicrotask(() => emit(col));
      return () => listeners[col].delete(cb);
    },
    async add(col, data) {
      guard(col, "write");
      const id = Math.random().toString(36).slice(2, 10);
      state[col][id] = { ...data, ...stamp() };
      save();
      emit(col);
    },
    async update(col, id, data) {
      guard(col, "write");
      state[col][id] = { ...state[col][id], ...data, ...stamp() };
      save();
      emit(col);
    },
    async remove(col, id) {
      guard(col, "write");
      delete state[col][id];
      save();
      emit(col);
      if (col === "roles") emitAuth();
    },
    async setRole(email, role) {
      guard("roles", "write");
      state.roles[email] = { role, ...stamp() };
      save();
      emit("roles");
      emitAuth();
    },
  };
}

function seed() {
  const d = (offset) => {
    const t = new Date();
    t.setDate(t.getDate() + offset);
    return t.toISOString().slice(0, 10);
  };
  const by = { updatedBy: `admin@${ID_DOMAIN}`, updatedAt: new Date().toISOString() };
  return {
    session: null,
    photos: {},
    photoFiles: {},
    roles: {
      [`admin@${ID_DOMAIN}`]: { role: "admin", ...by },
      [`editor@${ID_DOMAIN}`]: { role: "editor", ...by },
      [`calendar@${ID_DOMAIN}`]: { role: "calendar", ...by },
      [`member@${ID_DOMAIN}`]: { role: "member", ...by },
    },
    events: {
      e1: { title: "정기 기도회", date: d(2), time: "19:30", place: "온라인(Zoom)", memo: "매월 첫째 주 기도회", ...by },
      e2: { title: "지역모임 대표자 회의", date: d(9), time: "14:00", place: "(장소 입력)", memo: "", ...by },
      e3: { title: "교사 수련회", date: d(20), endDate: d(21), time: "10:00", place: "(장소 입력)", memo: "신청 마감 일주일 전", ...by },
    },
    prayers: {
      p1: {
        title: "학교를 위한 기도",
        date: d(-3),
        body: "(예시 기도문입니다. 실제 기도문으로 바꿔 주세요.)\n\n주님, 오늘도 교실에서 만나는 아이들을 주님의 눈으로 바라보게 하소서.\n지친 동료 교사들에게 쉼과 위로를 주시고,\n정직하고 정의로운 학교를 세워 가는 일에 저희를 사용하여 주소서.",
        ...by,
      },
    },
    donors: {
      x1: { name: "홍길동 (예시)", type: "개인", since: "2024", ...by },
      x2: { name: "○○교회 (예시)", type: "교회", since: "2023", ...by },
    },
    newsletters: {
      n1: { title: "소식지 예시호", date: d(-10), summary: "실제 소식지 제목과 링크(PDF·구글드라이브 등)로 바꿔 주세요.", url: "", ...by },
    },
  };
}
