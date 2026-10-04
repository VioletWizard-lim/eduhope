// 앱의 데이터 부분.
//  - 읽기: 공개된 구글 시트를 링크로 읽는다. (편집은 구글 시트에서)
//  - 사진 올리기: 관리자가 로그인하면 Apps Script(apps-script/Code.gs)를 통해 드라이브에 저장한다.
// 마지막으로 받은 내용을 브라우저에 저장해 두고, 앱을 열면 그것부터 즉시 보여준 뒤
// 뒤에서 새 내용을 받아와 바꿔 끼운다. (시트 응답이 1~2초 걸려도 화면은 바로 뜬다)
// SHEET_URL 이 없으면 예시 내용으로 동작하는 "미리보기"가 된다.

import { SHEET_URL, UPLOAD_URL } from "./config.js";

export const preview = !SHEET_URL;
// 관리자 사진 올리기를 쓸 수 있는가 (미리보기에서는 흉내만 낸다)
export const canUpload = preview || !!UPLOAD_URL;

const CACHE_KEY = "eduhope-data-v3";
const SESSION_KEY = "eduhope-admin";
const PREVIEW_KEY = "eduhope-preview-photos";

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

export function cached() {
  try {
    return JSON.parse(get(CACHE_KEY)) || null;
  } catch {
    return null;
  }
}

// 방금 올리거나 지운 사진. 시트 반영이 몇 초 늦어도 화면에서 바로 보이거나 사라지게 한다.
const justAdded = new Map();
const justRemoved = new Set();

export async function fetchLatest() {
  const data = preview ? previewData() : await readSheetLink();
  set(CACHE_KEY, JSON.stringify(data));
  const ids = new Set(data.photos.map((p) => p.id));
  for (const [id, p] of justAdded) if (ids.has(id)) justAdded.delete(id);
  data.photos = data.photos.filter((p) => !justRemoved.has(p.id)).concat([...justAdded.values()]);
  return data;
}

// 드라이브 사진 주소 (사진이 "링크가 있는 모든 사용자"에게 공개되어 있어야 보인다)
// id 자리에는 드라이브 파일 ID 또는 일반 이미지 주소가 올 수 있다.
export function photoUrl(id, width) {
  if (String(id).startsWith("preview-")) return previewPhotos().find((p) => p.id === id)?.src || "";
  if (/^(data:|https?:)/.test(String(id))) return id;
  return `https://lh3.googleusercontent.com/d/${encodeURIComponent(id)}=w${width}`;
}

// ---------------------------------------------------------------
// 관리자 로그인 / 사진 올리기
// ---------------------------------------------------------------
export function session() {
  try {
    return JSON.parse(get(SESSION_KEY)) || null;
  } catch {
    return null;
  }
}

async function post(req) {
  const s = session();
  const body = { ...req, token: s?.token };
  let out;
  if (preview) out = fakePost(body);
  else {
    // text/plain 으로 보내야 브라우저가 사전 확인(CORS preflight) 없이 바로 보낸다.
    const res = await fetch(UPLOAD_URL, { method: "POST", body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`사진 서버 응답 오류 (${res.status})`);
    out = await res.json();
  }
  if (!out.ok) {
    if (out.code === "auth") set(SESSION_KEY, null);
    throw Object.assign(new Error(out.error || "오류가 발생했습니다."), { code: out.code });
  }
  return out;
}

export async function login(id, pw) {
  const out = await post({ action: "login", id, pw });
  set(SESSION_KEY, JSON.stringify({ token: out.token, id: out.id }));
  return out;
}

export async function logout() {
  try {
    await post({ action: "logout" });
  } catch {}
  set(SESSION_KEY, null);
}

export async function uploadPhoto({ dataUrl, album, caption }) {
  const out = await post({ action: "upload", dataUrl, album, caption });
  justAdded.set(out.photo.id, out.photo);
  return out.photo;
}

export async function deletePhoto(id) {
  await post({ action: "delete", id });
  justAdded.delete(id);
  justRemoved.add(id);
}

// 미리보기: 관리자 admin / admin, 올린 사진은 이 브라우저에만 저장
function fakePost(req) {
  if (req.action === "login") {
    return req.id === "admin" && req.pw === "admin"
      ? { ok: true, token: "preview", id: "admin" }
      : { ok: false, error: "아이디 또는 비밀번호가 맞지 않습니다. (미리보기: admin / admin)" };
  }
  if (req.action === "logout") return { ok: true };
  if (req.token !== "preview") return { ok: false, error: "로그인이 필요합니다.", code: "auth" };
  const list = previewPhotos();
  if (req.action === "upload") {
    const id = "preview-" + Math.random().toString(36).slice(2, 10);
    const photo = { id, album: req.album || "", caption: req.caption || "", date: new Date().toISOString().slice(0, 10) };
    try {
      localStorage.setItem(PREVIEW_KEY, JSON.stringify([...list, { ...photo, src: req.dataUrl }]));
    } catch {
      return { ok: false, error: "미리보기 저장 공간이 가득 찼습니다. (실제 연결 시에는 문제없습니다)" };
    }
    return { ok: true, photo };
  }
  if (req.action === "delete") {
    set(PREVIEW_KEY, JSON.stringify(list.filter((p) => p.id !== req.id)));
    return { ok: true };
  }
  return { ok: false, error: "알 수 없는 요청입니다." };
}

function previewPhotos() {
  try {
    return JSON.parse(get(PREVIEW_KEY) || "[]");
  } catch {
    return [];
  }
}

function previewData() {
  const d = sample();
  d.photos = d.photos.concat(previewPhotos().map(({ src, ...p }) => p));
  return d;
}

// ---------------------------------------------------------------
// 시트 링크로 읽기 — 구글 시트의 공개 조회(gviz) 기능을 쓴다.
// ---------------------------------------------------------------
// 시트 탭 이름과 머리글(1행) → 앱에서 쓰는 이름
export const TABS = {
  events: { name: "캘린더", cols: { 제목: "title", 시작일: "date", 날짜: "date", 종료일: "endDate", 시간: "time", 장소: "place", 메모: "memo" } },
  prayers: { name: "기도문", cols: { 제목: "title", 날짜: "date", 내용: "body", 기도문: "body" } },
  newsletters: { name: "소식지", cols: { 제목: "title", 발행일: "date", 날짜: "date", 요약: "summary", 링크: "url" } },
  donors: { name: "후원자", cols: { 이름: "name", 구분: "type", 시작연도: "since" } },
  photos: { name: "사진", cols: { "사진 링크": "link", 링크: "link", 사진: "link", 앨범: "album", 설명: "caption", 날짜: "date" } },
};

export function sheetId(url) {
  const m = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(url || "");
  return m ? m[1] : String(url || "").trim();
}

// 드라이브 공유 링크에서 파일 ID 를 뽑는다. 드라이브 링크가 아니면 주소를 그대로 쓴다.
export function driveId(link) {
  const s = String(link || "").trim();
  const m = /\/file\/d\/([a-zA-Z0-9_-]+)/.exec(s) || /[?&]id=([a-zA-Z0-9_-]+)/.exec(s) || /\/d\/([a-zA-Z0-9_-]{20,})/.exec(s);
  if (m) return m[1];
  return /^https?:\/\//.test(s) ? s : /^[a-zA-Z0-9_-]{20,}$/.test(s) ? s : "";
}

const pad = (n) => String(n).padStart(2, "0");

// gviz 응답의 칸 하나를 글자로 바꾼다. 날짜는 "Date(2026,9,10)" (월은 0부터), 시간은 [19,30,0,0] 으로 온다.
export function cellText(cell) {
  if (!cell || cell.v == null) return cell?.f ? String(cell.f) : "";
  const v = cell.v;
  if (typeof v === "string") {
    const m = /^Date\((\d+),(\d+),(\d+)/.exec(v);
    if (m) return `${m[1]}-${pad(+m[2] + 1)}-${pad(m[3])}`;
    return v.trim();
  }
  if (Array.isArray(v)) return `${pad(v[0])}:${pad(v[1])}`;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "예" : "";
  return String(v);
}

// gviz 응답(자바스크립트 함수 호출로 감싸진 JSON)을 줄 목록으로 바꾼다.
export function parseGviz(text, def) {
  const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  if (json.status === "error") return [];
  let labels = json.table.cols.map((c) => String(c.label || "").trim());
  let rows = json.table.rows.map((r) => (r.c || []).map(cellText));
  // 머리글을 못 알아본 경우 첫 줄을 머리글로 쓴다.
  if (!labels.some((l) => def.cols[l]) && rows.length) {
    labels = rows[0].map((x) => x.trim());
    rows = rows.slice(1);
  }
  const keys = labels.map((l) => def.cols[l.replace(/\s*\(.*\)$/, "")] || def.cols[l] || null);
  return rows
    .map((r, i) => {
      const o = { id: `${def.name}-${i}` };
      keys.forEach((k, j) => {
        if (k && !o[k]) o[k] = (r[j] || "").trim();
      });
      return o;
    })
    .filter((o) => Object.keys(o).length > 1 && Object.entries(o).some(([k, v]) => k !== "id" && v));
}

async function readTab(id, def) {
  const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json&headers=1&sheet=${encodeURIComponent(def.name)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`시트를 읽을 수 없습니다 (${res.status}). 공유가 '링크가 있는 모든 사용자'인지 확인해 주세요.`);
  return parseGviz(await res.text(), def);
}

async function readSheetLink() {
  const id = sheetId(SHEET_URL);
  const entries = await Promise.all(
    Object.entries(TABS).map(async ([k, def]) => {
      try {
        return [k, await readTab(id, def)];
      } catch (e) {
        if (k === "events") throw e; // 캘린더도 못 읽으면 시트 연결 자체가 안 되는 것
        return [k, []];
      }
    }),
  );
  const data = Object.fromEntries(entries);
  data.photos = data.photos
    .map((p) => ({ ...p, id: driveId(p.link) }))
    .filter((p) => p.id);
  data.updatedAt = new Date().toISOString();
  return data;
}

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
