import * as data from "./data.js";
import { ROLES, can } from "./data.js";
import { SHEET_URL } from "./config.js";
import { ORG, LOCAL_INTRO, SPECIAL_INTRO, LOCAL_GROUPS, SPECIAL_GROUPS, LINKS, JOIN, YOUTUBE_ID } from "./content.js";

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
  album: "",
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
const role = () => state.me?.role;

function eventsOn(day) {
  return state.db.events.filter((e) => e.date <= day && day <= (e.endDate || e.date)).sort(byDateAsc);
}

function normalize(d) {
  return {
    events: (d?.events || []).filter((e) => e.title && e.date),
    prayers: d?.prayers || [],
    newsletters: d?.newsletters || [],
    donors: d?.donors || [],
    photos: d?.photos || [],
    donorsLocked: !!d?.donorsLocked,
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
        ${can(role(), "events") ? `<button class="btn primary small" data-act="add-events">+ 일정 추가</button>` : ""}
      </div>
      <div style="margin-top:8px">
        ${dayEvents.length ? dayEvents.map(eventCard).join("") : `<div class="card empty">이 날은 일정이 없습니다.</div>`}
      </div>
    `;
  },

  photos() {
    const albums = [...new Set(state.db.photos.map((p) => p.album || ""))].filter(Boolean).sort().reverse();
    const list = state.db.photos.filter((p) => !state.album || p.album === state.album).sort(byDateDesc);
    return `
      <div class="row">
        <div class="section-title">📷 사진</div>
        ${can(role(), "photos") ? `<label class="btn primary small">+ 사진 올리기<input type="file" accept="image/*" multiple hidden data-act="upload" /></label>` : ""}
      </div>
      <div id="upload-status" class="meta"></div>
      ${albums.length ? `<div class="chips" style="margin-bottom:12px">
        <button class="chip ${state.album ? "" : "on"}" data-album="">전체</button>
        ${albums.map((a) => `<button class="chip ${state.album === a ? "on" : ""}" data-album="${esc(a)}">${esc(a)}</button>`).join("")}
      </div>` : ""}
      ${list.length ? gallery(list) : `<div class="card empty">아직 사진이 없습니다.</div>`}
    `;
  },

  prayers() {
    const list = [...state.db.prayers].sort(byDateDesc);
    return `
      <div class="row">
        <div class="section-title">🙏 기도문</div>
        ${can(role(), "prayers") ? `<button class="btn primary small" data-act="add-prayers">+ 기도문 추가</button>` : ""}
      </div>
      ${list.length ? list.map((p) => prayerCard(p)).join("") : `<div class="card empty">등록된 기도문이 없습니다.</div>`}
    `;
  },

  newsletters() {
    const list = [...state.db.newsletters].sort(byDateDesc);
    return `
      <div class="row">
        <div class="section-title">📰 소식지</div>
        ${can(role(), "newsletters") ? `<button class="btn primary small" data-act="add-newsletters">+ 소식지 추가</button>` : ""}
      </div>
      ${list.length ? list.map(newsCard).join("") : `<div class="card empty">등록된 소식지가 없습니다.</div>`}
    `;
  },

  donors() {
    const head = `<div class="section-title">💚 후원자 명단</div>
      <p class="meta">기윤실교사모임을 위해 기도와 물질로 함께해 주시는 분들께 감사드립니다.</p>`;
    if (state.db.donorsLocked) {
      return `${head}
        <div class="notice">후원자 명단은 회원에게만 공개됩니다. 모임에서 안내받은 비밀번호를 입력해 주세요.</div>
        <form class="pass-form" data-act="donor-key">
          <input class="search" type="password" name="key" placeholder="비밀번호" autocomplete="off" required />
          <button class="btn primary" type="submit">보기</button>
        </form>`;
    }
    const editable = can(role(), "donors");
    const q = state.donorQuery.toLowerCase();
    const list = state.db.donors.filter((d) => !q || (d.name || "").toLowerCase().includes(q)).sort((a, b) => (a.name || "").localeCompare(b.name || "", "ko"));
    const groups = {};
    for (const d of list) (groups[d.type || "기타"] ||= []).push(d);
    return `
      ${head}
      <div class="row">
        <span class="meta">총 ${state.db.donors.length}명/곳</span>
        ${editable ? `<button class="btn primary small" data-act="add-donors">+ 후원자 추가</button>` : ""}
      </div>
      <input class="search" type="search" placeholder="이름 검색" value="${esc(state.donorQuery)}" data-act="donor-search" style="margin-top:8px" />
      ${Object.keys(groups).length
        ? Object.entries(groups)
            .map(([type, rows]) => `<h3>${esc(type)} (${rows.length})</h3>
              <div class="chips">${rows
                .map((d) => (editable ? `<button class="chip" data-edit="donors:${esc(d.id)}">${esc(d.name)}</button>` : `<span class="chip">${esc(d.name)}</span>`))
                .join("")}</div>`)
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

      <div class="video">
        <iframe src="https://www.youtube-nocookie.com/embed/${esc(YOUTUBE_ID)}" title="기윤실교사모임 선업튀 영상"
          loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen></iframe>
      </div>

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
};

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

function editButton(col, id) {
  return can(role(), col) ? `<button class="btn small" data-edit="${col}:${esc(id)}">수정</button>` : "";
}

function eventCard(e) {
  const when = e.endDate && e.endDate !== e.date ? `${fmtDate(e.date)} ~ ${fmtDate(e.endDate)}` : fmtDate(e.date);
  return `<div class="card event">
    <div class="row"><h4>${esc(e.title)}</h4>${editButton("events", e.id)}</div>
    <div class="meta">🗓 ${when}${e.time ? ` · ⏰ ${esc(e.time)}` : ""}${e.place ? ` · 📍 ${esc(e.place)}` : ""}</div>
    ${e.memo ? `<div class="prewrap" style="margin-top:6px">${esc(e.memo)}</div>` : ""}
  </div>`;
}

function prayerCard(p, preview = false) {
  const body = preview && (p.body || "").length > 160 ? p.body.slice(0, 160) + "…" : p.body;
  return `<div class="card">
    <div class="row"><h4>${esc(p.title)}</h4>${preview ? "" : editButton("prayers", p.id)}</div>
    <div class="meta">${fmtDate(p.date)}</div>
    <div class="prewrap" style="margin-top:8px">${esc(body)}</div>
    ${preview ? `<a href="#/prayers" class="meta">기도문 모두 보기 →</a>` : ""}
  </div>`;
}

function newsCard(n) {
  const u = safeUrl(n.url);
  return `<div class="card">
    <div class="row"><h4>${esc(n.title)}</h4>${editButton("newsletters", n.id)}</div>
    <div class="meta">${fmtDate(n.date)}</div>
    ${n.summary ? `<div class="prewrap" style="margin-top:6px">${esc(n.summary)}</div>` : ""}
    ${u ? `<a class="btn small" style="margin-top:8px" href="${esc(u)}" target="_blank" rel="noopener">소식지 열기 ↗</a>` : ""}
  </div>`;
}

// ---------------------------------------------------------------
// 편집 폼
// ---------------------------------------------------------------
const FORMS = {
  events: {
    label: "일정",
    fields: [
      { name: "title", label: "제목", required: true },
      { name: "date", label: "시작일", type: "date", required: true },
      { name: "endDate", label: "종료일 (하루 일정이면 비워두세요)", type: "date" },
      { name: "time", label: "시간", type: "time" },
      { name: "place", label: "장소" },
      { name: "memo", label: "메모", type: "textarea" },
    ],
  },
  prayers: {
    label: "기도문",
    fields: [
      { name: "title", label: "제목", required: true },
      { name: "date", label: "날짜", type: "date", required: true },
      { name: "body", label: "기도문", type: "textarea", required: true },
    ],
  },
  newsletters: {
    label: "소식지",
    fields: [
      { name: "title", label: "제목 (예: 2026년 가을호)", required: true },
      { name: "date", label: "발행일", type: "date", required: true },
      { name: "summary", label: "요약", type: "textarea" },
      { name: "url", label: "링크 (PDF, 구글 드라이브, 카페 글 등)", type: "url", placeholder: "https://" },
    ],
  },
  donors: {
    label: "후원자",
    fields: [
      { name: "name", label: "이름", required: true },
      { name: "type", label: "구분", type: "select", options: ["개인", "교회", "단체"] },
      { name: "since", label: "후원 시작 연도", placeholder: "2024" },
    ],
  },
};

function openForm({ title, fields, values = {}, submitLabel = "저장", onSubmit, onDelete }) {
  const inputs = fields
    .map((f) => {
      const v = values[f.name] ?? "";
      const req = f.required ? "required" : "";
      let control;
      if (f.type === "textarea") control = `<textarea name="${f.name}" ${req}>${esc(v)}</textarea>`;
      else if (f.type === "select") control = `<select name="${f.name}">${f.options.map((o) => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
      else control = `<input name="${f.name}" type="${f.type || "text"}" value="${esc(v)}" ${req} placeholder="${esc(f.placeholder || "")}" ${f.type === "password" ? 'autocomplete="current-password"' : ""} />`;
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
  const busy = (on) => form.querySelectorAll("button").forEach((b) => (b.disabled = on));
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const values = Object.fromEntries([...new FormData(form).entries()].map(([k, v]) => [k, String(v).trim()]));
    busy(true);
    try {
      await onSubmit(values);
      $dialog.close();
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

function edit(col, row, defaults = {}) {
  const f = FORMS[col];
  openForm({
    title: `${f.label} ${row ? "수정" : "추가"}`,
    fields: f.fields,
    values: row || defaults,
    onSubmit: async (v) => {
      if (v.endDate && v.endDate < v.date) throw new Error("종료일이 시작일보다 빠릅니다.");
      await data.save(col, { ...v, id: row?.id });
      toast("저장했습니다. 시트에도 반영됐어요.");
      await refresh();
    },
    onDelete: row
      ? async () => {
          await data.remove(col, row.id);
          toast("삭제했습니다.");
          await refresh();
        }
      : null,
  });
}

// ---------------------------------------------------------------
// 사진 올리기: 휴대폰 사진(수 MB)을 그대로 보내면 느리므로 브라우저에서 줄여서 보낸다.
// ---------------------------------------------------------------
async function shrink(file, maxSide = 1600) {
  const img = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

function uploadPhotos(files) {
  if (!files.length) return;
  const albums = [...new Set(state.db.photos.map((p) => p.album).filter(Boolean))];
  openForm({
    title: `사진 ${files.length}장 올리기`,
    submitLabel: "올리기",
    fields: [
      { name: "album", label: `앨범 이름 (비우면 앨범 없이)${albums.length ? ` — 기존: ${albums.join(", ")}` : ""}`, placeholder: "예: 2026 여름 수련회" },
      { name: "caption", label: "사진 설명 (비워도 됩니다)" },
    ],
    values: { album: state.album },
    onSubmit: async ({ album, caption }) => {
      $dialog.close();
      const status = () => $view.querySelector("#upload-status");
      let done = 0;
      for (const f of files) {
        if (status()) status().textContent = `올리는 중… (${done + 1}/${files.length}) 창을 닫지 마세요.`;
        try {
          await data.uploadPhoto({ dataUrl: await shrink(f), album, caption });
          done++;
        } catch (e) {
          toast(`${f.name}: ${e.message}`);
        }
      }
      if (status()) status().textContent = "";
      toast(`사진 ${done}장을 올렸습니다.`);
      await refresh();
    },
  });
}

function openPhoto(p) {
  if (!p) return;
  const editable = can(role(), "photos");
  $dialog.innerHTML = `
    <form method="dialog" class="lightbox">
      <img src="${esc(data.photoUrl(p.id, 1600))}" alt="${esc(p.caption || "")}" referrerpolicy="no-referrer" />
      ${p.caption ? `<div>${esc(p.caption)}</div>` : ""}
      <div class="meta">${p.album ? `${esc(p.album)} · ` : ""}${fmtDate(p.date)}</div>
      <div class="actions">
        ${editable ? `<button type="button" class="btn danger" data-act="del" style="margin-right:auto">삭제</button>` : ""}
        <button type="submit" class="btn">닫기</button>
      </div>
    </form>`;
  $dialog.showModal();
  const del = $dialog.querySelector('[data-act="del"]');
  if (del)
    del.onclick = async () => {
      if (!confirm("이 사진을 삭제할까요? (드라이브 휴지통으로 이동)")) return;
      try {
        await data.deletePhoto(p.id);
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
  const today = ymd(new Date());
  if (t.dataset.day) {
    state.cal.selected = t.dataset.day;
    return render();
  }
  if (t.dataset.album !== undefined) {
    state.album = t.dataset.album;
    return render();
  }
  if (t.dataset.photo) return openPhoto(state.db.photos.find((p) => p.id === t.dataset.photo));
  if (t.dataset.edit) {
    const [col, id] = t.dataset.edit.split(":");
    return edit(col, state.db[col].find((x) => x.id === id));
  }
  switch (t.dataset.act) {
    case "prev":
    case "next": {
      const d = new Date(state.cal.year, state.cal.month + (t.dataset.act === "next" ? 1 : -1), 1);
      state.cal.year = d.getFullYear();
      state.cal.month = d.getMonth();
      return render();
    }
    case "add-events": return edit("events", null, { date: state.cal.selected });
    case "add-prayers": return edit("prayers", null, { date: today });
    case "add-newsletters": return edit("newsletters", null, { date: today });
    case "add-donors": return edit("donors", null, { type: "개인", since: String(new Date().getFullYear()) });
  }
});

$view.addEventListener("change", (ev) => {
  if (ev.target.dataset.act === "upload") {
    uploadPhotos([...ev.target.files]);
    ev.target.value = "";
  }
});

$view.addEventListener("submit", (ev) => {
  if (ev.target.dataset.act !== "donor-key") return;
  ev.preventDefault();
  data.setDonorKey(ev.target.key.value.trim());
  refresh().then(() => {
    if (state.db.donorsLocked) {
      data.setDonorKey(null);
      toast("비밀번호가 맞지 않습니다.");
    }
  });
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
  if (!data.editable) {
    // 기본(시트 링크) 모드: 편집은 구글 시트에서. 시트 편집 권한이 있는 사람만 고칠 수 있다.
    $account.innerHTML = `${refreshBtn}${SHEET_URL ? `<a class="btn small" href="${esc(SHEET_URL)}" target="_blank" rel="noopener">✏️ 편집</a>` : ""}`;
  } else if (!state.me) {
    $account.innerHTML = `${refreshBtn}<button class="btn small" id="login">관리자</button>`;
    $account.querySelector("#login").onclick = login;
  } else {
    $account.innerHTML = `
      <span class="who">${esc(state.me.id)} · ${ROLES[state.me.role] || ""}</span>
      ${state.me.role === "admin" && SHEET_URL ? `<a class="btn small" href="${esc(SHEET_URL)}" target="_blank" rel="noopener">시트</a>` : ""}
      ${refreshBtn}
      <button class="btn small" id="logout">로그아웃</button>`;
    $account.querySelector("#logout").onclick = async () => {
      await data.logout();
      state.me = null;
      toast("로그아웃했습니다.");
      refresh();
    };
  }
  $account.querySelector("#refresh").onclick = refresh;
}

function login() {
  openForm({
    title: "관리자 로그인",
    submitLabel: "로그인",
    fields: [
      { name: "id", label: data.preview ? "아이디 (미리보기: admin 또는 calendar)" : "아이디", required: true },
      { name: "pw", label: data.preview ? "비밀번호 (미리보기: 아이디와 같음)" : "비밀번호", type: "password", required: true },
    ],
    onSubmit: async ({ id, pw }) => {
      const out = await data.login(id, pw);
      state.me = data.session();
      toast(`${out.id} (${ROLES[out.role]}) 로 로그인했습니다.`);
      await refresh();
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
    state.me = data.session();
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
function route() {
  const name = location.hash.replace(/^#\/?/, "").split("?")[0] || "home";
  return views[name] ? name : "home";
}

function render() {
  const r = route();
  $view.innerHTML = views[r]();
  const tab = r === "join" ? "about" : r;
  document.querySelectorAll(".tabbar a").forEach((a) => a.classList.toggle("active", a.dataset.route === tab));
  renderHeader();
}

window.addEventListener("hashchange", () => {
  render();
  window.scrollTo(0, 0);
});

// 뒤로가기: 앱처럼 "홈 ← 지금 화면" 두 단계만 기록에 남긴다.
//   다른 화면에서 뒤로가기 → 홈 / 홈에서 뒤로가기 → 앱 종료 (브라우저에서는 이전 사이트)
function go(hash) {
  const toHome = hash === "#/" || hash === "#";
  if (toHome) {
    if (route() === "home") return;
    if (history.state?.sub) history.back(); // 기록상 바로 앞이 홈
    else location.replace("#/");
    return;
  }
  if (route() === "home") history.pushState({ sub: true }, "", hash);
  else history.replaceState({ sub: true }, "", hash); // 화면끼리 옮겨 다녀도 기록이 쌓이지 않게
  render();
  window.scrollTo(0, 0);
}

document.addEventListener("click", (ev) => {
  const a = ev.target.closest('a[href^="#"]');
  if (!a || ev.defaultPrevented || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
  ev.preventDefault();
  go(a.getAttribute("href"));
});

// 다른 화면 주소로 바로 열었을 때도 뒤로가기가 홈으로 가도록 홈을 앞에 끼워 둔다.
if (route() !== "home") {
  const here = location.hash;
  history.replaceState(null, "", "#/");
  history.pushState({ sub: true }, "", here);
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
  $banner.innerHTML = `👀 <b>미리보기</b> — 예시 내용입니다. <code>js/config.js</code> 에 구글 시트 링크를 넣으면 실제 내용이 나타납니다.`;
}
render();
refresh();

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
