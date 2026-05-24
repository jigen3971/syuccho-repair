const GAS_URL = "https://script.google.com/macros/s/AKfycbzCshuCrW2bJlduhmZTNzm8PZhuqYUNgAJre6X4Ii462vP9zjfH88SADGm6Rl8vwBOd/exec";
const STORE_KEY = "syuccho_repair_v1";

function getData() {
  return JSON.parse(localStorage.getItem(STORE_KEY)) || { visits: [] };
}

function setData(data) {
  localStorage.setItem(STORE_KEY, JSON.stringify(data));
}

let currentScreen = "calendar";
let selectedDate = null;
let editingVisitId = null;
let calYear, calMonth;

function showScreen(name, title) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById("screen-" + name).classList.add("active");
  document.getElementById("page-title").textContent = title;
  document.getElementById("btn-back").classList.toggle("hidden", name === "calendar");
  currentScreen = name;
}

function goBack() {
  if (currentScreen === "form") {
    showScreen("day", formatDateLabel(selectedDate));
    renderDayDetail(selectedDate);
  } else {
    showScreen("calendar", "出張修理くん");
    renderCalendar();
  }
}

function initCalendar() {
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth();
  renderCalendar();
}

function prevMonth() {
  calMonth--;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  renderCalendar();
}

function nextMonth() {
  calMonth++;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendar();
}

function renderCalendar() {
  const data = getData();
  document.getElementById("month-label").textContent = `${calYear}年${calMonth + 1}月`;

  const first = new Date(calYear, calMonth, 1).getDay();
  const last = new Date(calYear, calMonth + 1, 0).getDate();

  let html = ["日","月","火","水","木","金","土"]
    .map(d => `<div class="cal-header">${d}</div>`).join("");

  for (let i = 0; i < first; i++) html += `<div class="cal-day empty"></div>`;

  for (let d = 1; d <= last; d++) {
    const ds = `${calYear}-${String(calMonth + 1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const has = data.visits.some(v => v.date === ds);
    html += `
      <div class="cal-day" onclick="selectDate('${ds}')">
        <span class="day-num">${d}</span>
        ${has ? '<div class="day-dot"></div>' : ''}
      </div>`;
  }

  document.getElementById("cal-grid").innerHTML = html;
}

function formatDateLabel(ds) {
  const d = new Date(ds);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function selectDate(ds) {
  selectedDate = ds;
  showScreen("day", formatDateLabel(ds));
  renderDayDetail(ds);
}

function renderDayDetail(ds) {
  const data = getData();
  const visits = data.visits.filter(v => v.date === ds);

  document.getElementById("day-title").textContent =
    `${formatDateLabel(ds)}の出張修理`;

  if (visits.length === 0) {
    document.getElementById("visit-list").innerHTML =
      `<p>この日の修理記録はありません</p>`;
    return;
  }

  document.getElementById("visit-list").innerHTML = visits.map(v => `
    <div class="visit-card" onclick="editVisit('${v.id}')">
      <div class="vc-name">${v.company || "会社名なし"}</div>
      <div class="vc-meta">${v.person || ""} ${v.phone || ""}</div>
      <div class="vc-meta">${v.car || ""} ${v.distance ? v.distance + "km" : ""}</div>
      <div class="vc-meta">${v.repairText || ""}</div>
    </div>
  `).join("");
}

function showAddForm() {
  editingVisitId = null;

  document.getElementById("f-company").value = "";
  document.getElementById("f-person").value = "";
  document.getElementById("f-phone").value = "";
  document.getElementById("f-address").value = "";
  document.getElementById("f-gps").value = "";
  document.getElementById("f-time").value = "";
  document.getElementById("f-car").value = "";
  document.getElementById("f-distance").value = "";
  document.getElementById("f-electric").checked = false;
  document.getElementById("f-oil").checked = false;
  document.getElementById("f-oil-amount").value = "";
  document.getElementById("f-oil-filter").checked = false;
  document.getElementById("f-other").checked = false;
  document.getElementById("f-memo").value = "";

  document.getElementById("btn-delete-visit").style.display = "none";

  showScreen("form", "修理記録追加");
}

function makeRepairText() {
  const arr = [];
  if (document.getElementById("f-electric").checked) arr.push("電気まわり");
  if (document.getElementById("f-oil").checked) {
    arr.push("オイル交換 " + document.getElementById("f-oil-amount").value);
  }
  if (document.getElementById("f-oil-filter").checked) arr.push("フィルター交換");
  if (document.getElementById("f-other").checked) arr.push("その他");
  return arr.join(" / ");
}

function saveVisit() {
  const data = getData();

  const visit = {
    id: editingVisitId || "v" + Date.now(),
    date: selectedDate,
    company: document.getElementById("f-company").value,
    person: document.getElementById("f-person").value,
    phone: document.getElementById("f-phone").value,
    address: document.getElementById("f-address").value,
    gps: document.getElementById("f-gps").value,
    time: document.getElementById("f-time").value,
    car: document.getElementById("f-car").value,
    distance: document.getElementById("f-distance").value,
    electric: document.getElementById("f-electric").checked,
    oil: document.getElementById("f-oil").checked,
    oilAmount: document.getElementById("f-oil-amount").value,
    oilFilter: document.getElementById("f-oil-filter").checked,
    other: document.getElementById("f-other").checked,
    repairText: makeRepairText(),
    memo: document.getElementById("f-memo").value
  };

  if (editingVisitId) {
    const i = data.visits.findIndex(v => v.id === editingVisitId);
    data.visits[i] = visit;
  } else {
    data.visits.push(visit);
  }

  setData(data);

fetch(GAS_URL, {
  method: "POST",
  mode: "no-cors",
  body: JSON.stringify(visit)
});

showToast("保存しました");

showScreen("day", formatDateLabel(selectedDate));

renderDayDetail(selectedDate);

renderCalendar();
}

function editVisit(id) {
  const v = getData().visits.find(v => v.id === id);
  if (!v) return;

  editingVisitId = id;

  document.getElementById("f-company").value = v.company || "";
  document.getElementById("f-person").value = v.person || "";
  document.getElementById("f-phone").value = v.phone || "";
  document.getElementById("f-address").value = v.address || "";
  document.getElementById("f-gps").value = v.gps || "";
  document.getElementById("f-time").value = v.time || "";
  document.getElementById("f-car").value = v.car || "";
  document.getElementById("f-distance").value = v.distance || "";
  document.getElementById("f-electric").checked = v.electric || false;
  document.getElementById("f-oil").checked = v.oil || false;
  document.getElementById("f-oil-amount").value = v.oilAmount || "";
  document.getElementById("f-oil-filter").checked = v.oilFilter || false;
  document.getElementById("f-other").checked = v.other || false;
  document.getElementById("f-memo").value = v.memo || "";

  document.getElementById("btn-delete-visit").style.display = "block";
  showScreen("form", "修理記録編集");
}

function deleteCurrentVisit() {
  const data = getData();
  data.visits = data.visits.filter(v => v.id !== editingVisitId);
  setData(data);
  showScreen("day", formatDateLabel(selectedDate));
  renderDayDetail(selectedDate);
  renderCalendar();
}

function openAddressMaps() {
  const address = document.getElementById("f-address").value;
  if (!address) return showToast("住所を入力してください");
  window.open("https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(address));
}

function getGPS() {
  navigator.geolocation.getCurrentPosition(pos => {
    document.getElementById("f-gps").value =
      pos.coords.latitude.toFixed(6) + "," + pos.coords.longitude.toFixed(6);
    showToast("GPS取得しました");
  });
}

function startVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();
  recognition.lang = "ja-JP";
  recognition.start();
  recognition.onresult = e => {
    document.getElementById("f-memo").value = e.results[0][0].transcript;
  };
}

function showCustomers() {
  showToast("今回は手入力式です");
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.style.display = "block";
  setTimeout(() => t.style.display = "none", 2000);
}

initCalendar();