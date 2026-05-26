const GAS_URL = "https://script.google.com/macros/s/AKfycbzCshuCrW2bJlduhmZTNzm8PZhuqYUNgAJre6X4Ii462vP9zjfH88SADGm6Rl8vwBOd/exec";
const STORE_KEY = "syuccho_repair_v1";
const MAX_PHOTO_BYTES = 500 * 1024;
const MAX_AUDIO_BYTES = 1200 * 1024;
const MAX_AUDIO_SECONDS = 60;

function getData() {
  return JSON.parse(localStorage.getItem(STORE_KEY)) || { visits: [], customers: [] };
}

function setData(data) {
  localStorage.setItem(STORE_KEY, JSON.stringify(data));
}

let currentScreen = "calendar";
let selectedDate = null;
let editingVisitId = null;
let calYear, calMonth;
let mediaRecorder = null;
let audioChunks = [];
let recordedAudioBlob = null;
let recordedAudioMimeType = "";
let speechRecognition = null;
let compressedPhoto = null;

function showScreen(name, title) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
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
  if (calMonth < 0) {
    calMonth = 11;
    calYear--;
  }
  renderCalendar();
}

function nextMonth() {
  calMonth++;
  if (calMonth > 11) {
    calMonth = 0;
    calYear++;
  }
  renderCalendar();
}

function renderCalendar() {
  const data = getData();
  document.getElementById("month-label").textContent = `${calYear}年${calMonth + 1}月`;

  const first = new Date(calYear, calMonth, 1).getDay();
  const last = new Date(calYear, calMonth + 1, 0).getDate();

  let html = ["日", "月", "火", "水", "木", "金", "土"]
    .map((d) => `<div class="cal-header">${d}</div>`)
    .join("");

  for (let i = 0; i < first; i++) {
    html += '<div class="cal-day empty"></div>';
  }

  for (let d = 1; d <= last; d++) {
    const ds = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const has = data.visits.some((v) => v.date === ds);
    html += `
      <button class="cal-day" type="button" onclick="selectDate('${ds}')">
        <span class="day-num">${d}</span>
        ${has ? '<span class="day-dot"></span>' : ""}
      </button>`;
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
  const visits = data.visits.filter((v) => v.date === ds);

  document.getElementById("day-title").textContent = `${formatDateLabel(ds)}の出張修理`;

  if (visits.length === 0) {
    document.getElementById("visit-list").innerHTML = "<p>この日の修理記録はありません</p>";
    return;
  }

  document.getElementById("visit-list").innerHTML = visits.map((v) => `
    <button class="visit-card" type="button" onclick="editVisit('${v.id}')">
      <span class="vc-name">${v.company || "会社名なし"}</span>
      <span class="vc-meta">${v.person || ""} ${v.phone || ""}</span>
      <span class="vc-meta">${v.car || ""} ${v.distance ? v.distance + "km" : ""}</span>
      <span class="vc-meta">${v.repairText || ""}</span>
      ${v.audioFileName ? `<span class="vc-meta">音声あり：${v.audioFileName}</span>` : ""}
      ${v.photoFileName ? `<span class="vc-meta">写真あり：${v.photoFileName}</span>` : ""}
    </button>
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
  document.getElementById("f-staff").value = "";
  document.getElementById("f-distance").value = "";
  document.getElementById("f-electric").checked = false;
  document.getElementById("f-oil").checked = false;
  document.getElementById("f-oil-amount").value = "";
  document.getElementById("f-oil-filter").checked = false;
  document.getElementById("f-other").checked = false;
  document.getElementById("f-memo").value = "";
  clearVoiceRecording(false);
  clearPhoto(false);

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

function getAudioExtension(mimeType) {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

function makeAudioFileName(visit) {
  const safeCompany = (visit.company || "company").replace(/[\\/:*?"<>|]/g, "_");
  const safeDate = visit.date || new Date().toISOString().slice(0, 10);
  const ext = getAudioExtension(recordedAudioMimeType);
  return `${safeDate}_${safeCompany}_${visit.id}.${ext}`;
}

function makePhotoFileName(visit) {
  const safeCompany = (visit.company || "company").replace(/[\\/:*?"<>|]/g, "_");
  const safeDate = visit.date || new Date().toISOString().slice(0, 10);
  return `${safeDate}_${safeCompany}_${visit.id}.jpg`;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function buildVisitPayload(visit) {
  const payload = {
    mode: "saveVisit",
    visit
  };

  if (recordedAudioBlob) {
    if (recordedAudioBlob.size > MAX_AUDIO_BYTES) {
      throw new Error("AUDIO_TOO_LARGE");
    }

    const fileName = makeAudioFileName(visit);
    payload.audio = {
      fileName,
      mimeType: recordedAudioMimeType || recordedAudioBlob.type || "audio/webm",
      base64: await blobToBase64(recordedAudioBlob)
    };
    visit.audioFileName = fileName;
  }

  if (compressedPhoto) {
    if (compressedPhoto.compressedSize > MAX_PHOTO_BYTES) {
      throw new Error("PHOTO_TOO_LARGE");
    }

    const fileName = makePhotoFileName(visit);
    payload.photo = {
      fileName,
      mimeType: compressedPhoto.mimeType,
      base64: compressedPhoto.base64
    };
    visit.photoFileName = fileName;
  }

  return payload;
}

async function saveVisit() {
  const saveBtn = document.getElementById("btn-save-visit");
  saveBtn.disabled = true;
  saveBtn.textContent = "保存中...";

  const data = getData();
  const existingVisit = editingVisitId
    ? data.visits.find((v) => v.id === editingVisitId)
    : null;

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
    staff: document.getElementById("f-staff").value,
    distance: document.getElementById("f-distance").value,
    electric: document.getElementById("f-electric").checked,
    oil: document.getElementById("f-oil").checked,
    oilAmount: document.getElementById("f-oil-amount").value,
    oilFilter: document.getElementById("f-oil-filter").checked,
    other: document.getElementById("f-other").checked,
    repairText: makeRepairText(),
    memo: document.getElementById("f-memo").value,
    audioFileName: existingVisit?.audioFileName || "",
    photoFileName: existingVisit?.photoFileName || ""
  };

  try {
    const payload = await buildVisitPayload(visit);

    if (editingVisitId) {
      const i = data.visits.findIndex((v) => v.id === editingVisitId);
      data.visits[i] = visit;
    } else {
      data.visits.push(visit);
    }

    setData(data);

    await fetch(GAS_URL, {
      method: "POST",
      mode: "no-cors",
      body: JSON.stringify(payload)
    });

    const sentMedia = [
      recordedAudioBlob ? "音声" : "",
      compressedPhoto ? "写真" : ""
    ].filter(Boolean).join("・");

    showToast(sentMedia ? `保存しました。${sentMedia}も送信しました` : "保存しました");
    showScreen("day", formatDateLabel(selectedDate));
    renderDayDetail(selectedDate);
    renderCalendar();
  } catch (error) {
    console.error(error);
    if (error.message === "AUDIO_TOO_LARGE") {
      showToast("音声が大きすぎます。短く録音してください");
    } else if (error.message === "PHOTO_TOO_LARGE") {
      showToast("写真が大きすぎます。別の写真を選んでください");
    } else {
      showToast("保存に失敗しました");
    }
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "保存する";
  }
}

function editVisit(id) {
  const v = getData().visits.find((visit) => visit.id === id);
  if (!v) return;

  editingVisitId = id;

  document.getElementById("f-company").value = v.company || "";
  document.getElementById("f-person").value = v.person || "";
  document.getElementById("f-phone").value = v.phone || "";
  document.getElementById("f-address").value = v.address || "";
  document.getElementById("f-gps").value = v.gps || "";
  document.getElementById("f-time").value = v.time || "";
  document.getElementById("f-car").value = v.car || "";
  document.getElementById("f-staff").value = v.staff || "";
  document.getElementById("f-distance").value = v.distance || "";
  document.getElementById("f-electric").checked = v.electric || false;
  document.getElementById("f-oil").checked = v.oil || false;
  document.getElementById("f-oil-amount").value = v.oilAmount || "";
  document.getElementById("f-oil-filter").checked = v.oilFilter || false;
  document.getElementById("f-other").checked = v.other || false;
  document.getElementById("f-memo").value = v.memo || "";
  clearVoiceRecording(false);
  clearPhoto(false);

  document.getElementById("btn-delete-visit").style.display = "block";
  showScreen("form", "修理記録編集");
}

function deleteCurrentVisit() {
  const data = getData();
  data.visits = data.visits.filter((v) => v.id !== editingVisitId);
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
  navigator.geolocation.getCurrentPosition((pos) => {
    document.getElementById("f-gps").value =
      pos.coords.latitude.toFixed(6) + "," + pos.coords.longitude.toFixed(6);
    showToast("GPS取得しました");
  });
}

function getSupportedAudioMimeType() {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus"
  ];

  return types.find((type) => window.MediaRecorder && MediaRecorder.isTypeSupported(type)) || "";
}

function startSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  speechRecognition = new SpeechRecognition();
  speechRecognition.lang = "ja-JP";
  speechRecognition.continuous = true;
  speechRecognition.interimResults = true;

  speechRecognition.onresult = (event) => {
    let transcript = "";
    for (let i = 0; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    document.getElementById("f-memo").value = transcript;
  };

  speechRecognition.start();
}

function stopSpeechRecognition() {
  if (!speechRecognition) return;
  speechRecognition.stop();
  speechRecognition = null;
}

async function startVoiceRecording() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast("このブラウザは録音に対応していません");
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    recordedAudioBlob = null;
    recordedAudioMimeType = getSupportedAudioMimeType();

    mediaRecorder = new MediaRecorder(
      stream,
      {
        ...(recordedAudioMimeType ? { mimeType: recordedAudioMimeType } : {}),
        audioBitsPerSecond: 24000
      }
    );

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      recordedAudioBlob = new Blob(audioChunks, {
        type: recordedAudioMimeType || "audio/webm"
      });

      const preview = document.getElementById("voice-preview");
      preview.src = URL.createObjectURL(recordedAudioBlob);
      preview.style.display = "block";

      stream.getTracks().forEach((track) => track.stop());
      const audioSize = formatFileSize(recordedAudioBlob.size);
      document.getElementById("record-status").textContent =
        `録音済みです：${audioSize}。保存するとGoogleドライブへ送信されます。`;
      document.getElementById("btn-record-clear").disabled = false;

      if (recordedAudioBlob.size > MAX_AUDIO_BYTES) {
        showToast("音声が大きすぎます。短く録音してください");
      }
    };

    mediaRecorder.start();
    startSpeechRecognition();

    setTimeout(() => {
      if (mediaRecorder && mediaRecorder.state === "recording") {
        stopVoiceRecording();
        showToast("録音は60秒で自動停止しました");
      }
    }, MAX_AUDIO_SECONDS * 1000);

    document.getElementById("btn-record-start").disabled = true;
    document.getElementById("btn-record-stop").disabled = false;
    document.getElementById("btn-record-clear").disabled = true;
    document.getElementById("record-status").textContent = "録音中です...";
  } catch (error) {
    console.error(error);
    showToast("マイクの使用を許可してください");
  }
}

function stopVoiceRecording() {
  stopSpeechRecognition();

  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }

  document.getElementById("btn-record-start").disabled = false;
  document.getElementById("btn-record-stop").disabled = true;
}

function clearVoiceRecording(showMessage = true) {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }

  stopSpeechRecognition();
  audioChunks = [];
  recordedAudioBlob = null;
  recordedAudioMimeType = "";

  const preview = document.getElementById("voice-preview");
  preview.removeAttribute("src");
  preview.style.display = "none";

  document.getElementById("btn-record-start").disabled = false;
  document.getElementById("btn-record-stop").disabled = true;
  document.getElementById("btn-record-clear").disabled = true;
  document.getElementById("record-status").textContent = "録音すると、保存時にGoogleドライブへ音声ファイルとして送信されます。";

  if (showMessage) {
    showToast("録音を削除しました");
  }
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

async function resizePhoto(file, maxSize = 800, quality = 0.58) {
  const img = await fileToImage(file);
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, width, height);

  let blob = await canvasToBlob(canvas, "image/jpeg", quality);

  if (blob.size > MAX_PHOTO_BYTES) {
    blob = await canvasToBlob(canvas, "image/jpeg", 0.45);
  }

  const base64 = await blobToBase64(blob);

  return {
    base64,
    blob,
    mimeType: "image/jpeg",
    originalSize: file.size,
    compressedSize: blob.size,
    width,
    height
  };
}

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)}KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

async function handlePhotoSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    showToast("写真ファイルを選んでください");
    clearPhoto(false);
    return;
  }

  document.getElementById("photo-status").textContent = "写真を小さくしています...";

  try {
    compressedPhoto = await resizePhoto(file);

    const preview = document.getElementById("photo-preview");
    preview.src = URL.createObjectURL(compressedPhoto.blob);
    preview.style.display = "block";

    document.getElementById("btn-photo-clear").disabled = false;
    document.getElementById("photo-status").textContent =
      `写真を縮小しました：${formatFileSize(compressedPhoto.originalSize)} → ${formatFileSize(compressedPhoto.compressedSize)} (${compressedPhoto.width}x${compressedPhoto.height})`;

    if (compressedPhoto.compressedSize > MAX_PHOTO_BYTES) {
      showToast("まだ写真が大きいです。別の写真を選んでください");
    }
  } catch (error) {
    console.error(error);
    showToast("写真の縮小に失敗しました");
    clearPhoto(false);
  }
}

function clearPhoto(showMessage = true) {
  compressedPhoto = null;

  const input = document.getElementById("f-photo");
  if (input) {
    input.value = "";
  }

  const preview = document.getElementById("photo-preview");
  if (preview) {
    preview.removeAttribute("src");
    preview.style.display = "none";
  }

  const clearBtn = document.getElementById("btn-photo-clear");
  if (clearBtn) {
    clearBtn.disabled = true;
  }

  const status = document.getElementById("photo-status");
  if (status) {
    status.textContent = "選択した写真は自動で小さくしてからGoogleドライブへ送信します。";
  }

  if (showMessage) {
    showToast("写真を削除しました");
  }
}

function showCustomers() {
  showToast("今回は手入力式です");
}

function showAddCustomer() {
  document.getElementById("customer-form").style.display = "block";
}

function saveCustomer() {
  showToast("今回は手入力式です");
}

function cancelCustomerForm() {
  document.getElementById("customer-form").style.display = "none";
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.style.display = "block";
  setTimeout(() => {
    t.style.display = "none";
  }, 2400);
}

initCalendar();
