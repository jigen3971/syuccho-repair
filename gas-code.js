const SHEET_NAME = "出張修理";
const DRIVE_FOLDER_NAME = "出張修理くん 音声";

function doPost(e) {
  const payload = JSON.parse(e.postData.contents);
  const visit = payload.visit || payload;
  const audioUrl = payload.audio ? saveAudioToDrive(payload.audio) : "";

  appendVisitToSheet(visit, audioUrl);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, audioUrl }))
    .setMimeType(ContentService.MimeType.JSON);
}

function appendVisitToSheet(visit, audioUrl) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "保存日時",
      "作業日",
      "作業時刻",
      "会社名",
      "担当者名",
      "電話番号",
      "住所",
      "GPS",
      "車名",
      "自社担当者",
      "走行距離",
      "修理内容",
      "メモ",
      "音声URL"
    ]);
  }

  sheet.appendRow([
    new Date(),
    visit.date || "",
    visit.time || "",
    visit.company || "",
    visit.person || "",
    visit.phone || "",
    visit.address || "",
    visit.gps || "",
    visit.car || "",
    visit.staff || "",
    visit.distance || "",
    visit.repairText || "",
    visit.memo || "",
    audioUrl
  ]);
}

function saveAudioToDrive(audio) {
  const folder = getOrCreateFolder(DRIVE_FOLDER_NAME);
  const bytes = Utilities.base64Decode(audio.base64);
  const blob = Utilities.newBlob(bytes, audio.mimeType || "audio/webm", audio.fileName || `voice_${Date.now()}.webm`);
  const file = folder.createFile(blob);
  return file.getUrl();
}

function getOrCreateFolder(name) {
  const folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(name);
}
