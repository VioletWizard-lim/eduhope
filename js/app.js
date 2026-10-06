import * as data from "./data.js";
import { SHEET_URL } from "./config.js";
import { ORG, LOCAL_INTRO, SPECIAL_INTRO, LOCAL_GROUPS, SPECIAL_GROUPS, LINKS, JOIN, YOUTUBE_ID, CATEGORIES, DIRECTION, HISTORY, CONTACTS } from "./content.js";

const $view = document.getElementById("view");
const $account = document.getElementById("account");
const $dialog = document.getElementById("dialog");
const $toast = document.getElementById("toast");
const $banner = document.getElementById("demo-banner");

const state = {
  db: normalize(null),
  me: data.session(),
  loading: false,
  cal: (() => {
    const t = new Date();
    return { year: t.getFullYear(), month: t.getMonth(), selected: ymd(t) };
  })(),
  donorQuery: "",
  calFilter: new Set(), // 비어 있으면 모든 구분을 보여 준다
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || "")) return esc(s);
  const [y, m, d] = s.split("-").map(Number);
  const dow = "일월화수목금토"[new Date(y, m - 1, d).getDay()];
  return `${y}. ${m}. ${d}. (${dow})`;
}
function safeUrl(u) {
  return /^https?:\/\//i.test(u || "") ? u : "";
}
function toast(msg) {
  $toast.textContent = msg;
  $toast.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => $toast.classList.remove("show"), 2600);
}
const byDateDesc = (a, b) => (b.date || "").localeCompare(a.date || "");
const byDateAsc = (a, b) => ((a.date || "") + (a.time || "")).localeCompare((b.date || "") + (b.time || ""));
// 관리자로 로그인했으면 사진을 올리고 지울 수 있다. (다른 메뉴는 구글 시트에서 편집)
const isAdmin = () => data.canUpload() && !!state.me;

// 일정의 구분(색). 시트 '구분' 칸에 낱말이 들어 있으면 그 구분, 아니면 '그 외'.
function catOf(e) {
  const v = String(e.category || "").replace(/\s/g, "");
  return CATEGORIES.find((c) => c.match.some((m) => v.includes(m))) || CATEGORIES[CATEGORIES.length - 1];
}
const shown = (e) => !state.calFilter.size || state.calFilter.has(catOf(e).key);

function eventsOn(day) {
  return state.db.events.filter((e) => e.date <= day && day <= (e.endDate || e.date) && shown(e)).sort(byDateAsc);
}

function normalize(d) {
  return {
    events: (d?.events || []).filter((e) => e.title && e.date),
    prayers: d?.prayers || [],
    newsletters: d?.newsletters || [],
    donors: d?.donors || [],
    photos: d?.photos || [],
  };
}

// ---------------------------------------------------------------
// 화면들
// ---------------------------------------------------------------
const views = {
  home() {
    const today = ymd(new Date());
    const upcoming = state.db.events.filter((e) => (e.endDate || e.date) >= today).sort(byDateAsc).slice(0, 3);
    const prayer = [...state.db.prayers].sort(byDateDesc)[0];
    const news = [...state.db.newsletters].sort(byDateDesc)[0];
    const photos = [...state.db.photos].sort(byDateDesc).slice(0, 6);
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

      ${photos.length ? `<h3>최근 사진</h3>${gallery(photos)}<a class="btn" href="#/photos" style="margin-top:8px">사진 더 보기 →</a>` : ""}

      <h3>최근 소식지</h3>
      ${news ? newsCard(news) : `<div class="card empty">등록된 소식지가 없습니다.</div>`}
    `;
  },

  calendar() {
    const { year, month, selected } = state.cal;
    const first = new Date(year, month, 1);
    const start = new Date(year, month, 1 - first.getDay());
    const today = ymd(new Date());
    let cells = "";
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      if (i === 35 && d.getMonth() !== month) break; // 5주로 끝나는 달
      const key = ymd(d);
      const evs = eventsOn(key);
      const cls = ["cal-day", d.getMonth() !== month && "other", key === today && "today", key === selected && "selected", d.getDay() === 0 && "sun"].filter(Boolean).join(" ");
      cells += `<button class="${cls}" data-day="${key}" aria-label="${fmtDate(key)} 일정 ${evs.length}개">
        <span class="num">${d.getDate()}</span>
        ${evs.slice(0, 2).map((e) => `<span class="cal-chip" style="background:${catOf(e).color}">${esc(e.title)}</span>`).join("")}
        ${evs.length > 2 ? `<span class="cal-chip more">+${evs.length - 2}</span>` : ""}
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
      <div class="cal-legend" aria-label="구분별로 보기">
        ${CATEGORIES.map((c) => `<button class="legend ${state.calFilter.has(c.key) ? "on" : ""} ${state.calFilter.size && !state.calFilter.has(c.key) ? "off" : ""}" data-cat="${esc(c.key)}" aria-pressed="${state.calFilter.has(c.key)}">
          <i style="background:${c.color}"></i>${esc(c.key)}</button>`).join("")}
        ${state.calFilter.size ? `<button class="legend reset" data-cat="">전체 보기</button>` : ""}
      </div>
      <h3>${fmtDate(selected)}</h3>
      ${dayEvents.length ? dayEvents.map(eventCard).join("") : `<div class="card empty">이 날은 일정이 없습니다.</div>`}
    `;
  },

  photos() {
    const upload = isAdmin()
      ? `<label class="btn primary small">+ 사진 올리기<input type="file" accept="image/*" multiple hidden data-act="upload" /></label>`
      : "";
    const albums = albumList();
    const key = routeParam();
    const album = key && albums.find((a) => a.key === key);

    // 사진첩 하나를 연 화면
    if (album) {
      return `
        <a class="back-link" href="#/photos">‹ 사진첩</a>
        <div class="row">
          <h2 class="album-title">${esc(album.name)} <span class="meta">${album.photos.length}장</span></h2>
          ${upload}
        </div>
        <div id="upload-status" class="meta"></div>
        ${gallery(album.photos)}
      `;
    }
    // 사진첩 목록 (사진첩이 하나뿐이면 바로 사진을 보여준다)
    return `
      <div class="row">
        <div class="section-title">📷 사진</div>
        ${upload}
      </div>
      <div id="upload-status" class="meta"></div>
      ${!albums.length
        ? `<div class="card empty">아직 사진이 없습니다.</div>`
        : albums.length === 1
          ? gallery(albums[0].photos)
          : `<div class="albums">${albums
              .map((a) => `<a class="album" href="#/photos/${encodeURIComponent(a.key)}">
                  <span class="cover">${a.photos.slice(0, 4).map((p) => `<img src="${esc(data.photoUrl(p.id, 320))}" alt="" loading="lazy" referrerpolicy="no-referrer" />`).join("")}</span>
                  <b>${esc(a.name)}</b>
                  <span class="meta">${a.photos.length}장${a.date ? ` · ${esc(a.date.slice(0, 7).replace("-", "."))}` : ""}</span>
                </a>`)
              .join("")}</div>`}
    `;
  },

  prayers() {
    const list = [...state.db.prayers].sort(byDateDesc);
    return `
      <div class="section-title">🙏 기도문</div>
      ${list.length ? `<p class="meta">제목을 누르면 기도문이 펼쳐져요.</p>${list.map(prayerItem).join("")}` : `<div class="card empty">등록된 기도문이 없습니다.</div>`}
    `;
  },

  newsletters() {
    const list = [...state.db.newsletters].sort(byDateDesc);
    return `
      <div class="section-title">📰 소식지</div>
      ${list.length ? list.map(newsCard).join("") : `<div class="card empty">등록된 소식지가 없습니다.</div>`}
    `;
  },

  donors() {
    const head = `<div class="section-title">💚 후원자 명단</div>
      <p class="meta">기윤실교사모임을 위해 기도와 물질로 함께해 주시는 분들께 감사드립니다.</p>`;
    const q = state.donorQuery.toLowerCase();
    const list = state.db.donors.filter((d) => !q || (d.name || "").toLowerCase().includes(q)).sort((a, b) => (a.name || "").localeCompare(b.name || "", "ko"));
    const groups = {};
    for (const d of list) (groups[d.type || "기타"] ||= []).push(d);
    return `
      ${head}
      <span class="meta">총 ${state.db.donors.length}명/곳</span>
      <input class="search" type="search" placeholder="이름 검색" value="${esc(state.donorQuery)}" data-act="donor-search" style="margin-top:8px" />
      ${Object.keys(groups).length
        ? Object.entries(groups)
            .map(([type, rows]) => `<h3>${esc(type)} (${rows.length})</h3>
              <div class="chips">${rows.map((d) => `<span class="chip">${esc(d.name)}</span>`).join("")}</div>`)
            .join("")
        : `<div class="card empty">명단이 없습니다.</div>`}
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

      <h3>앞으로의 추진방향</h3>
      <div class="pillars">
        ${DIRECTION.pillars.map((p) => `<div class="pillar" style="border-top-color:${p.color}">
          <b>${esc(p.title)}</b>
          <span class="meta">${esc(p.focus)}</span>
          <ul>${p.points.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
        </div>`).join("")}
      </div>
      <ol class="plans">
        ${DIRECTION.plans.map((p) => `<li><b>${esc(p.title)}</b><ul>${p.items.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></li>`).join("")}
        <li><b>꿈섬 운영</b>
          <div class="pillars two">${DIRECTION.kkumseom.map((k) => `<div class="pillar"><b>${esc(k.title)}</b><span>${esc(k.text)}</span></div>`).join("")}</div>
        </li>
      </ol>

      <h3>히스토리</h3>
      <div class="history">
        ${HISTORY.map((h, i) => `<details class="era" ${i === 0 ? "open" : ""}>
          <summary><b>${esc(h.title)}</b> <span class="meta">${esc(h.period)}</span></summary>
          <ul>${h.items.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
        </details>`).join("")}
      </div>

      <div class="video">
        <iframe src="https://www.youtube-nocookie.com/embed/${esc(YOUTUBE_ID)}" title="기윤실교사모임 선업튀 영상"
          loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen></iframe>
      </div>

      <div class="section-title" style="margin-top:24px">🍎 지역모임</div>
      <p>${esc(LOCAL_INTRO)}</p>
      <div class="groups">
        ${LOCAL_GROUPS.map((g) => `<div class="group-row"><div class="region">${esc(g.region)}</div>
          <div class="chips">${g.groups.map((n) => `<button class="chip tap" data-group="local:${esc(n)}">${esc(n)}</button>`).join("")}</div></div>`).join("")}
      </div>

      <div class="section-title" style="margin-top:24px">🍎 전문모임</div>
      <p>${esc(SPECIAL_INTRO)}</p>
      <div class="chips">${SPECIAL_GROUPS.map((n) => `<button class="chip tap" data-group="special:${esc(n)}">${esc(n)}</button>`).join("")}</div>

      <p class="notice" style="margin-top:16px">※ 모임 이름을 누르면 그 모임 대표의 연락처를 볼 수 있어요.
        그 밖의 문의는 기윤실교사모임 공식 연락처인
        <a href="tel:${ORG.phone.replace(/-/g, "")}"><b>${esc(ORG.phone)}</b></a>로 연락 부탁드립니다.</p>

      <details class="staff">
        <summary><b>섬김이</b> <span class="meta">모임의 건강한 성장을 위해 앞장서서 실무와 사역을 일구어가는 섬김이들</span></summary>
        <table class="staff-table">
          ${CONTACTS.staff.map((c) => `<tr><td>${esc(c.role)}</td><td><b>${esc(c.rep)}</b></td><td><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></td></tr>`).join("")}
        </table>
      </details>

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
};

// 사진을 사진첩(시트의 '앨범' 칸) 별로 묶는다. 최근 사진이 있는 사진첩이 앞에 온다.
const NO_ALBUM = "_";
function albumList() {
  const map = new Map();
  for (const p of [...state.db.photos].sort(byDateDesc)) {
    const key = p.album || NO_ALBUM;
    if (!map.has(key)) map.set(key, { key, name: p.album || "기타 사진", photos: [], date: p.date || "" });
    map.get(key).photos.push(p);
  }
  return [...map.values()].sort((a, b) => (a.key === NO_ALBUM) - (b.key === NO_ALBUM) || b.date.localeCompare(a.date));
}

// 모임 이름 → 대표 연락처. 띄어쓰기·기호를 빼고 비교하고, keys 낱말이 들어 있어도 같은 모임으로 본다.
const norm = (t) => String(t).replace(/[\s\-·()]/g, "");
// 찾는 순서: 이름이 같은 것 → keys 낱말이 맞는 것 → 이름 일부가 겹치는 것
// (예: '양주'가 '구리남양주'보다 keys 에 '양주'가 있는 '동두천양주'로 먼저 가도록)
function findContact(kind, group) {
  const g = norm(group);
  const list = CONTACTS[kind];
  return (
    list.find((c) => norm(c.name) === g) ||
    list.find((c) => (c.keys || []).some((k) => g === norm(k) || g.includes(norm(k)))) ||
    list.find((c) => g.includes(norm(c.name)) || norm(c.name).includes(g))
  );
}

function contactLine(label, c) {
  return `<div class="contact">
    <span class="meta">${esc(label)}</span>
    <b>${esc(c.rep)}</b>
    <a href="mailto:${esc(c.email)}">${esc(c.email)}</a>
    <button type="button" class="btn small" data-copy="${esc(c.email)}">복사</button>
  </div>`;
}

function openContact(kind, group) {
  const c = findContact(kind, group);
  const area = kind === "local" && c?.area ? CONTACTS.staff.find((s) => s.area === c.area) : null;
  $dialog.innerHTML = `
    <form method="dialog">
      <h2>${esc(group)} ${kind === "local" ? "지역모임" : ""}</h2>
      ${c ? contactLine(kind === "local" ? "지역 대표" : "모임 대표", c) : `<p>아직 등록된 대표 연락처가 없어요.</p>`}
      ${area ? contactLine(`${c.area} 권역대표`, area) : ""}
      <p class="meta">연락이 닿지 않으면 공식 연락처 <a href="tel:${ORG.phone.replace(/-/g, "")}">${esc(ORG.phone)}</a> 로 문의해 주세요.</p>
      <div class="actions"><button type="submit" class="btn primary">닫기</button></div>
    </form>`;
  $dialog.querySelectorAll("[data-copy]").forEach((b) => {
    b.onclick = async () => {
      try {
        await navigator.clipboard.writeText(b.dataset.copy);
        toast("이메일 주소를 복사했어요.");
      } catch {
        toast(b.dataset.copy);
      }
    };
  });
  $dialog.showModal();
}

function linkButton(l) {
  const internal = l.url.startsWith("#/");
  const href = internal ? l.url : safeUrl(l.url);
  if (!href) return "";
  return `<a class="link-btn" href="${esc(href)}" ${internal ? "" : 'target="_blank" rel="noopener"'}>${esc(l.label)} 👆</a>`;
}

function gallery(list) {
  return `<div class="gallery">${list
    .map((p) => `<button class="photo" data-photo="${esc(p.id)}" aria-label="${esc(p.caption || p.album || "사진")}">
        <img src="${esc(data.photoUrl(p.id, 480))}" alt="${esc(p.caption || "")}" loading="lazy" referrerpolicy="no-referrer" />
        ${p.caption ? `<span>${esc(p.caption)}</span>` : ""}
      </button>`)
    .join("")}</div>`;
}

function eventCard(e) {
  const when = e.endDate && e.endDate !== e.date ? `${fmtDate(e.date)} ~ ${fmtDate(e.endDate)}` : fmtDate(e.date);
  const c = catOf(e);
  return `<div class="card event" style="border-left-color:${c.color}">
    <span class="cat-tag" style="background:${c.color}">${esc(c.key)}</span>
    <h4>${esc(e.title)}</h4>
    <div class="meta">🗓 ${when}${e.time ? ` · ⏰ ${esc(e.time)}` : ""}${e.place ? ` · 📍 ${esc(e.place)}` : ""}</div>
    ${e.memo ? `<div class="prewrap" style="margin-top:6px">${esc(e.memo)}</div>` : ""}
  </div>`;
}

function prayerCard(p, preview = false) {
  const body = preview && (p.body || "").length > 160 ? p.body.slice(0, 160) + "…" : p.body;
  return `<div class="card">
    <h4>${esc(p.title)}</h4>
    <div class="meta">${fmtDate(p.date)}${safeUrl(p.url) ? ` · <a href="${esc(safeUrl(p.url))}" target="_blank" rel="noopener">원본 ↗</a>` : ""}</div>
    <div class="prewrap" style="margin-top:8px">${esc(body)}</div>
    ${preview ? `<a href="#/prayers/${encodeURIComponent(p.id)}" class="meta">이어서 읽기 · 기도문 모두 보기 →</a>` : ""}
  </div>`;
}

// 기도문 목록: 제목만 보이고 누르면 펼친다.
// 처음에는 주소로 고른 기도문(홈에서 '이어서 읽기') 또는 가장 최근 기도문 하나만 펼쳐 둔다.
// 펼친 상태는 새로고침(↻)으로 다시 그려도 그대로 유지한다.
function prayerItem(p, i) {
  if (!state.prayerOpen) state.prayerOpen = new Set([routeParam() || p.id]);
  if (i === 0 && routeParam()) state.prayerOpen.add(routeParam()); // 홈에서 '이어서 읽기'로 온 기도문
  const open = state.prayerOpen.has(p.id);
  return `<details class="card prayer" data-prayer="${esc(p.id)}" ${open ? "open" : ""}>
    <summary><h4>${esc(p.title)}</h4><span class="meta">${fmtDate(p.date)}</span></summary>
    ${safeUrl(p.url) ? `<a class="btn small orig-link" href="${esc(safeUrl(p.url))}" target="_blank" rel="noopener">원본 보기 ↗</a>` : ""}
    <div class="prewrap">${esc(p.body)}</div>
  </details>`;
}

function newsCard(n) {
  const u = safeUrl(n.url);
  return `<div class="card">
    <h4>${esc(n.title)}</h4>
    <div class="meta">${fmtDate(n.date)}</div>
    ${n.summary ? `<div class="prewrap" style="margin-top:6px">${esc(n.summary)}</div>` : ""}
    ${u ? `<a class="btn small" style="margin-top:8px" href="${esc(u)}" target="_blank" rel="noopener">소식지 열기 ↗</a>` : ""}
  </div>`;
}

// ---------------------------------------------------------------
// 입력 창 (관리자 로그인, 사진 올리기)
// ---------------------------------------------------------------
function openForm({ title, note = "", fields, values = {}, submitLabel = "저장", onSubmit, onDelete }) {
  const inputs = fields
    .map((f) => {
      const v = values[f.name] ?? "";
      const req = f.required ? "required" : "";
      let control;
      if (f.type === "textarea") control = `<textarea name="${f.name}" ${req}>${esc(v)}</textarea>`;
      else if (f.type === "select") control = `<select name="${f.name}">${f.options.map((o) => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
      else {
        const list = f.suggestions?.length ? `list="dl-${f.name}"` : "";
        control = `<input name="${f.name}" type="${f.type || "text"}" value="${esc(v)}" ${req} ${list} placeholder="${esc(f.placeholder || "")}" ${f.autocomplete ? `autocomplete="${f.autocomplete}"` : ""} />`;
        if (list) control += `<datalist id="dl-${f.name}">${f.suggestions.map((o) => `<option value="${esc(o)}"></option>`).join("")}</datalist>`;
      }
      return `<label class="field">${esc(f.label)}${control}</label>`;
    })
    .join("");
  $dialog.innerHTML = `
    <form method="dialog">
      <h2>${esc(title)}</h2>
      ${note ? `<p class="notice">${esc(note)}</p>` : ""}
      ${inputs}
      <div class="actions">
        ${onDelete ? `<button type="button" class="btn danger" data-act="delete" style="margin-right:auto">삭제</button>` : ""}
        <button type="button" class="btn" data-act="cancel">취소</button>
        <button type="submit" class="btn primary">${esc(submitLabel)}</button>
      </div>
    </form>`;
  const form = $dialog.querySelector("form");
  const busy = (on) => form.querySelectorAll("button").forEach((b) => (b.disabled = on));
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const values = Object.fromEntries([...new FormData(form).entries()].map(([k, v]) => [k, String(v).trim()]));
    busy(true);
    try {
      // onSubmit 이 false 를 돌려주면 창을 닫지 않는다. (안내 창으로 바꿔 보여 줄 때)
      if ((await onSubmit(values)) !== false) $dialog.close();
    } catch (e) {
      toast(e.message);
    }
    busy(false);
  });
  form.querySelector('[data-act="cancel"]').onclick = () => $dialog.close();
  if (onDelete)
    form.querySelector('[data-act="delete"]').onclick = async () => {
      if (!confirm("정말 삭제할까요?")) return;
      busy(true);
      try {
        await onDelete();
        $dialog.close();
      } catch (e) {
        toast(e.message);
      }
      busy(false);
    };
  $dialog.showModal();
}

// ---------------------------------------------------------------
// 사진 올리기: 원본 그대로 보낸다. 한 장에 8MB 까지. (apps-script/Code.gs 의 MAX_BYTES 와 같게)
// ---------------------------------------------------------------
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const SENDABLE = /^image\/(jpeg|png|webp)$/;
const mb = (n) => `${(n / 1024 / 1024).toFixed(1)}MB`;

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("사진을 읽지 못했습니다."));
    r.readAsDataURL(file);
  });
}

// JPG·PNG·WEBP 는 원본 그대로. 그 밖의 형식(HEIC 등)은 브라우저가 열 수 있으면 같은 크기의 JPG 로 바꾼다.
async function originalPhoto(file) {
  if (SENDABLE.test(file.type)) return fileToDataUrl(file);
  let img;
  try {
    img = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("이 사진 형식은 올릴 수 없어요. JPG 나 PNG 사진을 골라 주세요.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.getContext("2d").drawImage(img, 0, 0);
  const url = canvas.toDataURL("image/jpeg", 0.92);
  if ((url.length * 3) / 4 > MAX_PHOTO_BYTES) throw new Error("JPG 로 바꾸니 8MB 를 넘어요.");
  return url;
}

function uploadPhotos(picked) {
  if (!picked.length) return;
  const files = picked.filter((f) => f.size <= MAX_PHOTO_BYTES);
  const tooBig = picked.filter((f) => f.size > MAX_PHOTO_BYTES);
  const bigNote = tooBig.length
    ? `8MB 가 넘는 사진 ${tooBig.length}장은 올리지 않아요: ${tooBig.map((f) => `${f.name} (${mb(f.size)})`).join(", ")}`
    : "";
  if (!files.length) {
    return showNotice("사진이 너무 커요", `사진은 한 장에 8MB 까지 올릴 수 있어요.\n${bigNote}`);
  }
  const albums = albumList().filter((a) => a.key !== NO_ALBUM).map((a) => a.name);
  openForm({
    title: `사진 ${files.length}장 올리기 (원본, ${mb(files.reduce((n, f) => n + f.size, 0))})`,
    note: bigNote,
    submitLabel: "올리기",
    fields: [
      { name: "album", label: "사진첩 이름 (기존 사진첩을 고르거나 새 이름을 쓰세요. 비우면 '기타 사진')", placeholder: "예: 2026 여름 수련회", suggestions: albums, autocomplete: "off" },
      { name: "caption", label: "사진 설명 (비워도 됩니다)", autocomplete: "off" },
    ],
    values: { album: route() === "photos" && routeParam() !== NO_ALBUM ? routeParam() : "" },
    onSubmit: async ({ album, caption }) => {
      $dialog.close();
      const status = () => $view.querySelector("#upload-status");
      let done = 0;
      for (const f of files) {
        if (status()) status().textContent = `올리는 중… (${done + 1}/${files.length}) 앱을 닫지 마세요.`;
        try {
          await data.uploadPhoto({ dataUrl: await originalPhoto(f), album, caption });
          done++;
        } catch (e) {
          if (e.message === data.CONNECT_HELP) {
            showHelp(e.message);
            break;
          }
          toast(`${f.name}: ${e.message}`);
          if (e.code === "auth") {
            state.me = null;
            break;
          }
        }
      }
      if (status()) status().textContent = "";
      if (done) toast(`사진 ${done}장을 올렸습니다.`);
      await refresh();
      // 올린 사진첩으로 이동
      const key = album || NO_ALBUM;
      if (done && routeParam() !== key && albumList().length > 1) go(`#/photos/${encodeURIComponent(key)}`);
    },
  });
}

// 사진 크게 보기. 같은 사진첩 안에서 ‹ › 버튼이나 좌우로 밀어서 넘길 수 있다.
function openPhoto(p, list = [p]) {
  if (!p) return;
  let i = Math.max(0, list.findIndex((x) => x.id === p.id));
  const editable = isAdmin();
  $dialog.innerHTML = `
    <form method="dialog" class="lightbox">
      <div class="lb-stage">
        <img alt="" referrerpolicy="no-referrer" />
        ${list.length > 1 ? `<button type="button" class="lb-nav prev" data-step="-1" aria-label="이전 사진">‹</button>
          <button type="button" class="lb-nav next" data-step="1" aria-label="다음 사진">›</button>` : ""}
      </div>
      <div class="lb-caption"></div>
      <div class="meta lb-meta"></div>
      <div class="meta lb-hint">사진을 누르면 확대돼요. 확대한 뒤에는 끌어서 둘러볼 수 있어요.</div>
      <a class="lb-orig meta" target="_blank" rel="noopener" hidden>원본 보기·내려받기 ↗</a>
      <div class="actions">
        ${editable ? `<button type="button" class="btn danger" data-act="del" style="margin-right:auto">삭제</button>` : ""}
        <button type="submit" class="btn">닫기</button>
      </div>
    </form>`;
  const stage = $dialog.querySelector(".lb-stage");
  const img = stage.querySelector("img");
  // 확대: 원본 크기로 보여 주고, 누른 곳이 가운데 오도록 스크롤한다. 다시 누르면 화면에 맞춤.
  const zoom = (on, ev) => {
    stage.classList.toggle("zoomed", on);
    if (!on) return;
    const cur = list[i];
    const fx = ev ? ev.offsetX / img.clientWidth : 0.5;
    const fy = ev ? ev.offsetY / img.clientHeight : 0.5;
    const center = () => {
      stage.scrollLeft = img.clientWidth * fx - stage.clientWidth / 2;
      stage.scrollTop = img.clientHeight * fy - stage.clientHeight / 2;
    };
    const big = data.photoUrl(cur.id, 4000);
    if (img.src !== big) {
      img.addEventListener("load", center, { once: true });
      img.src = big;
    }
    center();
  };
  img.addEventListener("click", (ev) => zoom(!stage.classList.contains("zoomed"), ev));
  const show = () => {
    const cur = list[i];
    stage.classList.remove("zoomed");
    img.src = data.photoUrl(cur.id, 2400);
    const orig = $dialog.querySelector(".lb-orig");
    const driveLink = /^[\w-]{20,}$/.test(cur.id) ? `https://drive.google.com/file/d/${encodeURIComponent(cur.id)}/view` : "";
    orig.hidden = !driveLink;
    orig.href = driveLink || "#";
    img.alt = cur.caption || "";
    $dialog.querySelector(".lb-caption").textContent = cur.caption || "";
    $dialog.querySelector(".lb-meta").textContent = [cur.album, fmtDate(cur.date), list.length > 1 ? `${i + 1} / ${list.length}` : ""].filter(Boolean).join(" · ");
  };
  const step = (d) => {
    i = (i + d + list.length) % list.length;
    show();
  };
  $dialog.querySelectorAll("[data-step]").forEach((b) => (b.onclick = () => step(+b.dataset.step)));
  let x0 = null;
  img.addEventListener("touchstart", (e) => (x0 = e.touches[0].clientX), { passive: true });
  img.addEventListener("touchend", (e) => {
    if (x0 === null || list.length < 2 || stage.classList.contains("zoomed")) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
    x0 = null;
  });
  $dialog.onkeydown = (e) => {
    if (e.key === "ArrowLeft") step(-1);
    if (e.key === "ArrowRight") step(1);
  };
  show();
  $dialog.classList.add("photo-dialog");
  $dialog.addEventListener("close", () => $dialog.classList.remove("photo-dialog"), { once: true });
  $dialog.showModal();
  const del = $dialog.querySelector('[data-act="del"]');
  if (del)
    del.onclick = async () => {
      if (!confirm("이 사진을 삭제할까요? (시트에서 지우고 드라이브 휴지통으로 이동)")) return;
      try {
        await data.deletePhoto(list[i].id);
        $dialog.close();
        toast("삭제했습니다.");
        await refresh();
      } catch (e) {
        toast(e.message);
      }
    };
}

// ---------------------------------------------------------------
// 이벤트 처리
// ---------------------------------------------------------------
$view.addEventListener("click", (ev) => {
  const t = ev.target.closest("button");
  if (!t) return;
  if (t.dataset.day) {
    state.cal.selected = t.dataset.day;
    return render();
  }
  if (t.dataset.group) {
    const i = t.dataset.group.indexOf(":");
    return openContact(t.dataset.group.slice(0, i), t.dataset.group.slice(i + 1));
  }
  if (t.dataset.cat !== undefined) {
    // 구분 범례: 누르면 그 구분만 보기 (여러 개 고를 수 있음), '전체 보기'로 해제
    const k = t.dataset.cat;
    if (!k) state.calFilter.clear();
    else if (state.calFilter.has(k)) state.calFilter.delete(k);
    else state.calFilter.add(k);
    return render();
  }
  if (t.dataset.photo) {
    // 누른 사진이 속한 목록(사진첩 또는 홈의 최근 사진) 안에서 넘겨 볼 수 있게 한다.
    const ids = [...t.closest(".gallery").querySelectorAll("[data-photo]")].map((b) => b.dataset.photo);
    const list = ids.map((id) => state.db.photos.find((p) => p.id === id)).filter(Boolean);
    return openPhoto(list.find((p) => p.id === t.dataset.photo), list);
  }
  switch (t.dataset.act) {
    case "prev":
    case "next": {
      const d = new Date(state.cal.year, state.cal.month + (t.dataset.act === "next" ? 1 : -1), 1);
      state.cal.year = d.getFullYear();
      state.cal.month = d.getMonth();
      return render();
    }
  }
});

$view.addEventListener(
  "toggle",
  (ev) => {
    const id = ev.target.dataset?.prayer;
    if (!id) return;
    state.prayerOpen ||= new Set();
    if (ev.target.open) state.prayerOpen.add(id);
    else state.prayerOpen.delete(id);
  },
  true,
);

$view.addEventListener("change", (ev) => {
  if (ev.target.dataset.act === "upload") {
    uploadPhotos([...ev.target.files]);
    ev.target.value = "";
  }
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
// 로그인 / 상단바
// ---------------------------------------------------------------
function renderHeader() {
  const refreshBtn = `<button class="btn small" id="refresh" ${state.loading ? "disabled" : ""} aria-label="새로고침">${state.loading ? "…" : "↻"}</button>`;
  // 캘린더·기도문 등은 구글 시트에서 편집한다. 시트 편집 권한이 있는 사람만 고칠 수 있다.
  // 구글 시트 바로가기는 로그인한 관리자에게만 보인다. (방문자에게는 시트를 드러내지 않음)
  const sheetBtn = SHEET_URL ? `<a class="btn small" href="${esc(SHEET_URL)}" target="_blank" rel="noopener">시트</a>` : "";
  if (isAdmin()) {
    $account.innerHTML = `<span class="who">${esc(state.me.id)}</span>${refreshBtn}${sheetBtn}<button class="btn small" id="logout">로그아웃</button>`;
    $account.querySelector("#logout").onclick = async () => {
      await data.logout();
      state.me = null;
      toast("로그아웃했습니다.");
      render();
    };
  } else {
    $account.innerHTML = `${refreshBtn}${data.canUpload() ? `<button class="btn small" id="login" aria-label="관리자 로그인">🔑</button>` : ""}`;
    $account.querySelector("#login")?.addEventListener("click", login);
  }
  $account.querySelector("#refresh").onclick = refresh;
}

// 연결 문제처럼 긴 안내는 잠깐 뜨는 알림 대신 창으로 보여 준다.
function showNotice(title, msg, extra = "") {
  $dialog.innerHTML = `
    <form method="dialog">
      <h2>⚠️ ${esc(title)}</h2>
      <p class="prewrap">${esc(msg)}</p>
      ${extra}
      <div class="actions"><button type="submit" class="btn primary">확인</button></div>
    </form>`;
  if (!$dialog.open) $dialog.showModal();
}

function showHelp(msg) {
  showNotice("사진 올리기 연결 확인", msg.replace(/ (?=[①②③])/g, "\n"), `<p class="meta">자세한 방법은 README 의 "문제 해결"을 참고하세요.</p>`);
}

function login() {
  openForm({
    title: "관리자 로그인",
    submitLabel: "로그인",
    fields: [
      { name: "id", label: data.preview ? "아이디 (미리보기: admin)" : "아이디", required: true, autocomplete: "username" },
      { name: "pw", label: data.preview ? "비밀번호 (미리보기: admin)" : "비밀번호", type: "password", required: true, autocomplete: "current-password" },
    ],
    onSubmit: async ({ id, pw }) => {
      try {
        await data.login(id, pw);
      } catch (e) {
        if (e.message === data.CONNECT_HELP) {
          showHelp(e.message);
          return false;
        }
        throw e;
      }
      state.me = data.session();
      toast("로그인했습니다. 사진 메뉴에서 사진을 올릴 수 있어요.");
      render();
    },
  });
}

// ---------------------------------------------------------------
// 데이터 불러오기
// ---------------------------------------------------------------
async function refresh() {
  state.loading = true;
  renderHeader();
  try {
    state.db = normalize(await data.fetchLatest());
  } catch (e) {
    console.warn(e);
    toast("최신 내용을 불러오지 못했습니다. 저장된 내용을 보여드려요.");
  }
  state.loading = false;
  render();
}

// ---------------------------------------------------------------
// 라우팅
// ---------------------------------------------------------------
// 주소: #/화면이름 또는 #/화면이름/세부 (예: #/photos/2026%20수련회)
function route() {
  const name = location.hash.replace(/^#\/?/, "").split(/[/?]/)[0] || "home";
  return views[name] ? name : "home";
}
function routeParam() {
  const rest = location.hash.replace(/^#\/?/, "").split("?")[0].split("/").slice(1).join("/");
  try {
    return decodeURIComponent(rest);
  } catch {
    return rest;
  }
}

function render() {
  const r = route();
  $view.innerHTML = views[r]();
  const tab = r === "join" ? "about" : r;
  document.querySelectorAll(".tabbar a").forEach((a) => a.classList.toggle("active", a.dataset.route === tab));
  renderHeader();
}

// 뒤로가기: 앱처럼 "홈 ← 지금 화면" 두 단계만 기록에 남긴다.
//   다른 화면에서 뒤로가기 → 홈 / 홈에서 뒤로가기 → 앱 종료 (브라우저 탭에서는 이전 사이트)
// 이번에 앱을 연 뒤 만든 기록에만 표식(s)을 달아 두고, 표식이 없는 예전 기록
// (업데이트 전이나 새로고침 전에 쌓인 기록)은 뒤로가기 때 건너뛴다.
const SESSION = Math.random().toString(36).slice(2);
const ours = () => history.state?.s === SESSION;

function show() {
  render();
  window.scrollTo(0, 0);
}

// 사진첩처럼 한 단계 더 들어간 화면은 기록을 하나 더 쌓아서, 뒤로가기 → 사진첩 목록 → 홈 순서가 된다.
let pending = null; // 한 단계 위로 올라간 뒤 이어서 갈 화면
function go(hash) {
  const cur = location.hash || "#/";
  if (hash === cur) return;
  const toHome = hash === "#/" || hash === "#";
  const deep = ours() && history.state?.deep;
  if (toHome) {
    if (route() === "home") return;
    if (history.state?.sub && ours()) return history.go(deep ? -2 : -1); // 기록상 앞이 홈
    history.replaceState({ s: SESSION }, "", "#/");
    return show();
  }
  if (route() !== "home" && hash.startsWith(cur.replace(/\/$/, "") + "/")) {
    history.pushState({ s: SESSION, sub: true, deep: true }, "", hash); // 한 단계 안으로
    return show();
  }
  if (deep) {
    // 안쪽 화면에서 나갈 때는 먼저 한 단계 위로 돌아간 뒤 이동한다.
    if (!cur.startsWith(hash + "/")) pending = hash;
    return history.back();
  }
  if (route() === "home") history.pushState({ s: SESSION, sub: true }, "", hash);
  else history.replaceState({ s: SESSION, sub: true }, "", hash); // 화면끼리 옮겨 다녀도 기록이 쌓이지 않게
  show();
}

window.addEventListener("popstate", () => {
  if (ours() && pending) {
    const h = pending;
    pending = null;
    return go(h);
  }
  if (ours()) return show();
  // 예전 기록이면 계속 뒤로 간다. 더 갈 곳이 없으면 그 자리를 홈으로 삼는다.
  const before = location.href;
  history.back();
  setTimeout(() => {
    if (location.href === before && !ours()) {
      history.replaceState({ s: SESSION }, "", "#/");
      show();
    }
  }, 300);
});

document.addEventListener("click", (ev) => {
  const a = ev.target.closest('a[href^="#"]');
  if (!a || ev.defaultPrevented || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
  ev.preventDefault();
  go(a.getAttribute("href"));
});

// 시작할 때 지금 기록에 표식을 단다. 다른 화면 주소로 바로 열었으면 홈을 앞에 끼워 둔다.
if (route() === "home") {
  history.replaceState({ s: SESSION }, "", location.hash || "#/");
} else {
  const here = location.hash;
  const parent = `#/${route()}`;
  history.replaceState({ s: SESSION }, "", "#/");
  if (here !== parent && routeParam()) {
    history.pushState({ s: SESSION, sub: true }, "", parent);
    history.pushState({ s: SESSION, sub: true, deep: true }, "", here);
  } else {
    history.pushState({ s: SESSION, sub: true }, "", here);
  }
}

// 다른 앱을 보다가 돌아오면 새 내용을 받아온다.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !$dialog.open) refresh();
});

// ---------------------------------------------------------------
// 시작: 저장된 내용을 바로 보여주고, 뒤에서 최신 내용을 받아온다.
// ---------------------------------------------------------------
state.db = normalize(data.cached());
if (data.preview) {
  $banner.hidden = false;
  $banner.innerHTML = `👀 <b>미리보기</b> — 예시 내용입니다. 오른쪽 위 🔑 에서 admin / admin 으로 로그인하면 사진 올리기를 체험할 수 있어요.`;
}
render();
refresh();

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
