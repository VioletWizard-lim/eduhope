import * as store from "./store.js";
import { ROLES, can } from "./store.js";
import { ORG, LOCAL_INTRO, SPECIAL_INTRO, LOCAL_GROUPS, SPECIAL_GROUPS, LINKS } from "./content.js";

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
  return `마지막 수정: ${row.updatedBy}${when}`;
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
  if (e?.code === "permission-denied" || /permission/i.test(e?.message || "")) return "권한이 없습니다. 관리자에게 권한을 요청하세요.";
  return "오류가 발생했습니다: " + (e?.message || e);
}
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
      ${LINKS.map((l) => {
        const u = safeUrl(l.url);
        return u
          ? `<a class="link-btn" href="${esc(u)}" target="_blank" rel="noopener">${esc(l.label)} 👆</a>`
          : `<span class="link-btn disabled" title="링크 준비 중">${esc(l.label)}</span>`;
      }).join("")}
      <p class="meta">원본 사이트: <a href="${ORG.site}" target="_blank" rel="noopener">${ORG.site}</a></p>
    `;
  },

  admin() {
    if (!can(state.role, "roles.manage")) return `<div class="notice">관리자만 볼 수 있는 화면입니다.</div>`;
    const rows = [...state.roles].sort((a, b) => a.id.localeCompare(b.id));
    const opts = (cur) => ["admin", "editor", "member"].map((r) => `<option value="${r}" ${r === cur ? "selected" : ""}>${ROLES[r]}</option>`).join("");
    return `
      <div class="section-title">🔑 권한 관리</div>
      <div class="notice">
        <b>관리자</b>: 모든 편집 + 권한 관리<br>
        <b>편집자</b>: 캘린더·기도문 편집, 후원자 명단 보기<br>
        <b>회원</b>: 후원자 명단 보기<br>
        등록되지 않은 사람(<b>방문자</b>)은 캘린더·기도문·소식지를 보기만 할 수 있어요.<br>
        로그인에 쓰는 <b>구글 이메일</b>로 등록해 주세요.
      </div>
      <div class="row" style="margin:16px 0 8px">
        <span class="meta">등록된 사람 ${rows.length}명</span>
        <button class="btn primary small" data-act="add-role">+ 사람 추가</button>
      </div>
      <table class="roles">
        <thead><tr><th>이메일</th><th>역할</th><th></th></tr></thead>
        <tbody>
          ${rows.map((r) => `<tr>
            <td>${esc(r.id)}${r.id === state.user?.email ? " (나)" : ""}</td>
            <td><select data-role-email="${esc(r.id)}" ${r.id === state.user?.email ? "disabled" : ""}>${opts(r.role)}</select></td>
            <td>${r.id === state.user?.email ? "" : `<button class="btn small danger" data-remove-role="${esc(r.id)}">삭제</button>`}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    `;
  },
};

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
          { name: "email", label: "구글 이메일", type: "email", required: true },
          { name: "role", label: "역할", type: "select", options: [["editor", "편집자"], ["member", "회원"], ["admin", "관리자"]], default: "editor" },
        ],
        onSubmit: (d) => store.setRole(d.email, d.role),
      });
  }
  if (t.dataset.editEvent) return editor("events", EVENT_FIELDS, "일정", find(state.events, t.dataset.editEvent));
  if (t.dataset.editPrayer) return editor("prayers", PRAYER_FIELDS, "기도문", find(state.prayers, t.dataset.editPrayer));
  if (t.dataset.editNews) return editor("newsletters", NEWS_FIELDS, "소식지", find(state.newsletters, t.dataset.editNews));
  if (t.dataset.editDonor) return editor("donors", DONOR_FIELDS, "후원자", find(state.donors, t.dataset.editDonor));
  if (t.dataset.removeRole) {
    if (!confirm(`${t.dataset.removeRole} 의 권한을 삭제할까요?`)) return;
    store.removeRole(t.dataset.removeRole).then(() => toast("삭제했습니다."), (e) => toast(errMsg(e)));
  }
});

$view.addEventListener("change", (ev) => {
  const email = ev.target.dataset.roleEmail;
  if (email) store.setRole(email, ev.target.value).then(() => toast("역할을 바꿨습니다."), (e) => toast(errMsg(e)));
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
// 로그인 / 계정 표시
// ---------------------------------------------------------------
function renderAccount() {
  if (!state.user) {
    $account.innerHTML = `<button class="btn small primary" id="login">로그인</button>`;
    $account.querySelector("#login").onclick = login;
    return;
  }
  $account.innerHTML = `
    <span class="who" title="${esc(state.user.email)}">${esc(state.user.name)} · ${ROLES[state.role]}</span>
    ${can(state.role, "roles.manage") ? `<a class="btn small" href="#/admin">권한</a>` : ""}
    <button class="btn small" id="logout">로그아웃</button>`;
  $account.querySelector("#logout").onclick = () => store.signOut();
}

function login() {
  if (store.mode === "firebase") {
    store.signIn().catch((e) => toast(errMsg(e)));
    return;
  }
  openForm({
    title: "데모 로그인",
    submitLabel: "로그인",
    fields: [{
      name: "email", label: "체험할 계정", type: "select", default: "editor@example.com",
      options: [
        ["admin@example.com", "admin@example.com (관리자)"],
        ["editor@example.com", "editor@example.com (편집자)"],
        ["member@example.com", "member@example.com (회원)"],
        ["guest@example.com", "guest@example.com (등록 안 된 사람)"],
      ],
    }],
    onSubmit: (d) => store.signIn(d.email),
  });
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
  document.querySelectorAll(".tabbar a").forEach((a) => a.classList.toggle("active", a.dataset.route === r));
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
