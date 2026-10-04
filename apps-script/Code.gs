/**
 * 기윤실교사모임 앱 — 구글 시트 연동 스크립트
 *
 * 앱은 이 스크립트를 통해 구글 시트를 읽고 씁니다.
 *  - 누구나: 캘린더 / 기도문 / 소식지 / 사진 보기
 *  - 아이디·비밀번호 로그인("계정" 탭):
 *      관리자   → 모든 메뉴 편집, 사진 올리기, 후원자 명단 보기
 *      일정담당 → 캘린더만 편집
 *  - 시트에서 직접 고쳐도 앱에 그대로 반영됩니다.
 *
 * 처음 한 번 (README 에 그림 순서대로 있음):
 *   1) 구글 시트 메뉴 [확장 프로그램 → Apps Script] 에 이 파일 내용을 붙여넣고 저장
 *   2) 위쪽 함수 목록에서 setup 선택 → [실행] → 권한 허용
 *   3) [배포 → 새 배포 → 유형: 웹 앱] 실행 계정 "나", 액세스 "모든 사용자" → 배포
 *   4) 웹 앱 URL 을 앱의 js/config.js 에 붙여넣기
 * 스크립트를 고친 뒤에는 [배포 → 배포 관리 → 수정(연필) → 버전: 새 버전] 으로 다시 배포해야 반영됩니다.
 */

const SHEETS = {
  events: {
    name: "캘린더",
    cols: [["title", "제목"], ["date", "시작일"], ["endDate", "종료일"], ["time", "시간"], ["place", "장소"], ["memo", "메모"]],
  },
  prayers: { name: "기도문", cols: [["title", "제목"], ["date", "날짜"], ["body", "내용"]] },
  newsletters: { name: "소식지", cols: [["title", "제목"], ["date", "발행일"], ["summary", "요약"], ["url", "링크"]] },
  donors: { name: "후원자", cols: [["name", "이름"], ["type", "구분"], ["since", "시작연도"]] },
};
// 모든 탭의 맨 뒤 세 칸은 앱이 자동으로 채운다.
const META = ["ID", "수정자", "수정시각"];
const ACCOUNTS = "계정";
const SETTINGS = "설정";

// 역할별로 고칠 수 있는 것. (앱 화면의 버튼 표시는 js/app.js 의 PERMS 와 같게)
const ROLE_NAMES = { 관리자: "admin", 일정담당: "calendar", "일정 담당": "calendar" };
const PERMS = {
  events: ["admin", "calendar"],
  prayers: ["admin"],
  newsletters: ["admin"],
  donors: ["admin"],
  photos: ["admin"],
};
const SESSION_DAYS = 30;
const CACHE_SECONDS = 60;

// ---------------------------------------------------------------
// 읽기 (GET)
// ---------------------------------------------------------------
function doGet(e) {
  const p = (e && e.parameter) || {};
  const settings = readSettings_();
  const cache = CacheService.getScriptCache();
  let data = null;
  const cached = cache.get("data");
  if (cached) data = JSON.parse(cached);
  if (!data) {
    data = { updatedAt: new Date().toISOString() };
    for (const k of Object.keys(SHEETS)) {
      try {
        data[k] = readSheet_(k);
      } catch (err) {
        data[k] = [];
      }
    }
    data.photos = readPhotos_(settings["사진 폴더 ID"]);
    try {
      cache.put("data", JSON.stringify(data), CACHE_SECONDS);
    } catch (err) {
      // 캐시 한도(100KB)를 넘으면 캐시 없이 동작
    }
  }
  // 후원자 명단은 관리자이거나, 설정 탭의 비밀번호를 아는 경우에만 보낸다.
  const out = Object.assign({}, data);
  const user = sessionUser_(p.token);
  const pass = String(settings["후원자 명단 비밀번호"] || "");
  const canSeeDonors = (user && user.role === "admin") || !pass || String(p.key || "") === pass;
  if (!canSeeDonors) {
    out.donors = [];
    out.donorsLocked = true;
  }
  out.me = user ? { id: user.id, role: user.role } : null;
  return json_(out);
}

// ---------------------------------------------------------------
// 쓰기 (POST) — 앱은 text/plain 으로 JSON 을 보낸다.
// ---------------------------------------------------------------
function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: "잘못된 요청입니다." });
  }
  try {
    switch (req.action) {
      case "login":
        return json_(login_(req.id, req.pw));
      case "logout":
        if (req.token) PropertiesService.getScriptProperties().deleteProperty("tok_" + req.token);
        return json_({ ok: true });
    }
    const user = sessionUser_(req.token);
    if (!user) return json_({ ok: false, error: "로그인이 필요합니다.", code: "auth" });
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      let result;
      switch (req.action) {
        case "save":
          allow_(user, req.col);
          result = saveRow_(req.col, req.item || {}, user.id);
          break;
        case "delete":
          allow_(user, req.col);
          result = deleteRow_(req.col, req.id);
          break;
        case "uploadPhoto":
          allow_(user, "photos");
          result = uploadPhoto_(req, user.id);
          break;
        case "deletePhoto":
          allow_(user, "photos");
          result = deletePhoto_(req.id);
          break;
        default:
          return json_({ ok: false, error: "알 수 없는 요청입니다." });
      }
      clearCache();
      return json_(Object.assign({ ok: true }, result));
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function allow_(user, col) {
  if (!PERMS[col] || PERMS[col].indexOf(user.role) < 0) throw new Error("권한이 없습니다.");
}

// ---------------------------------------------------------------
// 로그인
// ---------------------------------------------------------------
function readAccounts_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(ACCOUNTS);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh
    .getRange(2, 1, sh.getLastRow() - 1, 3)
    .getValues()
    .map((r) => ({ id: String(r[0]).trim().toLowerCase(), pw: String(r[1]), role: ROLE_NAMES[String(r[2]).trim()] }))
    .filter((a) => a.id && a.pw && a.role);
}

function login_(id, pw) {
  id = String(id || "").trim().toLowerCase();
  const cache = CacheService.getScriptCache();
  const failKey = "fail_" + id;
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= 10) return { ok: false, error: "로그인 실패가 너무 많습니다. 15분 뒤에 다시 해 주세요." };
  const acc = readAccounts_().find((a) => a.id === id && a.pw === String(pw || ""));
  if (!acc) {
    cache.put(failKey, String(fails + 1), 15 * 60);
    return { ok: false, error: "아이디 또는 비밀번호가 맞지 않습니다." };
  }
  cache.remove(failKey);
  cleanupSessions_();
  const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, "");
  PropertiesService.getScriptProperties().setProperty("tok_" + token, JSON.stringify({ id: acc.id, exp: Date.now() + SESSION_DAYS * 864e5 }));
  return { ok: true, token: token, id: acc.id, role: acc.role };
}

// 토큰이 유효하고, 계정 탭에 아직 그 계정이 있을 때만 사용자로 인정한다.
// (계정 줄을 지우거나 역할을 바꾸면 바로 반영된다)
function sessionUser_(token) {
  if (!token) return null;
  const raw = PropertiesService.getScriptProperties().getProperty("tok_" + token);
  if (!raw) return null;
  const s = JSON.parse(raw);
  if (s.exp < Date.now()) return null;
  const acc = readAccounts_().find((a) => a.id === s.id);
  return acc ? { id: acc.id, role: acc.role } : null;
}

function cleanupSessions_() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  Object.keys(all).forEach((k) => {
    if (k.indexOf("tok_") !== 0) return;
    try {
      if (JSON.parse(all[k]).exp < Date.now()) props.deleteProperty(k);
    } catch (err) {
      props.deleteProperty(k);
    }
  });
}

// ---------------------------------------------------------------
// 시트 읽기/쓰기
// ---------------------------------------------------------------
function sheetOf_(col) {
  const def = SHEETS[col];
  if (!def) throw new Error("알 수 없는 메뉴입니다.");
  const sh = SpreadsheetApp.getActive().getSheetByName(def.name);
  if (!sh) throw new Error(`'${def.name}' 탭이 없습니다. setup 을 실행해 주세요.`);
  return { def: def, sh: sh, width: def.cols.length + META.length, idCol: def.cols.length + 1 };
}

function readSheet_(col) {
  const { def, sh, width, idCol } = sheetOf_(col);
  if (sh.getLastRow() < 2) return [];
  const range = sh.getRange(2, 1, sh.getLastRow() - 1, width);
  const values = range.getValues();
  const tz = Session.getScriptTimeZone();
  const out = [];
  values.forEach((row, i) => {
    if (String(row[0]).trim() === "") return;
    // 시트에서 직접 추가한 줄에는 ID 가 없으므로 여기서 채워 준다.
    let id = String(row[idCol - 1]).trim();
    if (!id) {
      id = Utilities.getUuid().slice(0, 8);
      sh.getRange(i + 2, idCol).setValue(id);
    }
    const o = { id: id };
    def.cols.forEach(([k], j) => {
      let v = row[j];
      if (v instanceof Date) v = Utilities.formatDate(v, tz, k === "time" ? "HH:mm" : "yyyy-MM-dd");
      o[k] = String(v).trim();
    });
    out.push(o);
  });
  return out;
}

function findRow_(sh, idCol, id) {
  if (!id || sh.getLastRow() < 2) return -1;
  const ids = sh.getRange(2, idCol, sh.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]).trim() === String(id)) return i + 2;
  return -1;
}

// 사용자가 입력한 글이 수식(=...)으로 실행되지 않게 막는다.
function cell_(v, max) {
  let s = String(v == null ? "" : v).slice(0, max);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function saveRow_(col, item, by) {
  const { def, sh, idCol } = sheetOf_(col);
  const row = def.cols.map(([k]) => cell_(item[k], k === "body" || k === "memo" || k === "summary" ? 10000 : 300));
  if (!row[0]) throw new Error("첫 칸(제목/이름)은 꼭 입력해 주세요.");
  def.cols.forEach(([k], j) => {
    if (/date$|Date$/.test(k) && row[j] && !/^\d{4}-\d{2}-\d{2}$/.test(row[j])) throw new Error("날짜 형식이 올바르지 않습니다.");
  });
  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  let r = findRow_(sh, idCol, item.id);
  const id = r > 0 ? String(item.id) : Utilities.getUuid().slice(0, 8);
  if (r < 0) r = sh.getLastRow() + 1;
  sh.getRange(r, 1, 1, row.length + META.length).setValues([row.concat([id, by, now])]);
  return { id: id };
}

function deleteRow_(col, id) {
  const { sh, idCol } = sheetOf_(col);
  const r = findRow_(sh, idCol, id);
  if (r < 0) throw new Error("이미 삭제되었거나 찾을 수 없습니다.");
  sh.deleteRow(r);
  return {};
}

// ---------------------------------------------------------------
// 사진 (드라이브 폴더)
// ---------------------------------------------------------------
function photoRoot_() {
  const id = readSettings_()["사진 폴더 ID"];
  if (!id) throw new Error("설정 탭에 '사진 폴더 ID'가 없습니다.");
  return DriveApp.getFolderById(id);
}

// 사진 폴더 안의 사진, 그리고 한 단계 아래 폴더(앨범)의 사진을 읽는다.
function readPhotos_(folderId) {
  if (!folderId) return [];
  const out = [];
  const tz = Session.getScriptTimeZone();
  const add = (folder, album) => {
    const files = folder.getFiles();
    while (files.hasNext()) {
      const f = files.next();
      if (!/^image\//.test(f.getMimeType())) continue;
      out.push({ id: f.getId(), album: album, caption: f.getDescription() || "", date: Utilities.formatDate(f.getDateCreated(), tz, "yyyy-MM-dd") });
    }
  };
  try {
    const root = DriveApp.getFolderById(folderId);
    add(root, "");
    const subs = root.getFolders();
    while (subs.hasNext()) {
      const s = subs.next();
      add(s, s.getName());
    }
  } catch (err) {
    console.error("사진 폴더를 읽을 수 없습니다: " + err);
  }
  return out;
}

function uploadPhoto_(req, by) {
  const m = /^data:(image\/(jpeg|png|webp));base64,(.+)$/.exec(String(req.dataUrl || ""));
  if (!m) throw new Error("사진 형식이 올바르지 않습니다.");
  const bytes = Utilities.base64Decode(m[3]);
  if (bytes.length > 8 * 1024 * 1024) throw new Error("사진이 너무 큽니다.");
  const root = photoRoot_();
  let folder = root;
  const album = String(req.album || "").trim().slice(0, 60);
  if (album) {
    const it = root.getFoldersByName(album);
    folder = it.hasNext() ? it.next() : root.createFolder(album);
  }
  const name = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd-HHmmss") + "." + (m[2] === "jpeg" ? "jpg" : m[2]);
  const file = folder.createFile(Utilities.newBlob(bytes, m[1], name));
  file.setDescription(String(req.caption || "").slice(0, 200));
  return { id: file.getId() };
}

// 사진 폴더(와 그 앨범) 안에 있는 파일만 지울 수 있다. 다른 드라이브 파일은 건드리지 않는다.
function deletePhoto_(id) {
  const root = photoRoot_();
  const file = DriveApp.getFileById(String(id));
  const parents = file.getParents();
  let inside = false;
  while (parents.hasNext()) {
    const p = parents.next();
    if (p.getId() === root.getId()) inside = true;
    const gp = p.getParents();
    while (gp.hasNext()) if (gp.next().getId() === root.getId()) inside = true;
  }
  if (!inside) throw new Error("사진 폴더의 파일만 삭제할 수 있습니다.");
  file.setTrashed(true);
  return {};
}

// ---------------------------------------------------------------
// 설정 / 캐시
// ---------------------------------------------------------------
function readSettings_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SETTINGS);
  const o = {};
  if (!sh || sh.getLastRow() < 1) return o;
  sh.getRange(1, 1, sh.getLastRow(), 2).getValues().forEach((r) => (o[String(r[0]).trim()] = String(r[1]).trim()));
  return o;
}

// 시트를 직접 고치면 캐시를 비워 앱에 바로 반영되게 한다. (setup 에서 트리거 등록)
function clearCache() {
  CacheService.getScriptCache().remove("data");
}

// ---------------------------------------------------------------
// 처음 한 번 실행: 탭·머리글·예시 줄·관리자 계정을 만든다. 이미 있는 탭은 건드리지 않는다.
// ---------------------------------------------------------------
function setup() {
  const ss = SpreadsheetApp.getActive();
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const samples = {
    events: ["정기 기도회 (예시)", today, "", "19:30", "온라인", "예시 줄입니다. 지우고 쓰세요."],
    prayers: ["학교를 위한 기도 (예시)", today, "예시 기도문입니다.\n실제 기도문으로 바꿔 주세요."],
    newsletters: ["소식지 예시호", today, "실제 소식지 제목과 링크로 바꿔 주세요.", ""],
    donors: ["홍길동 (예시)", "개인", "2024"],
  };
  for (const k of Object.keys(SHEETS)) {
    const def = SHEETS[k];
    if (ss.getSheetByName(def.name)) continue;
    const sh = ss.insertSheet(def.name);
    const headers = def.cols.map((c) => c[1]).concat(META);
    header_(sh, headers);
    sh.getRange(2, 1, 1, samples[k].length).setValues([samples[k]]);
    const col = (name) => headers.indexOf(name) + 1;
    ["시작일", "종료일", "날짜", "발행일"].forEach((h) => {
      if (col(h) > 0) sh.getRange(2, col(h), 999, 1).setNumberFormat("yyyy-mm-dd");
    });
    if (col("시간") > 0) sh.getRange(2, col("시간"), 999, 1).setNumberFormat("@");
    if (col("구분") > 0)
      sh.getRange(2, col("구분"), 999, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(["개인", "교회", "단체"]).build());
    // 자동으로 채워지는 칸은 회색으로
    sh.getRange(1, def.cols.length + 1, 1000, META.length).setFontColor("#999999");
    sh.getRange(1, def.cols.length + 1, 1, META.length).setFontColor("#ffffff");
    sh.autoResizeColumns(1, headers.length);
  }

  if (!ss.getSheetByName(ACCOUNTS)) {
    const sh = ss.insertSheet(ACCOUNTS);
    header_(sh, ["아이디", "비밀번호", "역할"]);
    const pw = () => Utilities.getUuid().replace(/-/g, "").slice(0, 10);
    sh.getRange(2, 1, 2, 3).setValues([
      ["admin", pw(), "관리자"],
      ["calendar", pw(), "일정담당"],
    ]);
    sh.getRange(2, 3, 100, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(["관리자", "일정담당"]).build());
    sh.getRange(2, 2, 100, 1).setNumberFormat("@");
    sh.getRange(5, 1).setValue("※ 비밀번호는 자유롭게 바꾸세요. 줄을 지우면 그 계정은 바로 로그인이 풀립니다.");
    sh.autoResizeColumns(1, 3);
    // 계정 탭은 시트 소유자만 고칠 수 있게 보호
    const prot = sh.protect().setDescription("계정 — 소유자만 편집");
    prot.removeEditors(prot.getEditors());
    if (prot.canDomainEdit()) prot.setDomainEdit(false);
  }

  if (!ss.getSheetByName(SETTINGS)) {
    const sh = ss.insertSheet(SETTINGS);
    sh.getRange(1, 1, 2, 2).setValues([
      ["사진 폴더 ID", ""],
      ["후원자 명단 비밀번호", ""],
    ]);
    sh.getRange(1, 1, 2, 1).setFontWeight("bold");
    sh.getRange(4, 1).setValue("※ 사진 폴더 ID: 드라이브 폴더 주소 .../folders/ 뒤의 글자를 붙여넣기 (폴더는 '링크가 있는 모든 사용자: 뷰어'로 공유)");
    sh.getRange(5, 1).setValue("※ 후원자 명단 비밀번호를 비우면 후원자 명단이 누구에게나 보입니다. 관리자로 로그인하면 항상 보입니다.");
  }

  const blank = ss.getSheetByName("시트1") || ss.getSheetByName("Sheet1");
  if (blank && ss.getSheets().length > 1 && blank.getLastRow() === 0) ss.deleteSheet(blank);

  if (!ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === "clearCache")) {
    ScriptApp.newTrigger("clearCache").forSpreadsheet(ss).onEdit().create();
  }
  // 드라이브 권한을 미리 받아 두기 위해 한 번 호출
  DriveApp.getRootFolder();
}

function header_(sh, headers) {
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold").setBackground("#8fb174").setFontColor("#ffffff");
  sh.setFrozenRows(1);
}
