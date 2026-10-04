// 구글 시트(Apps Script 웹 앱)와 주고받는 부분.
// 마지막으로 받은 내용을 브라우저에 저장해 두고, 앱을 열면 그것부터 즉시 보여준 뒤
// 뒤에서 새 내용을 받아와 바꿔 끼운다. (시트 응답이 1~2초 걸려도 화면은 바로 뜬다)
// SCRIPT_URL 이 없으면 같은 동작을 브라우저 안에서 흉내 내는 "미리보기 모드"가 된다.

import { SCRIPT_URL } from "./config.js";

export const preview = !SCRIPT_URL;

// 역할별로 고칠 수 있는 것. apps-script/Code.gs 의 PERMS 와 같게 유지할 것.
export const ROLES = { admin: "관리자", calendar: "일정담당" };
const PERMS = {
  events: ["admin", "calendar"],
  prayers: ["admin"],
  newsletters: ["admin"],
  donors: ["admin"],
  photos: ["admin"],
};
export function can(role, col) {
  return !!role && (PERMS[col] || []).includes(role);
}

const CACHE_KEY = "eduhope-data-v2";
const SESSION_KEY = "eduhope-session";
const DONOR_KEY = "eduhope-donor-key";

function get(k) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function set(k, v) {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {}
}

export function session() {
  try {
    return JSON.parse(get(SESSION_KEY)) || null;
  } catch {
    return null;
  }
}

export function cached() {
  try {
    return JSON.parse(get(CACHE_KEY)) || null;
  } catch {
    return null;
  }
}

export async function fetchLatest() {
  const s = session();
  const data = preview
    ? fake.read(s?.token, get(DONOR_KEY))
    : await (async () => {
        const q = new URLSearchParams({ key: get(DONOR_KEY) || "", token: s?.token || "", t: Date.now() });
        const res = await fetch(`${SCRIPT_URL}?${q}`);
        if (!res.ok) throw new Error(`시트 응답 오류 (${res.status})`);
        return res.json();
      })();
  // 서버에서 계정이 지워졌거나 역할이 바뀌었으면 반영
  if (s && !data.me) set(SESSION_KEY, null);
  else if (s && data.me) set(SESSION_KEY, JSON.stringify({ ...s, ...data.me }));
  set(CACHE_KEY, JSON.stringify(data));
  return data;
}

async function post(req) {
  const s = session();
  const body = { ...req, token: s?.token };
  const out = preview
    ? fake.post(body)
    : await (async () => {
        // text/plain 으로 보내야 브라우저가 사전 확인(CORS preflight) 없이 바로 보낸다.
        const res = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`시트 응답 오류 (${res.status})`);
        return res.json();
      })();
  if (!out.ok) {
    if (out.code === "auth") set(SESSION_KEY, null);
    throw Object.assign(new Error(out.error || "오류가 발생했습니다."), { code: out.code });
  }
  return out;
}

export async function login(id, pw) {
  const out = await post({ action: "login", id, pw });
  set(SESSION_KEY, JSON.stringify({ token: out.token, id: out.id, role: out.role }));
  return out;
}
export async function logout() {
  try {
    await post({ action: "logout" });
  } catch {}
  set(SESSION_KEY, null);
}
export const save = (col, item) => post({ action: "save", col, item });
export const remove = (col, id) => post({ action: "delete", col, id });
export const uploadPhoto = (p) => post({ action: "uploadPhoto", ...p });
export const deletePhoto = (id) => post({ action: "deletePhoto", id });
export const setDonorKey = (key) => set(DONOR_KEY, key || null);

// 드라이브 사진 주소 (사진 폴더가 "링크가 있는 모든 사용자"에게 공개되어 있어야 보인다)
export function photoUrl(id, width) {
  if (String(id).startsWith("data:")) return id; // 미리보기 사진
  return `https://lh3.googleusercontent.com/d/${encodeURIComponent(id)}=w${width}`;
}

// ---------------------------------------------------------------
// 미리보기 모드: Code.gs 와 같은 규칙으로 브라우저 안에서 동작
// ---------------------------------------------------------------
const fake = (() => {
  const KEY = "eduhope-preview-v1";
  const ACCOUNTS = { admin: { pw: "admin", role: "admin" }, calendar: { pw: "calendar", role: "calendar" } };
  let db;
  try {
    db = JSON.parse(get(KEY));
  } catch {}
  if (!db) db = sample();
  const persist = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch {
      throw new Error("미리보기 저장 공간이 가득 찼습니다. (실제 시트 연결 시에는 문제없습니다)");
    }
  };
  const userOf = (token) => (token && token.startsWith("preview-") && ACCOUNTS[token.slice(8)] ? { id: token.slice(8), role: ACCOUNTS[token.slice(8)].role } : null);
  const uid = () => Math.random().toString(36).slice(2, 10);
  const stamp = (by) => ({ updatedBy: by, updatedAt: new Date().toISOString().slice(0, 16).replace("T", " ") });

  return {
    read(token, key) {
      const me = userOf(token);
      const out = JSON.parse(JSON.stringify(db));
      if (!(me?.role === "admin" || key === "1234")) {
        out.donors = [];
        out.donorsLocked = true;
      }
      out.me = me;
      out.updatedAt = new Date().toISOString();
      return out;
    },
    post(req) {
      if (req.action === "login") {
        const a = ACCOUNTS[String(req.id || "").trim().toLowerCase()];
        if (!a || a.pw !== req.pw) return { ok: false, error: "아이디 또는 비밀번호가 맞지 않습니다." };
        const id = String(req.id).trim().toLowerCase();
        return { ok: true, token: "preview-" + id, id, role: a.role };
      }
      if (req.action === "logout") return { ok: true };
      const me = userOf(req.token);
      if (!me) return { ok: false, error: "로그인이 필요합니다.", code: "auth" };
      const col = req.action.endsWith("Photo") ? "photos" : req.col;
      if (!can(me.role, col)) return { ok: false, error: "권한이 없습니다." };
      try {
        if (req.action === "save") {
          const list = db[col];
          const i = list.findIndex((x) => x.id === req.item.id);
          const row = { ...req.item, id: i >= 0 ? req.item.id : uid(), ...stamp(me.id) };
          if (i >= 0) list[i] = row;
          else list.push(row);
        } else if (req.action === "delete") {
          db[col] = db[col].filter((x) => x.id !== req.id);
        } else if (req.action === "uploadPhoto") {
          db.photos.push({ id: req.dataUrl, album: req.album || "", caption: req.caption || "", date: new Date().toISOString().slice(0, 10) });
        } else if (req.action === "deletePhoto") {
          db.photos = db.photos.filter((x) => x.id !== req.id);
        }
        persist();
      } catch (e) {
        db = JSON.parse(get(KEY)) || sample();
        return { ok: false, error: e.message };
      }
      return { ok: true };
    },
  };
})();

function sample() {
  const d = (offset) => {
    const t = new Date();
    t.setDate(t.getDate() + offset);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  };
  const svg = (bg, label) =>
    "data:image/svg+xml;utf8," +
    encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="${bg}"/><text x="200" y="215" font-size="34" text-anchor="middle" fill="#fff" font-family="sans-serif">${label}</text></svg>`);
  return {
    events: [
      { id: "e1", title: "정기 기도회 (예시)", date: d(2), time: "19:30", place: "온라인", memo: "" },
      { id: "e2", title: "지역모임 대표자 회의 (예시)", date: d(9), time: "14:00", place: "(장소)", memo: "" },
      { id: "e3", title: "교사 수련회 (예시)", date: d(20), endDate: d(21), time: "10:00", place: "(장소)", memo: "신청 마감 일주일 전" },
    ],
    prayers: [{ id: "p1", title: "학교를 위한 기도 (예시)", date: d(-3), body: "(예시 기도문입니다.)\n\n주님, 오늘도 교실에서 만나는 아이들을 주님의 눈으로 바라보게 하소서." }],
    newsletters: [{ id: "n1", title: "소식지 예시호", date: d(-10), summary: "실제 소식지 제목과 링크로 바꿔 주세요.", url: "" }],
    donors: [
      { id: "x1", name: "홍길동 (예시)", type: "개인", since: "2024" },
      { id: "x2", name: "○○교회 (예시)", type: "교회", since: "2023" },
    ],
    photos: [
      { id: svg("#8fb174", "수련회 (예시)"), album: "2026 수련회", caption: "", date: d(-5) },
      { id: svg("#e8503a", "지역모임 (예시)"), album: "2026 수련회", caption: "", date: d(-5) },
      { id: svg("#5f8546", "기도회 (예시)"), album: "", caption: "", date: d(-12) },
    ],
  };
}
