/**
 * File: SheetManager.gs
 */

function getInitialData() {
  try {
    const db = getDb();
    const staffSheet = db.getSheetByName(TABS.VARIABLES);
    const eventSheet = db.getSheetByName(TABS.EVENTS);
    if (!staffSheet) throw new Error("Tab Variables tidak ditemukan!");

    const lastRow = staffSheet.getLastRow();
    let staff = [];
    let izinReasons = [];
    if (lastRow > 1) {
      const rawData = staffSheet.getRange(2, 1, lastRow - 1, 1).getValues();
      staff = rawData.flat().map(s => s.toString().trim()).filter(s => s !== "");
      // Ambil sebab izin dari kolom 2 baris 2 ke bawah
      const rawIzin = staffSheet.getRange(2, 2, lastRow - 1, 1).getValues();
      izinReasons = rawIzin.flat().map(s => s.toString().trim()).filter(s => s !== "");
    }

    let events = [];
    if (eventSheet && eventSheet.getLastRow() > 1) {
      const rawEvents = eventSheet.getRange(2, 1, eventSheet.getLastRow() - 1, 2).getValues();
      events = rawEvents.map(row => ({ 
        date: row[0].toString(), 
        name: row[1].toString() 
      }));
    }

    return { staffList: staff, izinReasons: izinReasons, events: events, error: null };
  } catch (e) {
    return { staffList: [], izinReasons: [], events: [], error: e.message };
  }
}

function getFolderIdByType(type) {
  const db = getDb();
  const sheet = db.getSheetByName(TABS.FILE_MGMT);
  if (!sheet) return null;
  
  const data = sheet.getDataRange().getValues();
  let searchLabel = "";
  if (type === 'IN') searchLabel = "Folder_Masuk";
  if (type === 'OUT') searchLabel = "Folder_Keluar";
  if (type === 'IZIN') searchLabel = "Folder_Izin";
  if (type === 'LEMBUR') searchLabel = "Folder_Lembur";

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === searchLabel) {
      const url = data[i][1];
      const match = url.match(/[-\w]{25,}/);
      return match ? match[0] : null;
    }
  }
  return null;
}

function saveFileToDrive(base64Data, fileName, folderId) {
  if (!base64Data || !folderId) return "Error: Data/folderId kosong";
  try {
    const folder = DriveApp.getFolderById(folderId);
    if (!base64Data.includes(',')) throw new Error('Base64 format tidak valid');
    const contentType = base64Data.substring(5, base64Data.indexOf(';'));
    const bytes = Utilities.base64Decode(base64Data.split(',')[1]);
    const blob = Utilities.newBlob(bytes, contentType, fileName);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (e) {
    console.error("Gagal simpan file: " + e.message + " | fileName: " + fileName + " | folderId: " + folderId);
    return "Error Upload: " + e.message;
  }
}

function saveToSheet(tabName, dataArray) {
  try {
    const db = getDb();
    const sheet = db.getSheetByName(tabName);
    if (!sheet) throw new Error("Tab '" + tabName + "' tidak ditemukan!");
    sheet.appendRow([new Date(), ...dataArray]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}