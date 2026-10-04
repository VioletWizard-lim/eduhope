/**
 * 기윤실교사모임 앱 — 관리자 사진 올리기 스크립트
 *
 * 앱의 다른 메뉴(캘린더·기도문 등)는 시트 링크로 읽기만 하므로 이 스크립트와 관계없습니다.
 * 이 스크립트는 "관리자가 앱에서 사진을 올리고 지우는 일" 하나만 합니다.
 *   1) 관리자 아이디/비밀번호 확인
 *   2) 사진을 구글 드라이브 사진 폴더(사진첩 이름의 하위 폴더)에 저장
 *   3) 시트 '사진' 탭에 한 줄 추가 → 앱 사진첩에 나타남
 *
 * ※ 시트는 링크가 있는 누구나 볼 수 있으므로, 비밀번호는 시트가 아니라
 *    "스크립트 속성"에 보관합니다. (시트 메뉴 📷 기윤실 앱 → 관리자 추가·비밀번호 변경)
 *
 * 설치
 *   1) 시트 메뉴 [확장 프로그램 → Apps Script] 에 이 파일 내용을 붙여넣고 저장(💾)
 *   2) 시트 탭으로 돌아가 새로고침 → 위쪽에 생긴 [📷 기윤실 앱 → ① 설정 시작] → 권한 허용
 *   3) 팝업 안내대로 [배포 → 새 배포 → 웹 앱] (실행 계정: 나 / 액세스: 모든 사용자)
 *   4) 배포 화면의 '웹 앱 URL' 을 복사 → 시트 메뉴 [📷 기윤실 앱 → ② 앱과 연결] 에 붙여넣기
 *      → 끝 (주소가 시트 '설정' 탭에 적히고, 앱이 거기서 읽어 갑니다)
 */

const PHOTO_SHEET = "사진";
const SETTINGS_SHEET = "설정";
const URL_KEY = "사진 올리기 주소"; // 앱(js/data.js)이 이 이름으로 주소를 찾는다
const MENU = "📷 기윤실 앱";
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
  if (bytes.length > MAX_BYTES) throw new Error("사진은 한 장에 8MB 까지 올릴 수 있어요.");

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

  let created = null;
  if (!adminIds_().length) {
    created = { id: "admin", pw: Utilities.getUuid().replace(/-/g, "").slice(0, 10) };
    p.setProperty("user_admin", created.pw);
  }
  const msg = "사진 폴더: " + folder.getUrl() + (created ? "\n관리자 아이디: admin\n비밀번호: " + created.pw : "\n관리자 계정은 이미 있습니다.");
  console.log(msg);
  return { msg: msg, folderUrl: folder.getUrl(), created: created, admins: adminIds_() };
}

function adminIds_() {
  return Object.keys(props().getProperties())
    .filter((k) => k.toLowerCase().indexOf("user_") === 0)
    .map((k) => k.slice(5).toLowerCase())
    .sort();
}

// ---------------------------------------------------------------
// 시트 메뉴 — 시트를 열면 위쪽에 "📷 기윤실 앱" 메뉴가 생긴다.
// ---------------------------------------------------------------
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu(MENU)
    .addItem("① 설정 시작", "menuSetup")
    .addItem("② 앱과 연결", "menuConnect")
    .addSeparator()
    .addItem("관리자 추가·비밀번호 변경", "menuAdmin")
    .addItem("관리자 삭제", "menuRemoveAdmin")
    .addToUi();
}

const esc_ = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function menuSetup() {
  const r = setup();
  const account = r.created
    ? `<div class="box"><b>관리자 아이디</b> <code>${esc_(r.created.id)}</code><br><b>비밀번호</b> <code>${esc_(r.created.pw)}</code>
       <p class="warn">이 비밀번호를 꼭 적어 두세요. 나중에 메뉴 [관리자 추가·비밀번호 변경]에서 바꿀 수 있어요.</p></div>`
    : `<div class="box">관리자 계정이 이미 있어요: <b>${r.admins.map(esc_).join(", ")}</b><br>
       비밀번호를 잊었으면 메뉴 [관리자 추가·비밀번호 변경]에서 새로 정하세요.</div>`;
  const html = `
    <style>
      body{font-family:sans-serif;font-size:14px;line-height:1.6;color:#2d2a26}
      h3{color:#5f8546;margin:12px 0 6px} code{background:#eef2e8;padding:2px 6px;border-radius:4px;font-size:15px}
      .box{background:#f7f5f0;border:1px solid #e2ddd3;border-radius:8px;padding:10px 12px}
      .warn{color:#c4392b;margin:6px 0 0} ol{padding-left:20px;margin:6px 0} li{margin:4px 0}
      .k{background:#8fb174;color:#fff;border-radius:4px;padding:1px 6px;white-space:nowrap}
    </style>
    <h3>✅ 1단계 완료</h3>
    ${account}
    <p>사진 폴더도 만들었어요: <a href="${esc_(r.folderUrl)}" target="_blank">기윤실교사모임 사진</a></p>
    <h3>2단계: 배포하기 (한 번만)</h3>
    <ol>
      <li>메뉴 <span class="k">확장 프로그램</span> → <span class="k">Apps Script</span></li>
      <li>오른쪽 위 파란 버튼 <span class="k">배포</span> → <span class="k">새 배포</span></li>
      <li>왼쪽 ⚙ 톱니바퀴 → <span class="k">웹 앱</span> 선택</li>
      <li>실행 계정 <b>나</b> / 액세스 권한 <b>모든 사용자</b> → <span class="k">배포</span></li>
    </ol>
    <h3>3단계: 연결하기</h3>
    <ol>
      <li>배포가 끝나면 나오는 <b>웹 앱 URL</b> 아래 <span class="k">복사</span> 클릭<br>
        (나중에 다시 보려면 <span class="k">배포</span> → <span class="k">배포 관리</span>)</li>
      <li>시트로 돌아와 메뉴 <span class="k">${MENU}</span> → <span class="k">② 앱과 연결</span> → 주소 붙여넣기 → 끝!</li>
    </ol>`;
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(460).setHeight(560), "기윤실 앱 사진 올리기 설정");
}

const URL_RE = /^https:\/\/script\.google\.com\/(a\/macros\/[^/]+|macros)\/s\/[\w-]+\/exec$/;

function menuConnect() {
  const ui = SpreadsheetApp.getUi();
  if (!props().getProperty("PHOTO_FOLDER_ID")) {
    ui.alert("먼저 [" + MENU + " → ① 설정 시작] 을 해 주세요.");
    return;
  }
  // ScriptApp.getService().getUrl() 은 실제 배포 주소가 아닌 내부 주소를 돌려줄 때가 있어
  // (그 주소는 "파일을 열 수 없습니다"가 뜬다) 항상 배포 화면의 주소를 붙여넣게 한다.
  const res = ui.prompt(
    "앱과 연결",
    "웹 앱 주소를 붙여넣어 주세요.\n\n" +
      "주소 복사하는 곳: Apps Script 화면 → [배포] → [배포 관리] → '웹 앱 URL' 아래 [복사]\n" +
      "(https://script.google.com/macros/s/.../exec 모양)\n\n" +
      "아직 배포하지 않았다면 [취소] 후 [① 설정 시작] 안내의 2단계를 먼저 해 주세요.",
    ui.ButtonSet.OK_CANCEL,
  );
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const url = res.getResponseText().trim();
  if (!URL_RE.test(url)) {
    ui.alert("주소 모양이 맞지 않아요. 'https://script.google.com/' 로 시작하고 '/exec' 로 끝나는 주소를 붙여넣어 주세요.");
    return;
  }
  // 저장하기 전에 그 주소에 실제로 접속해 이 스크립트가 맞는지 확인한다. 틀린 주소는 적지 않는다.
  if (!verifyUrl_(url)) {
    ui.alert(
      "연결 확인 실패",
      "이 주소로 접속해 봤는데 사진 올리기 프로그램이 응답하지 않아요. 아래를 확인해 주세요.\n\n" +
        "① [배포 → 배포 관리] 의 '웹 앱 URL' 을 [복사] 버튼으로 복사했나요? (주소창 주소가 아니라)\n" +
        "② 그 배포의 '액세스 권한이 있는 사용자' 가 '모든 사용자' 인가요?\n" +
        "③ 코드를 붙여넣고 저장한 뒤에 배포했나요? 아니라면 [배포 관리 → ✏️ → 버전: 새 버전 → 배포]\n\n" +
        "확인 후 다시 [② 앱과 연결] 을 눌러 주세요. (시트에는 아무것도 저장하지 않았어요)",
      ui.ButtonSet.OK,
    );
    return;
  }
  // 앱이 읽을 수 있도록 '설정' 탭에 주소를 적는다. (주소는 공개돼도 괜찮다. 올리기에는 비밀번호가 필요하다)
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SETTINGS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(SETTINGS_SHEET);
    sh.getRange(1, 1, 1, 2).setValues([["항목", "값"]]).setFontWeight("bold").setBackground("#8fb174").setFontColor("#ffffff");
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 160);
    sh.setColumnWidth(2, 520);
  }
  const last = sh.getLastRow();
  const keys = last >= 2 ? sh.getRange(2, 1, last - 1, 1).getValues().map((r) => String(r[0]).trim()) : [];
  const i = keys.indexOf(URL_KEY);
  sh.getRange(i >= 0 ? i + 2 : last + 1, 1, 1, 2).setValues([[URL_KEY, url]]);
  ui.alert(
    "✅ 연결 완료! (주소 확인됨)",
    "이제 앱 오른쪽 위 🔑 로 관리자 로그인을 하면 사진 메뉴에서 바로 사진을 올릴 수 있어요.\n" +
      "(앱을 껐다 켜거나 ↻ 를 누르면 🔑 버튼이 나타납니다)\n\n관리자: " + adminIds_().join(", "),
    ui.ButtonSet.OK,
  );
}

// 웹 앱 주소에 접속해 doGet 이 이 스크립트의 응답을 돌려주는지 본다.
function verifyUrl_(url) {
  try {
    const res = UrlFetchApp.fetch(url, { followRedirects: true, muteHttpExceptions: true });
    return res.getResponseCode() === 200 && res.getContentText().indexOf('"eduhope-photo-upload"') >= 0;
  } catch (err) {
    return false;
  }
}

function menuAdmin() {
  const ui = SpreadsheetApp.getUi();
  const ids = adminIds_();
  const r1 = ui.prompt(
    "관리자 추가·비밀번호 변경",
    "지금 관리자: " + (ids.join(", ") || "없음") + "\n\n아이디를 입력하세요. (새 아이디면 추가, 있는 아이디면 비밀번호 변경)",
    ui.ButtonSet.OK_CANCEL,
  );
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  const id = r1.getResponseText().trim().toLowerCase();
  if (!/^[a-z0-9_.-]{2,30}$/.test(id)) {
    ui.alert("아이디는 영문 소문자·숫자로 2~30자로 해 주세요. (예: admin, kim)");
    return;
  }
  const r2 = ui.prompt(id + " 의 비밀번호", "새 비밀번호를 입력하세요. (6자 이상)", ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  const pw = r2.getResponseText();
  // 빈칸이나 짧은 비밀번호는 아무것도 바꾸지 않는다. (실수로 확인을 눌러도 안전하게)
  if (pw.length < 6) {
    ui.alert("비밀번호는 6자 이상으로 해 주세요. (아무것도 바뀌지 않았어요)");
    return;
  }
  removeAdmin_(id); // 대소문자만 다른 예전 속성까지 정리한 뒤 저장
  props().setProperty("user_" + id, pw);
  ui.alert(ids.indexOf(id) >= 0 ? id + " 의 비밀번호를 바꿨어요." : "관리자 " + id + " 를 추가했어요. 이 아이디로 로그인할 수 있습니다.");
}

function menuRemoveAdmin() {
  const ui = SpreadsheetApp.getUi();
  const ids = adminIds_();
  if (ids.length <= 1) {
    ui.alert("관리자가 " + (ids[0] || "없음") + " 한 명뿐이라 삭제할 수 없어요.\n(마지막 관리자를 지우면 아무도 사진을 올릴 수 없게 됩니다)");
    return;
  }
  const r = ui.prompt("관리자 삭제", "지금 관리자: " + ids.join(", ") + "\n\n삭제할 아이디를 입력하세요.", ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const id = r.getResponseText().trim().toLowerCase();
  if (ids.indexOf(id) < 0) {
    ui.alert("'" + id + "' 라는 관리자가 없어요. (아무것도 바뀌지 않았어요)");
    return;
  }
  if (ui.alert("정말 삭제할까요?", "관리자 " + id + " 를 삭제하면 이 아이디로는 더 이상 사진을 올리거나 지울 수 없어요.", ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  removeAdmin_(id);
  ui.alert(id + " 관리자를 삭제했어요.");
}

function removeAdmin_(id) {
  Object.keys(props().getProperties())
    .filter((k) => k.toLowerCase() === "user_" + id)
    .forEach((k) => props().deleteProperty(k));
}
