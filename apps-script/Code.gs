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
 *
 * 학사 일정 가져오기 (이 파일 맨 아래)
 *   다른 시트의 학사 일정 탭을 1시간마다 확인해, 바뀐 내용을 '캘린더' 탭에 넣고/고치고/빼고
 *   바뀐 게 있으면 메일로 알려 줍니다. 시트 메뉴 [📷 기윤실 앱 → 학사 일정 연결하기] 로 시작.
 */

const PHOTO_SHEET = "사진";
const SETTINGS_SHEET = "설정";
const URL_KEY = "사진 올리기 주소"; // 앱(js/data.js)이 이 이름으로 주소를 찾는다
const MENU = "📷 기윤실 앱";

// 캘린더 일정 구분과 색 (js/content.js 의 CATEGORIES 와 같게)
const CAL_SHEET = "캘린더";
const CATEGORIES = [
  ["지역모임", "#f4cccc"],
  ["전문모임", "#ffd966"],
  ["실천연구소", "#93c47d"],
  ["꿈섬·꿈틀", "#6d9eeb"],
  ["번개", "#b4a7d6"],
  ["전체·사무국", "#ffff00"],
  ["그 외", "#b7e1cd"],
];
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
  setupCalendarColors_();

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
    .addItem("캘린더 색 구분 넣기", "menuCalendarColors")
    .addSeparator()
    .addItem("관리자 추가·비밀번호 변경", "menuAdmin")
    .addItem("관리자 삭제", "menuRemoveAdmin")
    .addSeparator()
    .addItem("학사 일정 연결하기", "menuSchoolConnect")
    .addItem("학사 일정 지금 가져오기", "menuSchoolSyncNow")
    .addItem("학사 일정 다시 맞추기", "menuSchoolRealign")
    .addItem("지운 학사 일정 되살리기", "menuSchoolRestore")
    .addItem("학사 일정 자동 가져오기 끄기", "menuSchoolStop")
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

// ---------------------------------------------------------------
// 캘린더 색 구분: '구분' 칸(목록에서 고르기)을 만들고, 고른 구분에 따라 줄 전체에 색을 칠한다.
// 여러 번 실행해도 안전하다. (칸은 한 번만 만들고, 색 규칙은 새로 정리해서 다시 건다)
// ---------------------------------------------------------------
function setupCalendarColors_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(CAL_SHEET);
  if (!sh) return "'캘린더' 탭이 없어요.";
  const width = Math.max(sh.getLastColumn(), 1);
  const head = sh.getRange(1, 1, 1, width).getValues()[0].map((h) => String(h).trim());
  let col = head.indexOf("구분") + 1;
  let added = false;
  if (!col) {
    // '제목' 바로 뒤에 넣는다. (앱은 머리글 이름으로 칸을 찾으므로 위치가 바뀌어도 괜찮다)
    const after = Math.max(head.indexOf("제목") + 1, 1);
    sh.insertColumnAfter(after);
    col = after + 1;
    sh.getRange(1, col).setValue("구분").setFontWeight("bold").setBackground("#8fb174").setFontColor("#ffffff");
    added = true;
  }
  const rows = Math.max(sh.getMaxRows() - 1, 1);
  const lastCol = Math.max(sh.getLastColumn(), col);
  sh.getRange(2, col, rows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(CATEGORIES.map((c) => c[0]), true).setAllowInvalid(true).build(),
  );
  // 예전에 이 기능이 건 색 규칙은 지우고 새로 건다. (사용자가 직접 만든 다른 규칙은 그대로)
  const names = CATEGORIES.map((c) => c[0]);
  const mine = (rule) => {
    const cond = rule.getBooleanCondition && rule.getBooleanCondition();
    const f = cond && cond.getCriteriaValues && String(cond.getCriteriaValues()[0] || "");
    return !!f && names.some((n) => f.indexOf('"' + n + '"') >= 0 || f.indexOf("'" + n + "'") >= 0);
  };
  const keep = sh.getConditionalFormatRules().filter((r) => !mine(r));
  const letter = sh.getRange(1, col).getA1Notation().replace(/\d+/g, "");
  const range = sh.getRange(2, 1, rows, lastCol);
  const rules = CATEGORIES.slice(0, -1).map(([name, color]) =>
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(`=$${letter}2="${name}"`).setBackground(color).setRanges([range]).build(),
  );
  // 그 외: 제목은 있는데 구분이 위 목록에 없는 줄 (비어 있어도).
  // 끝의 "그 외"="그 외" 는 항상 참인 표식으로, 다음에 다시 실행할 때 이 규칙을 알아보기 위한 것이다.
  const titleCol = sh.getRange(1, 1, 1, lastCol).getValues()[0].map((h) => String(h).trim()).indexOf("제목") + 1 || 1;
  const titleLetter = sh.getRange(1, titleCol).getA1Notation().replace(/\d+/g, "");
  const others = names.slice(0, -1).map((n) => `$${letter}2<>"${n}"`).join(",");
  rules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(`=AND($${titleLetter}2<>"",${others},"그 외"="그 외")`)
      .setBackground(CATEGORIES[CATEGORIES.length - 1][1])
      .setRanges([range])
      .build(),
  );
  sh.setConditionalFormatRules(keep.concat(rules));
  return added ? "'캘린더' 탭에 '구분' 칸을 만들고 색 규칙을 넣었어요." : "'구분' 칸은 이미 있어요. 색 규칙을 다시 정리했어요.";
}

function menuCalendarColors() {
  const msg = setupCalendarColors_();
  SpreadsheetApp.getUi().alert(
    "캘린더 색 구분",
    msg + "\n\n'구분' 칸에서 목록을 골라 주세요: " + CATEGORIES.map((c) => c[0]).join(", ") +
      "\n비워 두면 '그 외'(민트)로 보입니다. 앱 캘린더에도 같은 색으로 나와요.",
    SpreadsheetApp.getUi().ButtonSet.OK,
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

// ===============================================================
// 학사 일정 가져오기
//   다른 시트(학사 일정)를 1시간마다 읽어 '캘린더' 탭에 반영한다.
//   달력 모양(한 탭 = 한 달, 칸 색 = 구분)과 목록 모양(한 줄 = 일정 하나) 둘 다 읽는다.
//   - 새 일정 → 캘린더 맨 아래에 추가
//   - 구분(달력 칸 색)·시간·장소·메모·종료일이 바뀐 일정 → 그 줄을 고침 (원본에 없는 칸은 손대지 않음)
//   - 원본에서 없어진 일정 → 캘린더에서 뺌 (이미 지난 일정은 기록으로 남겨 둠)
//   - 직접 적은 일정(맨 끝 '학사 일정 키' 칸이 빈 줄)은 절대 건드리지 않는다.
//   바뀐 내용은 '학사 일정 기록' 탭에 쌓이고, 자동 확인 때 바뀐 게 있으면 메일로 알려 준다.
// ===============================================================
const SCHOOL_KEY_HEADER = "학사 일정 키";
const SCHOOL_STATE_HEADER = "학사 일정 상태"; // "자동 ○○○○○○" = 원본을 따라 바뀜 / "직접 고침" = 손대지 않음
const SCHOOL_LOCKED = "직접 고침";
const SCHOOL_LIST_SHEET = "학사 일정 목록"; // (숨김) 캘린더에 넣은 적 있는 일정 키 — 사람이 지운 일정을 다시 넣지 않으려고
const SCHOOL_GONE = "지움";
const SCHOOL_LOG_SHEET = "학사 일정 기록";
const SCHOOL_CATEGORY = "그 외"; // 원본에 '구분' 칸이 없을 때 넣을 구분
const SCHOOL_TRIGGER = "schoolSyncTrigger";

// 원본 머리글 이름 → 뜻 (띄어쓰기·괄호는 무시하고 비교, 앞쪽 이름이 우선)
const SCHOOL_HEADERS = {
  title: ["제목", "행사명", "행사", "일정명", "일정", "행사내용", "학사일정", "내용"],
  start: ["시작일", "시작", "날짜", "일자", "일시", "기간"],
  end: ["종료일", "종료", "끝"],
  month: ["월"],
  day: ["일"],
  time: ["시간"],
  place: ["장소"],
  memo: ["메모", "비고"],
  cat: ["구분", "분류"],
};

const normHead_ = (h) => String(h).replace(/\(.*?\)/g, "").replace(/\s+/g, "");
const schoolTz_ = () => SpreadsheetApp.getActive().getSpreadsheetTimeZone();

function schoolIds_(url) {
  const m = String(url || "").match(/\/spreadsheets\/d\/([\w-]{20,})/);
  if (!m) return null;
  const g = String(url).match(/[#?&]gid=(\d+)/);
  return { id: m[1], gid: g ? Number(g[1]) : null };
}

// 원본 시트에서 학사 일정 탭을 연다. (주소의 gid 로 탭을 찾고, 없으면 첫 탭)
function schoolSource_(url) {
  const ids = schoolIds_(url);
  if (!ids) throw new Error("구글 시트 주소가 아니에요.");
  let book;
  try {
    book = SpreadsheetApp.openById(ids.id);
  } catch (err) {
    throw new Error("원본 시트를 열 수 없어요. 이 구글 계정에 그 시트를 볼 권한이 있는지 확인해 주세요.");
  }
  const sh = book.getSheets().find((s) => ids.gid === null || s.getSheetId() === ids.gid);
  if (!sh) throw new Error("주소에 있는 탭(gid=" + ids.gid + ")을 찾지 못했어요. 탭이 지워졌는지 확인해 주세요.");
  return { book: book, sheet: sh };
}

// 연도가 없는 날짜(3.2 / 3월 2일)에 붙일 연도. 시트·탭 이름의 '2026학년도' 같은 걸 먼저 보고, 없으면 올해 기준.
function schoolBaseYear_(names, now) {
  const m = names.join(" ").match(/(20\d\d)/);
  if (m) return { year: Number(m[1]), schoolYear: true };
  // 학년도는 3월에 시작하므로 1~2월이면 작년 학년도로 본다.
  return { year: now.getMonth() < 2 ? now.getFullYear() - 1 : now.getFullYear(), schoolYear: true };
}

function ymd_(y, m, d) {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return "";
  return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
}

// 날짜 하나: Date 객체 / 2026.3.2 / 2026-03-02 / 3.2 / 3/2 / 3월 2일(월)
function schoolDate_(v, base, tz) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, tz, "yyyy-MM-dd");
  const t = String(v || "").trim();
  if (!t) return "";
  let m = t.match(/(20\d\d)\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
  if (m) return ymd_(Number(m[1]), Number(m[2]), Number(m[3]));
  m = t.match(/^(\d{1,2})\s*[.\/월]\s*(\d{1,2})/);
  if (m) {
    const mo = Number(m[1]);
    // 학년도 기준이면 1~2월은 다음 해
    return ymd_(base.year + (base.schoolYear && mo < 3 ? 1 : 0), mo, Number(m[2]));
  }
  return "";
}

// "3.2~3.4", "3.2~4", "2026.3.30 - 4.2" 같은 기간 → [시작, 끝]
// 끝에 연도가 없으면 시작 연도를 따르고(12월→1월이면 다음 해), 일만 있으면 시작 달을 따른다.
function schoolRange_(v, base, tz) {
  if (v instanceof Date) return [schoolDate_(v, base, tz), ""];
  const parts = String(v || "").split(/\s*[~∼〜]\s*|\s+[-–]\s+/);
  const start = schoolDate_(parts[0], base, tz);
  if (!start || parts.length < 2) return [start, ""];
  const t = String(parts[1]).trim();
  const sy = Number(start.slice(0, 4));
  const sm = Number(start.slice(5, 7));
  let end = "";
  let m;
  if (/^20\d\d/.test(t)) end = schoolDate_(t, base, tz);
  else if ((m = t.match(/^(\d{1,2})\s*[.\/월]\s*(\d{1,2})/))) end = ymd_(Number(m[1]) < sm ? sy + 1 : sy, Number(m[1]), Number(m[2]));
  else if ((m = t.match(/^(\d{1,2})\s*일?(\s|\(|$)/))) end = ymd_(sy, sm, Number(m[1]));
  return [start, end > start ? end : ""];
}

function schoolTime_(v, tz) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, tz, "HH:mm");
  return String(v === null || v === undefined ? "" : v).trim();
}

// 목록 모양 탭(한 줄 = 일정 하나)을 읽는다. 머리글은 위쪽 15줄 안에서 찾는다.
function schoolReadList_(source) {
  const sh = source.sheet;
  const tz = source.book.getSpreadsheetTimeZone();
  const values = sh.getDataRange().getValues();
  const base = schoolBaseYear_([source.book.getName(), sh.getName()], new Date());
  let headRow = -1;
  let col = {};
  for (let r = 0; r < Math.min(values.length, 15) && headRow < 0; r++) {
    const heads = values[r].map(normHead_);
    const c = {};
    Object.keys(SCHOOL_HEADERS).forEach((k) => {
      for (const name of SCHOOL_HEADERS[k]) {
        const i = heads.indexOf(name);
        if (i >= 0 && Object.keys(c).every((o) => c[o] !== i)) {
          c[k] = i;
          break;
        }
      }
    });
    if (c.title !== undefined && (c.start !== undefined || (c.month !== undefined && c.day !== undefined))) {
      headRow = r;
      col = c;
    }
  }
  const sample = values.slice(0, 3).map((row) => row.filter((v) => v !== "").slice(0, 8).join(" | ")).filter(String);
  if (headRow < 0) return { events: [], skipped: 0, headers: null, sample: sample, tab: sh.getName() };

  const events = [];
  let skipped = 0;
  let lastMonth = null;
  let lastStart = "";
  let lastEnd = "";
  for (let r = headRow + 1; r < values.length; r++) {
    const row = values[r];
    const get = (k) => (col[k] === undefined ? "" : row[col[k]]);
    const title = String(get("title")).replace(/\s+/g, " ").trim();
    let start = "";
    let end = "";
    if (col.start !== undefined && get("start") !== "") {
      [start, end] = schoolRange_(get("start"), base, tz);
    } else if (col.month !== undefined) {
      // 월 칸은 합쳐진 셀이라 첫 줄에만 값이 있는 경우가 많다 → 위에서 이어받는다.
      const mo = parseInt(get("month"), 10);
      if (mo) lastMonth = mo;
      const d = parseInt(get("day"), 10);
      if (lastMonth && d) start = ymd_(base.year + (base.schoolYear && lastMonth < 3 ? 1 : 0), lastMonth, d);
    }
    if (col.end !== undefined && get("end") !== "") end = schoolDate_(get("end"), base, tz) || end;
    if (!title) continue;
    // 같은 날 행사가 여러 줄이면 날짜 칸이 비어 있는 경우가 많다 → 바로 위 날짜를 이어받는다.
    if (!start && get("start") === "" && get("day") === "" && lastStart) {
      start = lastStart;
      end = lastEnd;
    }
    if (!start) {
      skipped++;
      continue;
    }
    lastStart = start;
    lastEnd = end;
    events.push({
      title: title,
      start: start,
      end: end && end > start ? end : "",
      // 원본에 없는 칸은 undefined → 캘린더에 적힌 값을 지우지 않는다.
      time: col.time === undefined ? undefined : schoolTime_(get("time"), tz),
      place: col.place === undefined ? undefined : String(get("place")).trim(),
      memo: col.memo === undefined ? undefined : String(get("memo")).trim(),
      cat: col.cat === undefined ? undefined : String(get("cat")).trim(),
    });
  }
  const headers = Object.keys(col).map((k) => k + "=" + values[headRow][col[k]]);
  return { events: events, skipped: skipped, headers: headers, sample: sample, tab: sh.getName() };
}

// ---------------------------------------------------------------
// 달력 모양 탭: 한 달이 한 탭이고, 요일(일~토) 머리글 아래로
//   [날짜 줄] 01 02 03 …
//   [일정 줄] 여러 줄 — 칸 색이 구분, 여러 날 일정은 칸이 가로로 합쳐져 있음
// 이 반복된다. 회색으로 보이는 앞뒤 달 날짜는 그 달 탭에서 읽으므로 여기선 건너뛴다.
// ---------------------------------------------------------------
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function schoolDay_(v) {
  const m = String(v).trim().match(/^(\d{1,2})(?!\d)/);
  const d = m ? Number(m[1]) : 0;
  return d >= 1 && d <= 31 ? d : 0;
}

// 칸 색 → 구분. 색의 '색상(hue)'이 가장 가까운 구분을 고른다. 흰색·회색이면 '그 외'.
// (밝기까지 같이 비교하면 연보라빛 분홍(지역모임)이 번개(보라)로 잘못 잡힌다)
function schoolHue_(hex) {
  const m = String(hex).match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return null;
  const [r, g, b] = [1, 2, 3].map((i) => parseInt(m[i], 16));
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d < 16) return null; // 흰색·회색·검정 = 색 없음
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

function schoolColorCat_(hex) {
  const other = CATEGORIES[CATEGORIES.length - 1][0];
  const h = schoolHue_(hex);
  if (h === null) return other;
  let best = other;
  let bestD = Infinity;
  CATEGORIES.forEach(([name, color]) => {
    const k = schoolHue_(color);
    const d = Math.min(Math.abs(h - k), 360 - Math.abs(h - k));
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  });
  return best;
}

function schoolReadGrid_(sh, book) {
  const range = sh.getDataRange();
  const disp = range.getDisplayValues();
  // 요일 머리글 줄과 각 요일의 첫 칸 위치 (오른쪽 작은 달력의 요일은 무시: 처음 나온 일~토만)
  let head = -1;
  let cols = [];
  for (let r = 0; r < Math.min(disp.length, 10) && head < 0; r++) {
    const found = [];
    for (let c = 0; c < disp[r].length && found.length < 7; c++) {
      if (String(disp[r][c]).trim() === WEEKDAYS[found.length]) found.push(c);
    }
    if (found.length === 7) {
      head = r;
      cols = found;
    }
  }
  if (head < 0) return null;
  const span = cols[1] - cols[0];
  const dayOfCol = (c) => {
    for (let k = 6; k >= 0; k--) if (c >= cols[k]) return c < cols[k] + span ? k : -1;
    return -1;
  };

  // 날짜 줄: 일~토 첫 칸 중 5개 이상이 1~31 숫자인 줄
  const dateRows = [];
  for (let r = head + 1; r < disp.length; r++) {
    if (cols.filter((c) => schoolDay_(disp[r][c])).length >= 5) dateRows.push(r);
  }
  if (!dateRows.length) return null;

  // 연도·월: 탭 안의 '2026', '10월' 칸 → 없으면 탭 이름 → 시트 이름 → 올해
  let year = 0;
  let month = 0;
  disp.slice(0, 15).forEach((row) =>
    row.forEach((v) => {
      const t = String(v).trim();
      if (!year && /^20\d\d$/.test(t)) year = Number(t);
      const m = t.match(/^(\d{1,2})\s*월$/);
      if (!month && m && Number(m[1]) <= 12) month = Number(m[1]);
    }),
  );
  const names = sh.getName() + " " + book.getName();
  if (!month) month = Number((sh.getName().match(/(\d{1,2})\s*월/) || [])[1] || 0);
  if (!year) year = Number((names.match(/(20\d\d)/) || [])[1] || new Date().getFullYear());
  if (!month || month > 12) return null;

  // 날짜 줄의 칸마다 날짜를 매긴다. 첫 '1' 전은 지난달, 두 번째 '1'부터는 다음 달 → 비움
  const dates = {};
  let phase = 0;
  dateRows.forEach((r) => {
    dates[r] = cols.map((c) => {
      const d = schoolDay_(disp[r][c]);
      if (d === 1) phase++;
      return phase === 1 && d ? ymd_(year, month, d) : "";
    });
  });

  const merged = {};
  range.getMergedRanges().forEach((m) => (merged[m.getRow() - 1 + "," + (m.getColumn() - 1)] = m.getNumColumns()));
  const bg = range.getBackgrounds();
  const block = dateRows.length > 1 ? dateRows[1] - dateRows[0] : 5;
  const events = [];
  dateRows.forEach((r, i) => {
    const endRow = i + 1 < dateRows.length ? dateRows[i + 1] : Math.min(r + block, disp.length);
    for (let er = r + 1; er < endRow; er++) {
      for (let c = cols[0]; c < cols[6] + span; c++) {
        const title = String(disp[er][c] || "").replace(/\s+/g, " ").trim();
        const k = dayOfCol(c);
        if (!title || k < 0) continue;
        const start = dates[r][k];
        if (!start) continue; // 회색(앞뒤 달) 날짜의 일정은 그 달 탭에서 읽는다
        const last = dayOfCol(c + (merged[er + "," + c] || 1) - 1);
        let end = "";
        for (let j = last; j > k; j--) {
          if (dates[r][j]) {
            end = dates[r][j];
            break;
          }
        }
        // 달력에는 시간·장소·메모 칸이 없으므로 비워 두지 않고 '모름'(undefined)으로 둔다 → 캘린더에 적힌 걸 지우지 않음
        events.push({ title: title, start: start, end: end, cat: schoolColorCat_(bg[er][c]) });
      }
    }
  });
  return { events: events, month: year + "-" + String(month).padStart(2, "0"), tab: sh.getName() };
}

// 원본 시트를 읽는다.
//   달력 모양 탭이 있으면 그런 탭을 모두 읽고(한 탭 = 한 달), 없으면 주소의 탭을 목록 모양으로 읽는다.
//   months: 이번에 제대로 읽은 달 목록. 못 읽은 달의 일정은 캘린더에서 빼지 않는다.
function schoolRead_(source) {
  const grids = source.book
    .getSheets()
    .map((sh) => schoolReadGrid_(sh, source.book))
    .filter((g) => g && g.events.length);
  let read;
  if (grids.length) {
    const months = {};
    grids.forEach((g) => (months[g.month] = true));
    read = {
      events: [].concat(...grids.map((g) => g.events)),
      skipped: 0,
      headers: ["달력 모양 탭 " + grids.length + "개 (" + grids.map((g) => g.tab + " " + g.events.length + "개").join(", ") + ")"],
      sample: [],
      tab: grids.map((g) => g.tab).join(", "),
      months: months,
    };
  } else {
    read = schoolReadList_(source);
    read.months = null;
  }
  // 같은 날 같은 제목이 또 있으면 #2, #3 을 붙여 구별한다.
  const seen = {};
  read.events.forEach((e) => {
    const k = e.start + "|" + e.title;
    seen[k] = (seen[k] || 0) + 1;
    e.key = seen[k] > 1 ? k + "#" + seen[k] : k;
  });
  return read;
}

// 캘린더 탭에 반영한다. 반환: { added, updated, removed, lines[] }
// force: "" = 평소, "auto" = 가져온 줄을 모두 원본대로 다시 적음 ('직접 고침' 줄은 그대로), "all" = '직접 고침' 줄까지
function schoolApply_(events, months, force) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(CAL_SHEET);
  if (!sh) throw new Error("이 시트에 '" + CAL_SHEET + "' 탭이 없어요.");
  const tz = schoolTz_();
  const today = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
  let width = Math.max(sh.getLastColumn(), 1);
  let head = sh.getRange(1, 1, 1, width).getValues()[0].map(normHead_);
  let keyCol = head.indexOf(normHead_(SCHOOL_KEY_HEADER));
  if (keyCol < 0) {
    keyCol = width; // 맨 끝에 '학사 일정 키' 칸을 만든다. (앱은 이 칸을 읽지 않는다)
    sh.getRange(1, keyCol + 1).setValue(SCHOOL_KEY_HEADER).setFontColor("#999999");
    width = keyCol + 1;
    head = sh.getRange(1, 1, 1, width).getValues()[0].map(normHead_);
  }
  let stCol = head.indexOf(normHead_(SCHOOL_STATE_HEADER));
  if (stCol < 0) {
    stCol = width; // 그 옆에 '학사 일정 상태' 칸 (직접 고친 줄을 알아보는 데 쓴다)
    sh.getRange(1, stCol + 1).setValue(SCHOOL_STATE_HEADER).setFontColor("#999999");
    width = stCol + 1;
    head = sh.getRange(1, 1, 1, width).getValues()[0].map(normHead_);
  }
  const find = (names) => names.map((n) => head.indexOf(n)).find((i) => i >= 0);
  const c = {
    title: find(["제목"]),
    cat: find(["구분"]),
    start: find(["시작일", "날짜"]),
    end: find(["종료일"]),
    time: find(["시간"]),
    place: find(["장소"]),
    memo: find(["메모"]),
  };
  if (c.title === undefined || c.start === undefined) throw new Error("'" + CAL_SHEET + "' 탭 첫 줄에 '제목'과 '시작일'(또는 '날짜') 칸이 있어야 해요.");

  const last = sh.getLastRow();
  const rows = last > 1 ? sh.getRange(2, 1, last - 1, width).getValues() : [];
  const cell = (v, kind) => {
    if (kind === "start" || kind === "end") return schoolDate_(v, { year: 0, schoolYear: false }, tz);
    if (kind === "time") return schoolTime_(v, tz);
    // 수식 막으려고 앞에 붙인 ' 는 값이 아니므로 떼고 비교
    return String(v === null || v === undefined ? "" : v).trim().replace(/^'(?=[=+\-@])/, "");
  };
  const toCell = (kind, v) => {
    if (!v) return "";
    if (kind === "start" || kind === "end") {
      // 시트의 시간대 기준 자정으로 만든다. (스크립트 시간대로 만들면 시트에서 하루 앞당겨 보일 수 있다)
      return Utilities.parseDate(v, tz, "yyyy-MM-dd");
    }
    return /^[=+\-@]/.test(v) ? "'" + v : v; // 수식으로 바뀌지 않게
  };
  const FIELDS = ["title", "cat", "start", "end", "time", "place", "memo"];
  const byKey = {};
  events.forEach((e) => {
    // 구분은 앱 목록에 있는 이름만 쓴다 (원본에 구분 칸이 없으면 undefined → 처음 넣을 때 '그 외')
    if (e.cat !== undefined && !CATEGORIES.some((x) => x[0] === e.cat)) e.cat = SCHOOL_CATEGORY;
    byKey[e.key] = e;
  });

  // 직접 적은 일정(키 없음)을 날짜+제목으로 찾아 둔다. 원본과 같은 일정이면 새로 넣지 않고 그 줄을 이어받는다.
  const sameKey = (start, title) => start + "|" + String(title).replace(/\s+/g, " ").trim();
  const manual = {};
  rows.forEach((row, i) => {
    if (String(row[keyCol]).trim()) return;
    const k = sameKey(cell(row[c.start], "start"), cell(row[c.title], "title"));
    (manual[k] = manual[k] || []).push(i);
  });
  const adopt = (e) => {
    const list = manual[sameKey(e.start, e.title)];
    if (!list || !list.length) return false;
    const j = list.shift();
    sh.getRange(j + 2, keyCol + 1).setValue(e.key);
    // 직접 적어 둔 줄이 원본과 다르면(구분 등) 사람이 정한 것이므로 지킨다.
    state[j] = sigRow(rows[j], e) === sigEvent(e) ? stamp(sigEvent(e)) : SCHOOL_LOCKED;
    return true;
  };
  let merged = 0;

  // 직접 고친 줄 알아보기: 스크립트가 마지막으로 적은 값의 지문을 '학사 일정 상태' 칸에 남겨 두고,
  // 다음에 볼 때 줄 내용이 그 지문과 다르면 사람이 고친 것 → '직접 고침' 으로 표시하고 다시는 건드리지 않는다.
  const fieldsOf = (e) => FIELDS.filter((f) => c[f] !== undefined && e[f] !== undefined);
  const sigRow = (row, e) => fieldsOf(e).map((f) => f + "=" + cell(row[c[f]], f)).join("\n");
  const sigEvent = (e) => fieldsOf(e).map((f) => f + "=" + (e[f] || "")).join("\n");
  const stamp = (sig) => "자동 " + Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, sig)).replace(/[^A-Za-z0-9]/g, "").slice(0, 6);
  const state = rows.map((row) => String(row[stCol] || "").trim());

  const lines = [];
  const now = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm");
  const log = (kind, e, detail) => lines.push([now, kind, e.start, e.title, detail || ""]);
  let updated = 0;
  const toDelete = [];
  const have = {};
  rows.forEach((row, i) => {
    const key = String(row[keyCol]).trim();
    if (!key) return; // 직접 적은 일정
    have[key] = true;
    // 직접 고친 줄은 원본이 바뀌거나 없어져도 그대로 둔다.
    if (state[i] === SCHOOL_LOCKED && force !== "all") return;
    const e = byKey[key];
    // 같은 일정을 직접 적어 둔 줄이 있으면 그 줄을 남기고, 가져온 줄은 지운다.
    if (e && adopt(e)) {
      toDelete.push(i + 2);
      merged++;
      return;
    }
    if (!e) {
      // 다시 맞추기: 원본에서 없어진 줄도 키(원본 날짜|제목)로 날짜·제목을 되살린다.
      const km = key.match(/^(\d{4}-\d\d-\d\d)\|(.*?)(#\d+)?$/);
      if (force && km) {
        if (cell(row[c.start], "start") !== km[1]) sh.getRange(i + 2, c.start + 1).setValue(toCell("start", km[1]));
        if (cell(row[c.title], "title") !== km[2]) sh.getRange(i + 2, c.title + 1).setValue(toCell("title", km[2]));
        row[c.start] = km[1];
      }
      const start = cell(row[c.start], "start");
      // 이미 지난 일정은 원본에서 지워져도 기록으로 남긴다. 이번에 못 읽은 달의 일정도 그대로 둔다.
      if (start && start < today) return;
      if (months && !months[start.slice(0, 7)]) return;
      toDelete.push(i + 2);
      log("빠짐", { start: start, title: cell(row[c.title], "title") }, "원본에서 없어져 캘린더에서 뺐어요");
      return;
    }
    const cur = sigRow(row, e);
    const edited = !force && (state[i] ? state[i] !== stamp(cur) : cur !== sigEvent(e));
    if (edited) {
      state[i] = SCHOOL_LOCKED;
      log("직접 고침", e, "캘린더에서 직접 고친 줄이라 앞으로 자동으로 바꾸지 않아요 ('학사 일정 상태' 칸을 지우면 다시 자동)");
      return;
    }
    state[i] = stamp(sigEvent(e));
    const changes = [];
    FIELDS.forEach((f) => {
      // 원본에 없는 칸(달력 모양의 시간·장소·메모)은 캘린더에 적힌 걸 그대로 둔다.
      if (c[f] === undefined || e[f] === undefined) return;
      const before = cell(row[c[f]], f);
      if (before !== (e[f] || "")) {
        changes.push({ title: "제목", cat: "구분", start: "시작일", end: "종료일", time: "시간", place: "장소", memo: "메모" }[f] + ": " + (before || "(없음)") + " → " + (e[f] || "(없음)"));
        sh.getRange(i + 2, c[f] + 1).setValue(toCell(f, e[f] || ""));
      }
    });
    if (changes.length) {
      updated++;
      log("바뀜", e, changes.join(", "));
    }
  });
  // 캘린더에 넣은 적 있는데 지금 캘린더에 없는 일정 = 사람이 지운 것 → 다시 넣지 않는다.
  const list = schoolList_(have);
  let gone = 0;
  // 새 일정 중 직접 적어 둔 것과 같은 건 그 줄을 이어받는다. (줄을 지우기 전에 해야 줄 번호가 맞다)
  const fresh = events.filter((e) => {
    if (have[e.key]) return false;
    const was = list.known[e.key];
    if (was) {
      if (was.status !== SCHOOL_GONE) {
        was.status = SCHOOL_GONE;
        was.changed = now;
        log("지움", e, "캘린더에서 지운 일정이라 다시 넣지 않아요 (되살리려면 메뉴 '지운 학사 일정 되살리기')");
      }
      gone++;
      return false;
    }
    if (adopt(e)) {
      merged++;
      return false;
    }
    return true;
  });
  if (rows.length) sh.getRange(2, stCol + 1, rows.length, 1).setValues(state.map((v) => [v]));
  toDelete.reverse().forEach((r) => sh.deleteRow(r));

  if (fresh.length) {
    const out = fresh.map((e) => {
      const row = new Array(width).fill("");
      FIELDS.forEach((f) => c[f] !== undefined && (row[c[f]] = toCell(f, e[f] || "")));
      if (c.cat !== undefined) row[c.cat] = e.cat || SCHOOL_CATEGORY;
      row[keyCol] = e.key;
      row[stCol] = stamp(sigEvent(e));
      log("추가", e, [e.end && "~" + e.end, e.time, e.place].filter(Boolean).join(" "));
      return row;
    });
    const at = sh.getLastRow() + 1;
    // 탭의 줄이 모자라면 늘리고, 늘어난 줄에도 구분 색이 칠해지게 색 규칙을 다시 건다.
    if (ensureRows_(sh, at + out.length - 1)) setupCalendarColors_();
    sh.getRange(at, 1, out.length, width).setValues(out);
  }
  // 처음 가져올 때는 일정마다 '추가'를 적으면 기록이 너무 길어지므로 한 줄로 요약한다.
  if (!Object.keys(have).length && fresh.length) {
    lines.length = 0;
    lines.push([now, "처음 가져옴", "", fresh.length + "개 일정을 캘린더에 넣었어요", "이후 바뀌는 것부터 한 줄씩 적혀요"]);
  }
  if (merged) lines.push([now, "합침", "", merged + "개 일정", "직접 적어 둔 같은 일정(날짜·제목이 같음)과 하나로 합쳤어요"]);
  // 목록 갱신: 지금 캘린더에 있는 키는 '있음', 지운 건 '지움'. 원본에도 캘린더에도 없는 키는 정리한다.
  const inCal = {};
  sh.getRange(2, keyCol + 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues().forEach((r) => r[0] && (inCal[String(r[0]).trim()] = true));
  const out = [];
  const seenKey = {};
  Object.keys(inCal).forEach((k) => {
    seenKey[k] = true;
    const old = list.known[k];
    out.push([k, "있음", k.split("|")[0], k.split("|").slice(1).join("|"), old && old.status === "있음" ? old.changed : now]);
  });
  Object.keys(list.known).forEach((k) => {
    const o = list.known[k];
    if (seenKey[k] || o.status !== SCHOOL_GONE || !byKey[k]) return;
    out.push([k, SCHOOL_GONE, k.split("|")[0], k.split("|").slice(1).join("|"), o.changed]);
  });
  schoolListWrite_(list.sheet, out);
  if (lines.length) schoolLog_(lines);
  return { added: fresh.length, updated: updated, removed: toDelete.length - merged, merged: merged, gone: gone, lines: lines };
}

// 숨김 탭 '학사 일정 목록'을 읽는다. 처음이면 만들고, 지금 캘린더에 있는 키로 시작한다.
function schoolList_(have) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SCHOOL_LIST_SHEET);
  const known = {};
  if (!sh) {
    sh = ss.insertSheet(SCHOOL_LIST_SHEET);
    sh.hideSheet();
    Object.keys(have).forEach((k) => (known[k] = { status: "있음", changed: "" }));
    return { sheet: sh, known: known };
  }
  const last = sh.getLastRow();
  if (last > 1)
    sh.getRange(2, 1, last - 1, 5)
      .getValues()
      .forEach((r) => {
        const k = String(r[0]).trim();
        if (k) known[k] = { status: String(r[1]).trim(), changed: r[4] };
      });
  return { sheet: sh, known: known };
}

function schoolListWrite_(sh, rows) {
  sh.clearContents();
  ensureRows_(sh, rows.length + 1);
  sh.getRange(1, 1, 1, 5).setValues([["학사 일정 키", "상태", "날짜", "제목", "바뀐 시각"]]).setFontWeight("bold");
  if (rows.length) sh.getRange(2, 1, rows.length, 5).setValues(rows.map((r) => r.map((v) => (/^[=+\-@]/.test(String(v)) ? "'" + v : v))));
}

// '학사 일정 기록' 탭 맨 위(2번째 줄)에 최근 것부터 쌓는다. 2,000줄이 넘으면 오래된 것부터 지운다.
function schoolLog_(lines) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SCHOOL_LOG_SHEET);
  if (!sh) {
    sh = ss.insertSheet(SCHOOL_LOG_SHEET);
    sh.getRange(1, 1, 1, 5).setValues([["확인 시각", "변경", "날짜", "제목", "내용"]]).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  // 칸 너비·줄바꿈 (탭을 처음 만든 뒤에도 매번 맞춰 둔다)
  [150, 90, 95, 260, 300].forEach((w, i) => sh.setColumnWidth(i + 1, w));
  sh.insertRowsAfter(1, lines.length);
  sh.getRange(2, 1, lines.length, 5)
    .setValues(lines.map((l) => l.map((v) => (/^[=+\-@]/.test(String(v)) ? "'" + v : v))))
    .setFontWeight("normal")
    .setWrap(true)
    .setVerticalAlignment("top");
  const extra = sh.getLastRow() - 2001;
  if (extra > 0) sh.deleteRows(2002, extra);
}

function schoolSync_(force) {
  const url = props().getProperty("SCHOOL_URL");
  if (!url) throw new Error("아직 학사 일정 시트를 연결하지 않았어요. [" + MENU + " → 학사 일정 연결하기] 를 먼저 해 주세요.");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error("다른 가져오기가 진행 중이에요. 잠시 뒤 다시 해 주세요.");
  try {
    const read = schoolRead_(schoolSource_(url));
    // 원본을 하나도 못 읽었으면 (탭 구조가 바뀌었거나 비었으면) 캘린더를 건드리지 않는다.
    if (!read.events.length) throw new Error("원본 '" + read.tab + "' 탭에서 일정을 하나도 읽지 못해 캘린더는 그대로 두었어요. 탭 모양(요일 머리글·날짜 칸)이 바뀌었는지 확인해 주세요.");
    const r = schoolApply_(read.events, read.months, force || "");
    r.total = read.events.length;
    r.skipped = read.skipped;
    return r;
  } finally {
    lock.releaseLock();
  }
}

const schoolSummary_ = (r) =>
  "추가 " + r.added + " · 바뀜 " + r.updated + " · 빠짐 " + r.removed + (r.merged ? " · 직접 적은 일정과 합침 " + r.merged : "") + (r.gone ? " · 직접 지워서 안 넣은 일정 " + r.gone : "") + " (원본 일정 " + r.total + "개" + (r.skipped ? ", 날짜를 못 읽어 건너뛴 줄 " + r.skipped + "개" : "") + ")";

function schoolInstallTrigger_() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === SCHOOL_TRIGGER)
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger(SCHOOL_TRIGGER).timeBased().everyHours(1).create();
}

// 1시간마다 자동 실행. 바뀐 게 있거나 문제가 생기면 메일로 알린다.
function schoolSyncTrigger() {
  const to = Session.getEffectiveUser().getEmail();
  const sheetUrl = SpreadsheetApp.getActive().getUrl();
  try {
    const r = schoolSync_();
    if (!r.lines.length) return;
    const body = r.lines
      .slice(0, 50)
      .map((l) => "[" + l[1] + "] " + l[2] + " " + l[3] + (l[4] ? " — " + l[4] : ""))
      .join("\n");
    MailApp.sendEmail(
      to,
      "[기윤실 앱] 학사 일정이 바뀌어 캘린더에 반영했어요 (" + (r.added + r.updated + r.removed) + "건)",
      schoolSummary_(r) + "\n\n" + body + (r.lines.length > 50 ? "\n… 외 " + (r.lines.length - 50) + "건" : "") +
        "\n\n전체 기록: 시트의 '" + SCHOOL_LOG_SHEET + "' 탭\n" + sheetUrl,
    );
  } catch (err) {
    // 같은 오류 메일은 하루에 한 번만
    const cache = CacheService.getScriptCache();
    const k = "school_err_" + Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(err.message))).slice(0, 20);
    if (cache.get(k)) return;
    cache.put(k, "1", 6 * 60 * 60);
    MailApp.sendEmail(to, "[기윤실 앱] 학사 일정을 가져오지 못했어요", err.message + "\n\n" + sheetUrl);
  }
}

function menuSchoolConnect() {
  const ui = SpreadsheetApp.getUi();
  const now = props().getProperty("SCHOOL_URL");
  const r = ui.prompt(
    "학사 일정 연결하기",
    (now ? "지금 연결된 주소:\n" + now + "\n\n" : "") +
      "학사 일정이 있는 구글 시트에서 그 탭을 연 상태의 주소를 통째로 복사해 붙여넣어 주세요.\n(주소 끝의 gid=… 로 탭을 찾아요)",
    ui.ButtonSet.OK_CANCEL,
  );
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const url = r.getResponseText().trim();
  let read;
  try {
    read = schoolRead_(schoolSource_(url));
  } catch (err) {
    ui.alert(err.message + "\n(아무것도 바뀌지 않았어요)");
    return;
  }
  if (!read.events.length) {
    ui.alert(
      "일정을 읽지 못했어요",
      "'" + read.tab + "' 탭에서 제목과 날짜 칸을 찾지 못했어요. (아무것도 바뀌지 않았어요)\n\n" +
        "탭 위쪽 내용:\n" + (read.sample.join("\n") || "(비어 있음)") +
        "\n\n달력 모양이면 요일(일~토) 머리글과 날짜 숫자, '10월' 같은 달 표시가 있어야 하고,\n목록 모양이면 첫 줄에 '행사'(또는 '제목'), '날짜'(또는 '월'·'일') 머리글이 있어야 해요.\n이 화면을 캡처해 보내주시면 맞춰 드릴게요.",
      ui.ButtonSet.OK,
    );
    return;
  }
  const ex = read.events.slice(0, 5).map((e) => "· " + e.start + (e.end ? "~" + e.end.slice(5) : "") + " " + e.title).join("\n");
  const ok = ui.alert(
    "학사 일정 " + read.events.length + "개를 찾았어요",
    "읽은 곳: " + read.headers.join(", ") + "\n\n" + ex +
      (read.events.length > 5 ? "\n…" : "") +
      (read.skipped ? "\n\n날짜를 못 읽어 건너뛴 줄: " + read.skipped + "개" : "") +
      "\n\n'" + CAL_SHEET + "' 탭에 넣고, 앞으로 1시간마다 확인해서 바뀌면 반영하고 메일로 알려 드릴까요?",
    ui.ButtonSet.YES_NO,
  );
  if (ok !== ui.Button.YES) return;
  props().setProperty("SCHOOL_URL", url);
  try {
    const res = schoolSync_();
    schoolInstallTrigger_();
    ui.alert("연결했어요", schoolSummary_(res) + "\n\n이제 1시간마다 자동으로 확인해요. 바뀐 내용은 '" + SCHOOL_LOG_SHEET + "' 탭과 메일로 알려 드려요.", ui.ButtonSet.OK);
  } catch (err) {
    ui.alert(err.message);
  }
}

function menuSchoolSyncNow() {
  const ui = SpreadsheetApp.getUi();
  try {
    ui.alert("학사 일정 가져오기", schoolSummary_(schoolSync_()), ui.ButtonSet.OK);
  } catch (err) {
    ui.alert(err.message);
  }
}

function menuSchoolStop() {
  const ui = SpreadsheetApp.getUi();
  const ts = ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === SCHOOL_TRIGGER);
  ts.forEach((t) => ScriptApp.deleteTrigger(t));
  ui.alert(ts.length ? "자동 가져오기를 껐어요. 캘린더에 이미 들어간 일정은 그대로 있어요.\n다시 켜려면 [학사 일정 연결하기] 를 해 주세요." : "자동 가져오기가 켜져 있지 않아요.");
}

// 캘린더 탭의 칸이 밀리거나(셀 삽입·삭제, 일부 칸만 정렬) 내용이 엉켰을 때:
// 가져온 줄을 '학사 일정 키'(원본 날짜·제목)를 기준으로 원본과 똑같이 다시 적는다. 직접 적은 줄(키 없음)은 건드리지 않는다.
function menuSchoolRealign() {
  const ui = SpreadsheetApp.getUi();
  const a = ui.alert(
    "학사 일정 다시 맞추기",
    "원본에서 가져온 줄(오른쪽에 '학사 일정 키'가 있는 줄)의 제목·구분·날짜를 원본과 똑같이 다시 적어요.\n" +
      "직접 적은 줄(키가 빈 줄)은 건드리지 않아요.\n\n" +
      "'직접 고침' 표시된 줄도 원본대로 되돌릴까요?\n" +
      "  예: 전부 원본대로\n  아니오: '직접 고침' 줄은 그대로 두고 나머지만\n  취소: 아무것도 안 함",
    ui.ButtonSet.YES_NO_CANCEL,
  );
  if (a !== ui.Button.YES && a !== ui.Button.NO) return;
  try {
    ui.alert("다시 맞췄어요", schoolSummary_(schoolSync_(a === ui.Button.YES ? "all" : "auto")), ui.ButtonSet.OK);
  } catch (err) {
    ui.alert(err.message);
  }
}

// 캘린더에서 지운 학사 일정을 다시 넣는다. ('학사 일정 목록'에서 '지움' 표시를 없애고 가져오기)
function menuSchoolRestore() {
  const ui = SpreadsheetApp.getUi();
  const sh = SpreadsheetApp.getActive().getSheetByName(SCHOOL_LIST_SHEET);
  const last = sh ? sh.getLastRow() : 0;
  const rows = last > 1 ? sh.getRange(2, 1, last - 1, 5).getValues() : [];
  const goneRows = rows.filter((r) => String(r[1]).trim() === SCHOOL_GONE);
  if (!goneRows.length) {
    ui.alert("직접 지워서 빠져 있는 학사 일정이 없어요.");
    return;
  }
  const list = goneRows.slice(0, 15).map((r) => "· " + r[2] + " " + r[3]).join("\n");
  if (
    ui.alert(
      "지운 학사 일정 " + goneRows.length + "개",
      list + (goneRows.length > 15 ? "\n…" : "") + "\n\n모두 캘린더에 다시 넣을까요?\n(하나만 되살리려면 숨김 탭 '" + SCHOOL_LIST_SHEET + "'에서 그 줄을 지우고 '지금 가져오기')",
      ui.ButtonSet.YES_NO,
    ) !== ui.Button.YES
  )
    return;
  schoolListWrite_(sh, rows.filter((r) => String(r[1]).trim() !== SCHOOL_GONE));
  try {
    ui.alert("되살렸어요", schoolSummary_(schoolSync_()), ui.ButtonSet.OK);
  } catch (err) {
    ui.alert(err.message);
  }
}

// 탭의 줄 수가 need 보다 적으면 끝에 줄을 더한다. (스크립트로 쓸 때는 시트가 줄을 자동으로 늘려 주지 않는다)
// 한 번에 넉넉히(최소 500줄) 늘려서 자주 늘리지 않게 한다. 늘렸으면 true.
function ensureRows_(sh, need) {
  const max = sh.getMaxRows();
  if (need <= max) return false;
  sh.insertRowsAfter(max, Math.max(need - max, 500));
  return true;
}
