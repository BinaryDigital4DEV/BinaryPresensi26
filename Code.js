/**
 * File: Code.gs
 */

function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('Binary Digital - Attendance')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getAddressFromCoords(coords) {
  if (!coords || coords === "GPS OFF" || coords.includes("Mencari")) return "Lokasi tidak diketahui";
  try {
    const latLong = coords.split(",");
    const response = Maps.newGeocoder().reverseGeocode(latLong[0].trim(), latLong[1].trim());
    if (response.status === 'OK' && response.results.length > 0) {
      return response.results[0].formatted_address;
    }
    return coords;
  } catch (e) {
    return coords;
  }
}

function processSubmit(payload) {
  const data = JSON.parse(payload);
  const folderId = getFolderIdByType(data.action);
  const now = new Date();
  const timestampStr = Utilities.formatDate(now, "GMT+7", "dd/MM/yyyy HH:mm:ss");
  const fileName = data.action + "_" + data.staff + "_" + Utilities.formatDate(now, "GMT+7", "yyyyMMdd_HHmm");
  
  // Mencatat email user untuk validasi akun
  let userEmail = Session.getActiveUser().getEmail();
  if (!userEmail || userEmail === "") userEmail = "Email Tidak Terdeteksi";
  
  const fullAddress = data.location;
  
  let fileUrl = "-";
  if (data.photo) {
    const watermarkText = 
      "NAMA: " + data.staff + "\n" +
      "GOOGLE ACCOUNT: " + userEmail + "\n" + 
      "WAKTU: " + timestampStr + "\n" +
      "STATUS: " + (data.action === 'IN' ? 'MASUK' : 'KELUAR') + " (" + data.shift + ")\n" +
      "LOKASI: " + fullAddress;

    fileUrl = saveFileToDrive(data.photo, fileName + ".jpg", folderId);
    
    try {
      const fileId = fileUrl.match(/[-\w]{25,}/)[0];
      DriveApp.getFileById(fileId).setDescription(watermarkText);
    } catch(e) {
      console.error("Gagal menambah deskripsi file");
    }
  }

  switch(data.action) {
    case 'IN':
    case 'OUT':
      // [Timestamp, Staff, Email, Action, Shift, Location, PhotoURL]
      return saveToSheet(TABS.ATTENDANCE, [data.staff, userEmail, data.action, data.shift, fullAddress, fileUrl]);
    case 'IZIN': {
      // IZIN: support FULLDAY/NON FULLDAY, tanggal, jam, durasi, alasan, bukti gambar
      // Format: [Nama, Email, Jenis Izin, Mode, Tgl Mulai, Tgl Selesai, Jam Mulai, Jam Selesai, Durasi, Alasan, BuktiURL]
      // Pastikan semua field IZIN selalu terisi (kosong jika tidak diisi)
        if (!data.staff || !data.reasonType || !data.detail || !data.izinMode ||
            ((data.izinMode === 'FULLDAY') && (!data.izinDayStart || !data.izinDayEnd || !data.izinTotalHari)) ||
            ((data.izinMode === 'NONFULLDAY') && (!data.izinTimeStart || !data.izinTimeEnd || !data.izinTotalJam)) ||
            !data.izinBukti) {
          throw new Error('Semua field IZIN wajib diisi.');
        }
        let izinBuktiUrl = '';
        if (data.izinBukti && data.izinBukti.startsWith('data:image')) {
          try {
            const folderId = getFolderIdByType('IZIN');
            const fileName = `Bukti_IZIN_${data.staff}_${new Date().toISOString().replace(/[:.]/g,'-')}.jpg`;
            izinBuktiUrl = saveFileToDrive(data.izinBukti, fileName, folderId);
          } catch(e) {
            izinBuktiUrl = '-';
          }
        } else {
          izinBuktiUrl = '-';
        }
        return saveToSheet(TABS.PERMISSIONS, [
          now,
          data.staff,
          '', // Email (optional/future)
          data.reasonType,
          data.izinMode,
          data.izinDayStart,
          data.izinDayEnd,
          data.izinTimeStart,
          data.izinTimeEnd,
          data.izinMode === 'FULLDAY' ? data.izinTotalHari : data.izinTotalJam,
          data.detail,
          izinBuktiUrl
        ]);
    }
    case 'LEMBUR': {
      // Validasi wajib foto dokumen lembur
      if (!data.lemburSurat) return { success: false, error: "Foto dokumen lembur wajib diunggah." };
      // Siapkan tab dan header jika belum ada
      const db = getDb();
      let sheet = db.getSheetByName(TABS.OVERTIME);
      if (!sheet) {
        sheet = db.insertSheet(TABS.OVERTIME);
        sheet.appendRow(["Timestamp", "Hari Lembur", "Nama Karyawan", "Jam Mulai", "Jam Selesai", "Durasi (Jam/menit)", "Deskripsi", "Foto Surat"]);
      }
      // Simpan file foto selfie (jika ada)
      let lemburFileUrl = data.photo ? saveFileToDrive(data.photo, fileName + ".jpg", folderId) : "-";
      // Simpan file foto surat
      let suratFileUrl = saveFileToDrive(data.lemburSurat, fileName + "_surat.jpg", folderId);
      // Durasi: terima format 'X jam Y menit' dari frontend, fallback hitung manual jika kosong
      let durasi = data.lemburHours || '';
      if (!durasi && data.lemburStart && data.lemburEnd) {
        try {
          const [sh, sm] = data.lemburStart.split(':').map(Number);
          const [eh, em] = data.lemburEnd.split(':').map(Number);
          let startM = sh * 60 + sm;
          let endM = eh * 60 + em;
          let dur = endM - startM;
          if(dur < 0) dur += 24 * 60;
          const h = Math.floor(dur/60), m = dur%60;
          let durText = '';
          if (h > 0) durText += h + ' jam';
          if (m > 0) durText += (durText ? ' ' : '') + m + ' menit';
          if (durText === '') durText = '0 menit';
          durasi = durText;
        } catch(e) { durasi = ''; }
      }
      // Simpan data lembur
      // Format lemburDay ke DD/MM/YYYY jika input berupa 'DD MM YYYY' atau 'YYYY-MM-DD'
      let hariLembur = data.lemburDay || '';
      if (hariLembur && hariLembur.match(/^\d{2} \d{2} \d{4}$/)) {
        const [dd, mm, yyyy] = hariLembur.split(' ');
        hariLembur = `${dd}/${mm}/${yyyy}`;
      } else if (hariLembur && hariLembur.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [yyyy, mm, dd] = hariLembur.split('-');
        hariLembur = `${dd}/${mm}/${yyyy}`;
      }
      sheet.appendRow([
        new Date(),
        hariLembur,
        data.staff,
        data.lemburStart || '',
        data.lemburEnd || '',
        durasi,
        data.lemburDesc || '',
        suratFileUrl
      ]);
      return { success: true };
    }
    default:
      return { success: false, error: "Aksi tidak dikenal" };
  }
}