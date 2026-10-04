import * as store from "./store.js";
import { ROLES, can, displayId } from "./store.js";
import { ORG, LOCAL_INTRO, SPECIAL_INTRO, LOCAL_GROUPS, SPECIAL_GROUPS, LINKS, JOIN } from "./content.js";

const $view = document.getElementById("view");
const $account = document.getElementById("account");
const $dialog = document.getElementById("dialog");
const $toast = document.getElementById("toast");
const $banner = document.getElementById("demo-banner");

const state = {
  user: null,
  role: "guest",
  events: [],
  prayers: [],
  newsletters: [],
  photos: [],
  donors: [],
  donorsError: null,
  roles: [],
  cal: (() => {
    const t = new Date();
    return { year: t.getFullYear(), month: t.getMonth(), selected: ymd(t) };
  })(),
  donorQuery: "",
};

// ---------------------------------------------------------------
// 유틸
// ---------------------------------------------------------------
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtDate(s) {
  if (!s) return "";
  const [y, m, d] = s.split("-").map(Number);
  const dow = "일월화수목금토"[new Date(y, m - 1, d).getDay()];
  return `${y}. ${m}. ${d}. (${dow})`;
}
function fmtStamp(row) {
  if (!row.updatedBy) return "";
  const t = row.updatedAt?.toDate ? row.updatedAt.toDate() : row.updatedAt ? new Date(row.updatedAt) : null;
  const when = t ? ` · ${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}` : "";
  return `마지막 수정: ${displayId(row.updatedBy)}${when}`;
}
function safeUrl(u) {
  return /^https?:\/\//i.test(u || "") ? u : "";
}
function toast(msg) {
  $toast.textContent = msg;
  $toast.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => $toast.classList.remove("show"), 2400);
}
function errMsg(e) {
  if (/auth\/(invalid-credential|wrong-password|user-not-found|invalid-email)/.test(e?.code || "")) return "아이디 또는 비밀번호가 맞지 않습니다.";
  if (e?.code === "auth/too-many-requests") return "시도가 너무 많습니다. 잠시 후 다시 해 주세요.";
  if (e?.code === "auth/popup-closed-by-user") return "로그인을 취소했습니다.";
  if (e?.code === "permission-denied" || /permission/i.test(e?.message || "")) return "권한이 없습니다. 관리자에게 권한을 요청하세요.";
  return "오류가 발생했습니다: " + (e?.message || e);
}
const ROLE_CHOICES = ["admin", "editor", "calendar", "member"];
const byDateDesc = (a, b) => (b.date || "").localeCompare(a.date || "");
const byDateAsc = (a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || ""));

function eventsOn(day) {
  return state.events.filter((e) => e.date <= day && day <= (e.endDate || e.date)).sort(byDateAsc);
}

// ---------------------------------------------------------------
// 대화상자 폼
// ---------------------------------------------------------------
function openForm({ title, fields, values = {}, submitLabel = "저장", onSubmit, onDelete }) {
  const inputs = fields
    .map((f) => {
      const v = values[f.name] ?? f.default ?? "";
      const req = f.required ? "required" : "";
      let control;
      if (f.type === "textarea") control = `<textarea name="${f.name}" ${req} placeholder="${esc(f.placeholder || "")}">${esc(v)}</textarea>`;
      else if (f.type === "select")
        control = `<select name="${f.name}" ${req}>${f.options.map(([val, lab]) => `<option value="${esc(val)}" ${val === v ? "selected" : ""}>${esc(lab)}</option>`).join("")}</select>`;
      else control = `<input name="${f.name}" type="${f.type || "text"}" value="${esc(v)}" ${req} placeholder="${esc(f.placeholder || "")}" />`;
      return `<label class="field">${esc(f.label)}${control}</label>`;
    })
    .join("");
  $dialog.innerHTML = `
    <form method="dialog">
      <h2>${esc(title)}</h2>
      ${inputs}
      <div class="actions">
        ${onDelete ? `<button type="button" class="btn danger" data-act="delete" style="margin-right:auto">삭제</button>` : ""}
        <button type="button" class="btn" data-act="cancel">취소</button>
        <button type="submit" class="btn primary">${esc(submitLabel)}</button>
      </div>
    </form>`;
  const form = $dialog.querySelector("form");
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    for (const k in data) data[k] = data[k].trim();
    try {
      await onSubmit(data);
      $dialog.close();
      toast("저장했습니다.");
    } catch (e) {
      toast(errMsg(e));
    }
  });
  form.querySelector('[data-act="cancel"]').onclick = () => $dialog.close();
  if (onDelete)
    form.querySelector('[data-act="delete"]').onclick = async () => {
      if (!confirm("정말 삭제할까요?")) return;
      try {
        await onDelete();
        $dialog.close();
        toast("삭제했습니다.");
      } catch (e) {
        toast(errMsg(e));
      }
    };
  $dialog.showModal();
}

// ---------------------------------------------------------------
// 화면들
// ---------------------------------------------------------------
const views = {
  home() {
    const today = ymd(new Date());
    const upcoming = state.events.filter((e) => (e.endDate || e.date) >= today).sort(byDateAsc).slice(0, 3);
    const prayer = [...state.prayers].sort(byDateDesc)[0];
    const news = [...state.newsletters].sort(byDateDesc)[0];
    return `
      <div class="hero">
        <div class="slogan">교육의 길이 되는</div>
        <h1>${esc(ORG.name)}</h1>
        <div class="tag">함께 · 기쁘게 · 용기 있게</div>
      </div>
      <div class="cta-row">
        <a class="btn primary" href="#/join">회원가입 안내</a>
        <a class="btn" href="${esc(LINKS[0].url)}" target="_blank" rel="noopener">가보고 싶어요 ↗</a>
      </div>

      <h3>다가오는 일정</h3>
      ${upcoming.length ? upcoming.map(eventCard).join("") : `<div class="card empty">예정된 일정이 없습니다.</div>`}
      <a class="btn" href="#/calendar">캘린더 전체 보기 →</a>

      <h3>이번 기도문</h3>
      ${prayer ? prayerCard(prayer, true) : `<div class="card empty">등록된 기도문이 없습니다.</div>`}

      <h3>최근 소식지</h3>
      ${news ? newsCard(news) : `<div class="card empty">등록된 소식지가 없습니다.</div>`}
    `;
  },

  calendar() {
    const { year, month, selected } = state.cal;
    const first = new Date(year, month, 1);
    const start = new Date(year, month, 1 - first.getDay());
    const today = ymd(new Date());
    const editable = can(state.role, "events.write");
    let cells = "";
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      if (i === 35 && d.getMonth() !== month) break; // 5주로 끝나는 달
      const key = ymd(d);
      const evs = eventsOn(key);
      const cls = ["cal-day", d.getMonth() !== month && "other", key === today && "today", key === selected && "selected", d.getDay() === 0 && "sun"].filter(Boolean).join(" ");
      cells += `<button class="${cls}" data-day="${key}" aria-label="${fmtDate(key)} 일정 ${evs.length}개">
        <span class="num">${d.getDate()}</span>
        ${evs.slice(0, 2).map((e) => `<span class="cal-chip">${esc(e.title)}</span>`).join("")}
        ${evs.length > 2 ? `<span class="cal-chip">+${evs.length - 2}</span>` : ""}
      </button>`;
    }
    const dayEvents = eventsOn(selected);
    return `
      <div class="section-title">📅 캘린더</div>
      <div class="cal-head">
        <button class="btn small" data-act="prev" aria-label="이전 달">‹</button>
        <strong>${year}년 ${month + 1}월</strong>
        <button class="btn small" data-act="next" aria-label="다음 달">›</button>
      </div>
      <div class="cal-grid">
        ${[..."일월화수목금토"].map((d) => `<div class="cal-dow">${d}</div>`).join("")}
        ${cells}
      </div>

      <div class="row" style="margin-top:16px">
        <h3 style="margin:0">${fmtDate(selected)}</h3>
        ${editable ? `<button class="btn primary small" data-act="add-event">+ 일정 추가</button>` : ""}
      </div>
      <div style="margin-top:8px">
        ${dayEvents.length ? dayEvents.map(eventCard).join("") : `<div class="card empty">이 날은 일정이 없습니다.</div>`}
      </div>
      ${editable ? "" : `<p class="notice">일정은 <b>편집자</b> 이상 권한이 있는 분만 추가·수정할 수 있어요. ${state.user ? "권한이 필요하면 관리자에게 요청해 주세요." : "로그인 후 관리자에게 권한을 요청해 주세요."}</p>`}
    `;
  },

  photos() {
    const editable = can(state.role, "photos.write");
    const list = [...state.photos].sort((a, b) => (b.date || "").localeCompare(a.date || "") || String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return `
      <div class="row">
        <div class="section-title">📷 사진</div>
        ${editable ? `<label class="btn primary small">+ 사진 올리기<input type="file" accept="image/*" multiple hidden data-act="upload" /></label>` : ""}
      </div>
      <div id="upload-status" class="meta"></div>
      ${list.length ? `<div class="gallery">${list.map((p) => `
        <button class="photo" data-photo="${esc(p.id)}" aria-label="${esc(p.caption || "사진")}">
          <img src="${esc(p.thumb)}" alt="${esc(p.caption || "")}" loading="lazy" />
          ${p.caption ? `<span>${esc(p.caption)}</span>` : ""}
        </button>`).join("")}</div>` : `<div class="card empty">아직 사진이 없습니다.</div>`}
    `;
  },

  prayers() {
    const editable = can(state.role, "prayers.write");
    const list = [...state.prayers].sort(byDateDesc);
    return `
      <div class="row">
        <div class="section-title">🙏 기도문</div>
        ${editable ? `<button class="btn primary small" data-act="add-prayer">+ 기도문 추가</button>` : ""}
      </div>
      ${list.length ? list.map((p) => prayerCard(p)).join("") : `<div class="card empty">등록된 기도문이 없습니다.</div>`}
    `;
  },

  newsletters() {
    const editable = can(state.role, "newsletters.write");
    const list = [...state.newsletters].sort(byDateDesc);
    return `
      <div class="row">
        <div class="section-title">📰 소식지</div>
        ${editable ? `<button class="btn primary small" data-act="add-news">+ 소식지 추가</button>` : ""}
      </div>
      ${list.length ? list.map(newsCard).join("") : `<div class="card empty">등록된 소식지가 없습니다.</div>`}
    `;
  },

  donors() {
    const head = `<div class="section-title">💚 후원자 명단</div>
      <p class="meta">기윤실교사모임을 위해 기도와 물질로 함께해 주시는 분들께 감사드립니다.</p>`;
    if (!can(state.role, "donors.read")) {
      return `${head}<div class="notice">후원자 명단은 개인정보 보호를 위해 <b>등록된 회원</b>만 볼 수 있어요.
        ${state.user ? "회원 등록은 관리자에게 요청해 주세요." : "먼저 로그인해 주세요."}</div>`;
    }
    if (state.donorsError) return `${head}<div class="notice">${esc(errMsg(state.donorsError))}</div>`;
    const editable = can(state.role, "donors.write");
    const q = state.donorQuery.toLowerCase();
    const list = state.donors.filter((d) => !q || (d.name || "").toLowerCase().includes(q)).sort((a, b) => (a.name || "").localeCompare(b.name || "", "ko"));
    const groups = {};
    for (const d of list) (groups[d.type || "기타"] ||= []).push(d);
    return `
      ${head}
      <div class="row">
        <span class="meta">총 ${state.donors.length}명/곳</span>
        ${editable ? `<button class="btn primary small" data-act="add-donor">+ 후원자 추가</button>` : ""}
      </div>
      <input class="search" type="search" placeholder="이름 검색" value="${esc(state.donorQuery)}" data-act="donor-search" style="margin-top:8px" />
      ${Object.keys(groups).length ? Object.entries(groups)
        .map(([type, rows]) => `
          <h3>${esc(type)} (${rows.length})</h3>
          <div class="chips">${rows
            .map((d) => editable
              ? `<button class="chip" data-edit-donor="${esc(d.id)}" title="${esc(fmtStamp(d))}">${esc(d.name)}${d.since ? ` <span class="meta">${esc(d.since)}~</span>` : ""}</button>`
              : `<span class="chip">${esc(d.name)}</span>`)
            .join("")}</div>`)
        .join("") : `<div class="card empty">명단이 없습니다.</div>`}
    `;
  },

  about() {
    return `
      <div class="section-title">🌸 기윤실교사모임은</div>
      <h3>슬로건</h3>
      <p>${esc(ORG.slogan)}</p>
      <h3>사명</h3>
      <p>${ORG.mission.map(esc).join("<br>")}</p>
      <h3>교사상</h3>
      <ol>${ORG.teacherIdeals.map((t) => `<li>${esc(t)}</li>`).join("")}</ol>

      <div class="section-title" style="margin-top:24px">🍎 지역모임</div>
      <p>${esc(LOCAL_INTRO)}</p>
      <div class="groups">
        ${LOCAL_GROUPS.map((g) => `<div class="group-row"><div class="region">${esc(g.region)}</div>
          <div class="chips">${g.groups.map((n) => `<span class="chip">${esc(n)}</span>`).join("")}</div></div>`).join("")}
      </div>

      <div class="section-title" style="margin-top:24px">🍎 전문모임</div>
      <p>${esc(SPECIAL_INTRO)}</p>
      <div class="chips">${SPECIAL_GROUPS.map((n) => `<span class="chip">${esc(n)}</span>`).join("")}</div>

      <p class="notice" style="margin-top:16px">※ 각 모임 대표의 연락처를 알고자 하시는 분은 기윤실교사모임 공식 연락처인
        <a href="tel:${ORG.phone.replace(/-/g, "")}"><b>${esc(ORG.phone)}</b></a>로 연락 부탁드립니다.</p>

      <h3>바로가기</h3>
      ${LINKS.filter((l) => l.url).map(linkButton).join("")}
      <p class="meta">원본 사이트: <a href="${ORG.site}" target="_blank" rel="noopener">${ORG.site}</a></p>
    `;
  },

  join() {
    return `
      <div class="section-title">🕊️ 회원가입안내</div>
      <p>${esc(JOIN.bylaw)}</p>
      <div class="card highlight">
        <b>| ${esc(JOIN.onePercentTitle)}</b>
        <p style="margin:6px 0 0">${JOIN.onePercent.map(esc).join("<br>")}</p>
      </div>

      <a class="link-btn" href="${esc(JOIN.googleForm)}" target="_blank" rel="noopener">회원가입 구글 폼 작성 👆</a>
      <p class="meta">* 구글 폼 신청서를 작성하시면 담당자와 통화 후 회원 가입(증액)이 완료됩니다.</p>

      <h3>회비납부 신청 방법 (신청서)</h3>
      <p>아래 회원가입신청서 작성 후, 스캔 또는 사진을 찍어 문자, 이메일 중 택하여 발송해주십시오.</p>
      <div class="card">
        📱 <a href="sms:${ORG.phone.replace(/-/g, "")}">${esc(ORG.phone)}</a> (문자)<br>
        ✉️ <a href="mailto:${esc(ORG.email)}">${esc(ORG.email)}</a>
      </div>
      <a class="link-btn" href="${esc(JOIN.applicationFile)}" target="_blank" rel="noopener">회원가입신청서 내려받기 ⬇</a>
      <p class="meta">신청서에는 신규회원가입신청서와 기존회원 증액 신청서가 함께 있습니다.<br>
        * 후원신청서 원본은 '중요증빙자료'이니 꼭 보관 부탁드립니다.</p>
    `;
  },

  admin() {
    if (!can(state.role, "roles.manage")) return `<div class="notice">관리자만 볼 수 있는 화면입니다.</div>`;
    const rows = [...state.roles].sort((a, b) => a.id.localeCompare(b.id));
    const opts = (cur) => ROLE_CHOICES.map((r) => `<option value="${r}" ${r === cur ? "selected" : ""}>${ROLES[r]}</option>`).join("");
    return `
      <div class="section-title">🔑 권한 관리</div>
      <div class="notice">
        <b>관리자</b>: 모든 편집 + 권한 관리<br>
        <b>편집자</b>: 캘린더·기도문·사진 편집, 후원자 명단 보기<br>
        <b>일정 담당</b>: 캘린더만 편집<br>
        <b>회원</b>: 후원자 명단 보기<br>
        등록되지 않은 사람(<b>방문자</b>)은 캘린더·기도문·소식지·사진을 보기만 할 수 있어요.<br><br>
        <b>아이디/비밀번호 계정</b>은 Firebase 콘솔에서 먼저 만든 뒤(README 참고) 여기에 <b>아이디</b>를 등록하세요.<br>
        <b>구글 로그인</b>하는 분은 <b>구글 이메일</b>을 등록하면 됩니다.
      </div>
      <div class="row" style="margin:16px 0 8px">
        <span class="meta">등록된 사람 ${rows.length}명</span>
        <button class="btn primary small" data-act="add-role">+ 사람 추가</button>
      </div>
      <table class="roles">
        <thead><tr><th>아이디 / 이메일</th><th>역할</th><th></th></tr></thead>
        <tbody>
          ${rows.map((r) => `<tr>
            <td>${esc(displayId(r.id))}${r.id === state.user?.email ? " (나)" : ""}</td>
            <td><select data-role-email="${esc(r.id)}" ${r.id === state.user?.email ? "disabled" : ""}>${opts(r.role)}</select></td>
            <td>${r.id === state.user?.email ? "" : `<button class="btn small danger" data-remove-role="${esc(r.id)}">삭제</button>`}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    `;
  },
};

function linkButton(l) {
  const internal = l.url.startsWith("#/");
  const href = internal ? l.url : safeUrl(l.url);
  if (!href) return "";
  return `<a class="link-btn" href="${esc(href)}" ${internal ? "" : 'target="_blank" rel="noopener"'}>${esc(l.label)} 👆</a>`;
}

function eventCard(e) {
  const editable = can(state.role, "events.write");
  const when = e.endDate && e.endDate !== e.date ? `${fmtDate(e.date)} ~ ${fmtDate(e.endDate)}` : fmtDate(e.date);
  return `<div class="card event">
    <div class="row">
      <h4>${esc(e.title)}</h4>
      ${editable ? `<button class="btn small" data-edit-event="${esc(e.id)}">수정</button>` : ""}
    </div>
    <div class="meta">🗓 ${when}${e.time ? ` · ⏰ ${esc(e.time)}` : ""}${e.place ? ` · 📍 ${esc(e.place)}` : ""}</div>
    ${e.memo ? `<div class="prewrap" style="margin-top:6px">${esc(e.memo)}</div>` : ""}
    ${editable && e.updatedBy ? `<div class="meta" style="margin-top:6px;font-size:12px">${esc(fmtStamp(e))}</div>` : ""}
  </div>`;
}

function prayerCard(p, preview = false) {
  const editable = can(state.role, "prayers.write");
  const body = preview && p.body.length > 160 ? p.body.slice(0, 160) + "…" : p.body;
  return `<div class="card">
    <div class="row">
      <h4>${esc(p.title)}</h4>
      ${editable && !preview ? `<button class="btn small" data-edit-prayer="${esc(p.id)}">수정</button>` : ""}
    </div>
    <div class="meta">${fmtDate(p.date)}</div>
    <div class="prewrap" style="margin-top:8px">${esc(body)}</div>
    ${preview ? `<a href="#/prayers" class="meta">기도문 모두 보기 →</a>` : ""}
  </div>`;
}

function newsCard(n) {
  const editable = can(state.role, "newsletters.write");
  const u = safeUrl(n.url);
  return `<div class="card">
    <div class="row">
      <h4>${esc(n.title)}</h4>
      ${editable ? `<button class="btn small" data-edit-news="${esc(n.id)}">수정</button>` : ""}
    </div>
    <div class="meta">${fmtDate(n.date)}</div>
    ${n.summary ? `<div class="prewrap" style="margin-top:6px">${esc(n.summary)}</div>` : ""}
    ${u ? `<a class="btn small" style="margin-top:8px" href="${esc(u)}" target="_blank" rel="noopener">소식지 열기 ↗</a>` : ""}
  </div>`;
}

// ---------------------------------------------------------------
// 편집 폼 정의
// ---------------------------------------------------------------
const EVENT_FIELDS = [
  { name: "title", label: "제목", required: true },
  { name: "date", label: "시작일", type: "date", required: true },
  { name: "endDate", label: "종료일 (하루 일정이면 비워두세요)", type: "date" },
  { name: "time", label: "시간", type: "time" },
  { name: "place", label: "장소" },
  { name: "memo", label: "메모", type: "textarea" },
];
const PRAYER_FIELDS = [
  { name: "title", label: "제목", required: true },
  { name: "date", label: "날짜", type: "date", required: true },
  { name: "body", label: "기도문", type: "textarea", required: true },
];
const NEWS_FIELDS = [
  { name: "title", label: "제목 (예: 2026년 가을호)", required: true },
  { name: "date", label: "발행일", type: "date", required: true },
  { name: "summary", label: "요약", type: "textarea" },
  { name: "url", label: "링크 (PDF, 구글 드라이브, 카페 글 등)", type: "url", placeholder: "https://" },
];
const DONOR_FIELDS = [
  { name: "name", label: "이름", required: true },
  { name: "type", label: "구분", type: "select", options: [["개인", "개인"], ["교회", "교회"], ["단체", "단체"]], default: "개인" },
  { name: "since", label: "후원 시작 연도", placeholder: "2024" },
];

function editor(col, fields, label, row, extraDefaults = {}) {
  openForm({
    title: row ? `${label} 수정` : `${label} 추가`,
    fields,
    values: row || extraDefaults,
    onSubmit: async (data) => {
      if (data.endDate && data.endDate < data.date) throw new Error("종료일이 시작일보다 빠릅니다.");
      return row ? store.update(col, row.id, data) : store.add(col, data);
    },
    onDelete: row ? () => store.remove(col, row.id) : null,
  });
}

// ---------------------------------------------------------------
// 이벤트 처리
// ---------------------------------------------------------------
$view.addEventListener("click", (ev) => {
  const t = ev.target.closest("button, [data-act]");
  if (!t) return;
  const find = (list, id) => list.find((x) => x.id === id);
  const today = ymd(new Date());

  if (t.dataset.day) {
    state.cal.selected = t.dataset.day;
    return render();
  }
  switch (t.dataset.act) {
    case "prev":
    case "next": {
      const d = new Date(state.cal.year, state.cal.month + (t.dataset.act === "next" ? 1 : -1), 1);
      state.cal.year = d.getFullYear();
      state.cal.month = d.getMonth();
      return render();
    }
    case "add-event": return editor("events", EVENT_FIELDS, "일정", null, { date: state.cal.selected });
    case "add-prayer": return editor("prayers", PRAYER_FIELDS, "기도문", null, { date: today });
    case "add-news": return editor("newsletters", NEWS_FIELDS, "소식지", null, { date: today });
    case "add-donor": return editor("donors", DONOR_FIELDS, "후원자", null, { since: String(new Date().getFullYear()) });
    case "add-role":
      return openForm({
        title: "사람 추가",
        fields: [
          { name: "email", label: "아이디 (예: calendar) 또는 구글 이메일", required: true, placeholder: "calendar" },
          { name: "role", label: "역할", type: "select", options: ROLE_CHOICES.map((r) => [r, ROLES[r]]), default: "calendar" },
        ],
        onSubmit: (d) => store.setRole(d.email, d.role),
      });
  }
  if (t.dataset.photo) return openPhoto(find(state.photos, t.dataset.photo));
  if (t.dataset.editEvent) return editor("events", EVENT_FIELDS, "일정", find(state.events, t.dataset.editEvent));
  if (t.dataset.editPrayer) return editor("prayers", PRAYER_FIELDS, "기도문", find(state.prayers, t.dataset.editPrayer));
  if (t.dataset.editNews) return editor("newsletters", NEWS_FIELDS, "소식지", find(state.newsletters, t.dataset.editNews));
  if (t.dataset.editDonor) return editor("donors", DONOR_FIELDS, "후원자", find(state.donors, t.dataset.editDonor));
  if (t.dataset.removeRole) {
    if (!confirm(`${displayId(t.dataset.removeRole)} 의 권한을 삭제할까요?`)) return;
    store.removeRole(t.dataset.removeRole).then(() => toast("삭제했습니다."), (e) => toast(errMsg(e)));
  }
});

$view.addEventListener("change", (ev) => {
  const email = ev.target.dataset.roleEmail;
  if (email) store.setRole(email, ev.target.value).then(() => toast("역할을 바꿨습니다."), (e) => toast(errMsg(e)));
});

$view.addEventListener("change", (ev) => {
  if (ev.target.dataset.act === "upload") uploadPhotos([...ev.target.files]);
});

$view.addEventListener("input", (ev) => {
  if (ev.target.dataset.act !== "donor-search") return;
  state.donorQuery = ev.target.value;
  const pos = ev.target.selectionStart;
  render();
  const el = $view.querySelector('[data-act="donor-search"]');
  el.focus();
  el.setSelectionRange(pos, pos);
});

// ---------------------------------------------------------------
// 사진
// ---------------------------------------------------------------
// 휴대폰 사진은 수 MB 라서 그대로 올리면 무료 저장 한도(문서당 1MB)를 넘는다.
// 브라우저에서 크기를 줄여 JPEG 로 바꾼 뒤 저장한다.
async function shrink(file, maxSide, maxChars) {
  const img = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  for (let q = 0.85; q >= 0.4; q -= 0.1) {
    const url = canvas.toDataURL("image/jpeg", q);
    if (url.length <= maxChars) return url;
  }
  if (maxSide > 600) return shrink(file, Math.round(maxSide * 0.75), maxChars);
  throw new Error("사진을 줄이지 못했습니다.");
}

async function uploadPhotos(files) {
  if (!files.length) return;
  const caption = files.length === 1 ? prompt("사진 설명 (비워도 됩니다)", "") : prompt(`사진 ${files.length}장의 공통 설명 (비워도 됩니다)`, "");
  if (caption === null) return render();
  const status = () => $view.querySelector("#upload-status");
  let done = 0;
  for (const f of files) {
    if (status()) status().textContent = `올리는 중… (${done + 1}/${files.length})`;
    try {
      const [thumb, full] = await Promise.all([shrink(f, 480, 120_000), shrink(f, 1600, 900_000)]);
      await store.addPhoto({ caption: caption.trim(), date: ymd(new Date()), thumb }, full);
      done++;
    } catch (e) {
      toast(`${f.name}: ${errMsg(e)}`);
    }
  }
  toast(`사진 ${done}장을 올렸습니다.`);
  render();
}

async function openPhoto(p) {
  if (!p) return;
  const editable = can(state.role, "photos.write");
  $dialog.innerHTML = `
    <form method="dialog" class="lightbox">
      <img src="${esc(p.thumb)}" alt="${esc(p.caption || "")}" />
      ${p.caption ? `<div>${esc(p.caption)}</div>` : ""}
      <div class="meta">${fmtDate(p.date)}${editable ? ` · ${esc(fmtStamp(p))}` : ""}</div>
      <div class="actions">
        ${editable ? `<button type="button" class="btn danger" data-act="del" style="margin-right:auto">삭제</button>` : ""}
        <button type="submit" class="btn">닫기</button>
      </div>
    </form>`;
  $dialog.showModal();
  const del = $dialog.querySelector('[data-act="del"]');
  if (del)
    del.onclick = async () => {
      if (!confirm("이 사진을 삭제할까요?")) return;
      try {
        await store.removePhoto(p.id);
        $dialog.close();
        toast("삭제했습니다.");
      } catch (e) {
        toast(errMsg(e));
      }
    };
  try {
    const full = await store.getPhotoFull(p.id);
    const img = $dialog.querySelector(".lightbox img");
    if (full && img) img.src = full;
  } catch {}
}

// ---------------------------------------------------------------
// 로그인 / 계정 표시
// ---------------------------------------------------------------
function renderAccount() {
  if (!state.user) {
    $account.innerHTML = `<button class="btn small primary" id="login">로그인</button>`;
    $account.querySelector("#login").onclick = login;
    return;
  }
  $account.innerHTML = `
    <span class="who" title="${esc(state.user.email)}">${esc(displayId(state.user.name))} · ${ROLES[state.role]}</span>
    ${can(state.role, "roles.manage") ? `<a class="btn small" href="#/admin">권한</a>` : ""}
    <button class="btn small" id="logout">로그아웃</button>`;
  $account.querySelector("#logout").onclick = () => store.signOut();
}

function login() {
  const demo = store.mode === "demo";
  $dialog.innerHTML = `
    <form method="dialog" autocomplete="on">
      <h2>로그인</h2>
      ${demo ? `<p class="notice">데모 아이디: <b>admin</b>(관리자), <b>editor</b>(편집자), <b>calendar</b>(일정 담당), <b>member</b>(회원), <b>guest</b>(미등록) — 비밀번호는 아무거나</p>` : ""}
      <label class="field">아이디<input name="id" required autocomplete="username" autocapitalize="off" /></label>
      <label class="field">비밀번호<input name="pw" type="password" required autocomplete="current-password" /></label>
      <div class="actions">
        <button type="button" class="btn" data-act="cancel">취소</button>
        <button type="submit" class="btn primary">로그인</button>
      </div>
      ${demo ? "" : `<div class="divider">또는</div>
      <button type="button" class="btn" data-act="google">구글 계정으로 로그인</button>`}
    </form>`;
  const form = $dialog.querySelector("form");
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      await store.signInWithId(form.id.value, form.pw.value);
      $dialog.close();
    } catch (e) {
      toast(errMsg(e));
    }
  };
  form.querySelector('[data-act="cancel"]').onclick = () => $dialog.close();
  const g = form.querySelector('[data-act="google"]');
  if (g) g.onclick = () => store.signIn().then(() => $dialog.close(), (e) => toast(errMsg(e)));
  $dialog.showModal();
}

// ---------------------------------------------------------------
// 데이터 구독 (역할이 바뀌면 볼 수 있는 데이터도 바뀐다)
// ---------------------------------------------------------------
const subs = {};
function sub(col, enabled) {
  if (enabled && !subs[col]) {
    subs[col] = store.subscribe(
      col,
      (rows) => {
        state[col] = rows;
        if (col === "donors") state.donorsError = null;
        render();
      },
      (err) => {
        if (col === "donors") state.donorsError = err;
        console.warn(col, err);
        render();
      },
    );
  } else if (!enabled && subs[col]) {
    subs[col]();
    delete subs[col];
    state[col] = [];
  }
}

// ---------------------------------------------------------------
// 라우팅
// ---------------------------------------------------------------
function route() {
  const name = location.hash.replace(/^#\/?/, "").split("?")[0] || "home";
  return views[name] ? name : "home";
}

function render() {
  const r = route();
  $view.innerHTML = views[r]();
  const tab = r === "join" ? "about" : r;
  document.querySelectorAll(".tabbar a").forEach((a) => a.classList.toggle("active", a.dataset.route === tab));
  renderAccount();
}

window.addEventListener("hashchange", () => {
  render();
  window.scrollTo(0, 0);
});

// ---------------------------------------------------------------
// 시작
// ---------------------------------------------------------------
(async function start() {
  await store.init();
  if (store.mode === "demo") {
    $banner.hidden = false;
    $banner.innerHTML = `🧪 <b>데모 모드</b> — 이 브라우저에만 저장됩니다. 오른쪽 위 <b>로그인</b>에서 관리자/편집자/회원으로 바꿔가며 권한을 체험해 보세요.`;
  }
  sub("events", true);
  sub("prayers", true);
  sub("newsletters", true);
  sub("photos", true);
  store.onAuth(({ user, role }) => {
    state.user = user;
    state.role = role;
    sub("donors", false);
    sub("donors", can(role, "donors.read"));
    sub("roles", can(role, "roles.manage"));
    render();
  });
  render();

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
