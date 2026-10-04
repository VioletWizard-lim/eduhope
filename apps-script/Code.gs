/**
 * 기윤실교사모임 앱 — 관리자 사진 올리기 스크립트
 *
 * 앱의 다른 메뉴(캘린더·기도문 등)는 시트 링크로 읽기만 하므로 이 스크립트와 관계없습니다.
 * 이 스크립트는 "관리자가 앱에서 사진을 올리고 지우는 일" 하나만 합니다.
 *   1) 관리자 아이디/비밀번호 확인
 *   2) 사진을 구글 드라이브 사진 폴더(앨범 이름의 하위 폴더)에 저장
 *   3) 시트 '사진' 탭에 한 줄 추가 → 앱 사진첩에 나타남
 *
 * ※ 시트는 링크가 있는 누구나 볼 수 있으므로, 비밀번호는 시트가 아니라
 *    "스크립트 속성"(프로젝트 설정 → 스크립트 속성)에 보관합니다.
 *
 * 설치 (README 의 "관리자 사진 올리기 설정" 참고)
 *   1) 시트 메뉴 [확장 프로그램 → Apps Script] 에 이 파일 내용을 붙여넣고 저장
 *   2) 함수 목록에서 setup 선택 → [실행] → 권한 허용
 *      → 실행 로그에 관리자 아이디/비밀번호가 표시됩니다.
 *   3) [배포 → 새 배포 → 웹 앱] 실행 계정 "나", 액세스 "모든 사용자" → 배포
 *   4) 웹 앱 URL 을 앱의 js/config.js 의 UPLOAD_URL 에 붙여넣기
 *
 * 관리자 추가/비밀번호 변경: 프로젝트 설정 → 스크립트 속성
 *   속성 이름 user_아이디 (예: user_admin, user_kim), 값 = 비밀번호
 */

const PHOTO_SHEET = "사진";
const PHOTO_HEADERS = ["사진 링크", "앨범", "설명", "날짜"];
const FOLDER_NAME = "기윤실교사모임 사진";
const SESSION_SECONDS = 6 * 60 * 60; // 로그인 유지 6시간
const MAX_BYTES = 8 * 1024 * 1024;

const props = () => PropertiesService.getScriptProperties();

// 아이디의 비밀번호 (속성 이름의 대소문자는 가리지 않는다: user_Kim 도 kim 으로 로그인)
function passwordOf_(id) {
  if (!id) return null;
  const all = props().getProperties();
  const key = Object.keys(all).find((k) => k.toLowerCase() === "user_" + id);
  return key ? String(all[key]) : null;
}

// 배포 주소가 맞는지 브라우저로 열어 확인할 때 쓰인다.
function doGet() {
  return json_({ ok: true, app: "eduhope-photo-upload" });
}

// 앱은 text/plain 으로 JSON 을 보낸다.
function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: "잘못된 요청입니다." });
  }
  try {
    if (req.action === "login") return json_(login_(req.id, req.pw));
    if (req.action === "logout") {
      if (req.token) CacheService.getScriptCache().remove("tok_" + req.token);
      return json_({ ok: true });
    }
    const user = sessionUser_(req.token);
    if (!user) return json_({ ok: false, error: "로그인이 필요합니다. 다시 로그인해 주세요.", code: "auth" });

    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      if (req.action === "upload") return json_(Object.assign({ ok: true }, upload_(req, user)));
      if (req.action === "delete") return json_(Object.assign({ ok: true }, remove_(req.id)));
      return json_({ ok: false, error: "알 수 없는 요청입니다." });
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

// ---------------------------------------------------------------
// 로그인 — 비밀번호는 스크립트 속성 user_아이디 에 있다.
// ---------------------------------------------------------------
function login_(id, pw) {
  id = String(id || "").trim().toLowerCase();
  const cache = CacheService.getScriptCache();
  const failKey = "fail_" + id;
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= 10) return { ok: false, error: "로그인 실패가 너무 많습니다. 15분 뒤에 다시 해 주세요." };
  const saved = passwordOf_(id);
  if (!saved || saved !== String(pw || "")) {
    cache.put(failKey, String(fails + 1), 15 * 60);
    return { ok: false, error: "아이디 또는 비밀번호가 맞지 않습니다." };
  }
  cache.remove(failKey);
  const token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  cache.put("tok_" + token, id, SESSION_SECONDS);
  return { ok: true, token: token, id: id };
}

// 토큰이 살아 있고, 그 아이디가 스크립트 속성에 아직 있을 때만 인정한다.
// (속성을 지우면 그 관리자는 바로 올리기·삭제를 못 한다)
function sessionUser_(token) {
  if (!token) return null;
  const id = CacheService.getScriptCache().get("tok_" + token);
  if (!id || passwordOf_(id) === null) return null;
  return { id: id };
}

// ---------------------------------------------------------------
// 사진 올리기 / 삭제
// ---------------------------------------------------------------
function rootFolder_() {
  const id = props().getProperty("PHOTO_FOLDER_ID");
  if (!id) throw new Error("사진 폴더가 없습니다. Apps Script 에서 setup 을 먼저 실행해 주세요.");
  return DriveApp.getFolderById(id);
}

// 사용자가 입력한 글이 수식(=...)으로 실행되지 않게 막는다.
function text_(v, max) {
  let s = String(v == null ? "" : v).trim().slice(0, max);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function photoSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(PHOTO_SHEET);
  if (!sh) {
    sh = ss.insertSheet(PHOTO_SHEET);
    sh.getRange(1, 1, 1, PHOTO_HEADERS.length).setValues([PHOTO_HEADERS]).setFontWeight("bold").setBackground("#8fb174").setFontColor("#ffffff");
    sh.setFrozenRows(1);
  }
  return sh;
}

// 머리글 이름으로 칸 위치를 찾는다. (사용자가 칸 순서를 바꿔도 동작)
function columns_(sh) {
  const head = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map((h) => String(h).trim());
  const find = (names) => head.findIndex((h) => names.indexOf(h) >= 0);
  const col = { link: find(["사진 링크", "링크", "사진"]), album: find(["앨범"]), caption: find(["설명"]), date: find(["날짜"]) };
  if (col.link < 0) throw new Error("'사진' 탭 1행에 '사진 링크' 머리글이 없습니다.");
  return { col: col, width: head.length };
}

function upload_(req, user) {
  const m = /^data:(image\/(jpeg|png|webp));base64,(.+)$/.exec(String(req.dataUrl || ""));
  if (!m) throw new Error("사진 형식이 올바르지 않습니다.");
  const bytes = Utilities.base64Decode(m[3]);
  if (bytes.length > MAX_BYTES) throw new Error("사진이 너무 큽니다.");

  const album = text_(req.album, 60).replace(/^'/, "");
  const caption = text_(req.caption, 200);
  const root = rootFolder_();
  let folder = root;
  if (album) {
    const it = root.getFoldersByName(album);
    folder = it.hasNext() ? it.next() : root.createFolder(album);
  }
  const tz = Session.getScriptTimeZone();
  const now = new Date();
  const name = Utilities.formatDate(now, tz, "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1000) + "." + (m[2] === "jpeg" ? "jpg" : m[2]);
  const file = folder.createFile(Utilities.newBlob(bytes, m[1], name));
  file.setDescription(caption.replace(/^'/, "") + (caption ? " " : "") + "(올린 사람: " + user.id + ")");

  const sh = photoSheet_();
  const { col, width } = columns_(sh);
  const row = new Array(width).fill("");
  const date = Utilities.formatDate(now, tz, "yyyy-MM-dd");
  row[col.link] = "https://drive.google.com/file/d/" + file.getId() + "/view";
  if (col.album >= 0) row[col.album] = text_(album, 60);
  if (col.caption >= 0) row[col.caption] = caption;
  if (col.date >= 0) row[col.date] = date;
  sh.appendRow(row);

  return { photo: { id: file.getId(), album: album, caption: caption.replace(/^'/, ""), date: date } };
}

function remove_(id) {
  id = String(id || "");
  if (!/^[a-zA-Z0-9_-]{20,}$/.test(id)) throw new Error("잘못된 사진입니다.");
  // 시트에서 그 사진 줄을 지운다.
  const sh = photoSheet_();
  const { col } = columns_(sh);
  if (sh.getLastRow() >= 2) {
    const links = sh.getRange(2, col.link + 1, sh.getLastRow() - 1, 1).getValues();
    for (let i = links.length - 1; i >= 0; i--) {
      if (String(links[i][0]).indexOf(id) >= 0) sh.deleteRow(i + 2);
    }
  }
  // 파일은 사진 폴더(와 그 앨범 폴더) 안에 있을 때만 휴지통으로 보낸다. 다른 드라이브 파일은 건드리지 않는다.
  try {
    const root = rootFolder_();
    const file = DriveApp.getFileById(id);
    const parents = file.getParents();
    while (parents.hasNext()) {
      const p = parents.next();
      let inside = p.getId() === root.getId();
      const gp = p.getParents();
      while (!inside && gp.hasNext()) inside = gp.next().getId() === root.getId();
      if (inside) {
        file.setTrashed(true);
        break;
      }
    }
  } catch (err) {
    // 파일이 이미 없거나 다른 곳에 있으면 시트 줄만 지운 것으로 끝낸다.
  }
  return {};
}

// ---------------------------------------------------------------
// 처음 한 번 실행: 사진 폴더, '사진' 탭, 첫 관리자 계정을 만든다. 여러 번 실행해도 안전하다.
// ---------------------------------------------------------------
function setup() {
  const p = props();
  let folderId = p.getProperty("PHOTO_FOLDER_ID");
  let folder = null;
  try {
    if (folderId) folder = DriveApp.getFolderById(folderId);
  } catch (err) {
    folder = null;
  }
  if (!folder) {
    folder = DriveApp.createFolder(FOLDER_NAME);
    p.setProperty("PHOTO_FOLDER_ID", folder.getId());
  }
  // 앱에서 사진이 보이려면 링크가 있는 누구나 볼 수 있어야 한다. (폴더 안 사진에 모두 적용)
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  photoSheet_();

  const hasAdmin = Object.keys(p.getProperties()).some((k) => k.indexOf("user_") === 0);
  let msg = "사진 폴더: " + folder.getUrl();
  if (!hasAdmin) {
    const pw = Utilities.getUuid().replace(/-/g, "").slice(0, 10);
    p.setProperty("user_admin", pw);
    msg += "\n관리자 아이디: admin\n비밀번호: " + pw + "\n(프로젝트 설정 → 스크립트 속성에서 바꿀 수 있습니다)";
  } else {
    msg += "\n관리자 계정은 이미 있습니다. (프로젝트 설정 → 스크립트 속성의 user_ 로 시작하는 항목)";
  }
  console.log(msg);
  return msg;
}
