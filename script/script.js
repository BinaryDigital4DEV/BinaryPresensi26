/**
 * KONFIGURASI API
 * URL Deployment Baru (Updated)
 */
const APPSCRIPT_URL = "https://script.google.com/macros/s/AKfycbxeVKs3Uai_gakqBFYiYg5-wahixtSqHyuXUhalbG2BUwOzW8uuI8JWMmSQa1FbMBu-/exec";

console.log("Script Loaded - Binary Digital Attendance");

// --- API HELPER ---
async function callApi(command, payload = {}, additionalData = {}) {
  const body = {
    command: command,
    payload: payload, 
    ...additionalData 
  };
  
  try {
    const response = await fetch(APPSCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify(body),
      // PENTING: Gunakan text/plain untuk menghindari Preflight CORS Error di GAS
      headers: { "Content-Type": "text/plain;charset=utf-8" } 
    });
    
    const result = await response.json();
    return result;
  } catch (e) {
    console.error("API Error", e);
    return { error: "Gagal menghubungi server. Periksa koneksi internet atau URL API." };
  }
}

// --- GLOBAL VARIABLES ---
let currentMode = '';
let selectedShift = 'Pagi';
let capturedBase64 = null;
let camStream = null;
let camFacing = 'user';
let addressText = "Mencari Lokasi...";
let izinBuktiInput = null;
let izinBuktiBase64 = '';
let capturedBase64Lembur = null;
let camStreamLembur = null;
let camFacingLembur = 'environment';

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    // Safety check for Lucide icons
    try {
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    } catch (e) { console.warn("Lucide icon library loading..."); }

    updateClock();
    setInterval(updateClock, 1000);
    initGeoLocation();
    
    // Panggil data awal tanpa await agar UI tidak blocking
    fetchStaff(); 
    
    initIzinListeners();
    initLemburListeners();
});

// --- CLOCK & GREETING ---
function updateClock() {
    const now = new Date();
    const clockEl = document.getElementById('clock');
    const dateEl = document.getElementById('date-label');
    const greetEl = document.getElementById('greet-msg');
    
    if(clockEl) clockEl.innerText = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
    if(dateEl) dateEl.innerText = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    
    const hr = now.getHours();
    let g = "Selamat Malam";
    if(hr < 11) g = "Selamat Pagi";
    else if(hr < 15) g = "Selamat Siang";
    else if(hr < 19) g = "Selamat Sore";
    if(greetEl) greetEl.innerText = g;
    return { time: now.toLocaleTimeString('id-ID', {hour12:false}), date: now.toLocaleDateString('id-ID', {weekday:'long', day:'numeric', month:'long', year:'numeric'}) };
}

// --- GEOLOCATION (API Call) ---
function initGeoLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (pos) => {
            const coords = pos.coords.latitude + ", " + pos.coords.longitude;
            try {
                const res = await callApi('geo', {}, { coords: coords });
                addressText = (res && typeof res === 'string') ? res : coords;
                const statusEl = document.getElementById('geo-status');
                if(statusEl) statusEl.innerHTML = '<span class="status-dot bg-green-400"></span>Terverifikasi';
            } catch (e) {
                addressText = coords;
                const statusEl = document.getElementById('geo-status');
                if(statusEl) statusEl.innerHTML = '<span class="status-dot bg-yellow-400"></span>GPS Only';
            }
        }, () => {
            addressText = "GPS Tidak Aktif";
            const statusEl = document.getElementById('geo-status');
            if(statusEl) statusEl.innerHTML = '<span class="status-dot bg-red-400"></span>Tanpa GPS';
        });
    }
}

// --- FETCH DATA STAFF (API Call) ---
async function fetchStaff() {
    try {
        const data = await callApi('getInitialData');
        
        const select = document.getElementById('staff-select');
        if(select) {
            if(data.staffList && data.staffList.length > 0) {
                select.innerHTML = '<option value="">Pilih Nama Anda...</option>';
                data.staffList.forEach(name => {
                    let opt = document.createElement('option');
                    opt.value = name; opt.text = name;
                    select.add(opt);
                });
            } else {
                 select.innerHTML = '<option value="">Gagal memuat data</option>';
            }
        }

        const izinSelect = document.getElementById('izin-type');
        if(izinSelect && data.izinReasons) {
            izinSelect.innerHTML = '<option value="">Pilih Jenis Izin...</option>';
            data.izinReasons.forEach(reason => {
                let opt = document.createElement('option');
                opt.value = reason; opt.text = reason;
                izinSelect.add(opt);
            });
        }
        
        if(data.events) {
            const todayKey = new Date().toLocaleDateString('en-US', {month: '2-digit', day: '2-digit'});
            const ev = data.events.find(e => e.date == todayKey);
            const evEl = document.getElementById('event-name');
            if(ev && evEl) evEl.innerText = ev.name;
        }

    } catch (e) {
        console.error("Gagal load data awal", e);
        const select = document.getElementById('staff-select');
        if(select) select.innerHTML = '<option value="">Offline (Cek Koneksi)</option>';
    }
}

// --- UI HANDLERS (MODAL & TABS) ---
// Attached to window to ensure global access from HTML onclick
window.openForm = function(type) {
    console.log("Membuka form:", type); 
    currentMode = type;
    const titleMap = { 'IN': 'Masuk Kerja', 'OUT': 'Pulang Kerja', 'IZIN': 'Izin / Cuti', 'LEMBUR': 'Lembur Unit' };
    
    const titleEl = document.getElementById('sheet-title');
    if(titleEl) titleEl.innerText = titleMap[type] || 'Form Absensi';
    
    const els = {
        shift: document.getElementById('ui-shift'),
        camera: document.getElementById('ui-camera'),
        izin: document.getElementById('ui-izin'),
        lembur: document.getElementById('ui-lembur')
    };
    
    if(els.shift) els.shift.classList.toggle('hidden', type !== 'IN' && type !== 'OUT');
    if(els.camera) els.camera.classList.toggle('hidden', type !== 'IN' && type !== 'OUT');
    if(els.izin) els.izin.classList.toggle('hidden', type !== 'IZIN');
    if(els.lembur) els.lembur.classList.toggle('hidden', type !== 'LEMBUR');

    const elLemburSurat = document.getElementById('ui-lembur-surat');
    const elLemburHours = document.getElementById('ui-lembur-hours');
    const elLemburDesc = document.getElementById('ui-lembur-desc');
    
    if (type === 'LEMBUR') {
         if(elLemburSurat) elLemburSurat.style.display = '';
         if(elLemburHours) elLemburHours.style.display = '';
         if(elLemburDesc) elLemburDesc.style.display = '';
         
         // Reset Fields
         const lStart = document.getElementById('lembur-start');
         const lEnd = document.getElementById('lembur-end');
         const lDesc = document.getElementById('lembur-desc');
         const lHours = document.getElementById('lembur-hours');
         const lDay = document.getElementById('lembur-day');
         const lDayDisp = document.getElementById('lembur-day-display');

         if(lStart) lStart.value = '';
         if(lEnd) lEnd.value = '';
         if(lDesc) lDesc.value = '';
         if(lHours) lHours.value = 0;
         if(lDay) lDay.value = '';
         if(lDayDisp) lDayDisp.innerText = '';
         
         capturedBase64Lembur = null;
         
         killCamera(); 
         initCameraLembur('environment');
    } else {
        if(elLemburSurat) elLemburSurat.style.display = 'none';
        if(elLemburHours) elLemburHours.style.display = 'none';
        if(elLemburDesc) elLemburDesc.style.display = 'none';
        killCameraLembur();
    }

    if (type === 'IN' || type === 'OUT') {
        initCamera('user');
    }

    const overlay = document.getElementById('overlay');
    const sheet = document.getElementById('sheet');
    if(overlay) {
        overlay.classList.remove('hidden');
        setTimeout(() => overlay.style.opacity = "1", 10);
    }
    if(sheet) {
        setTimeout(() => sheet.classList.remove('translate-y-full'), 10);
    }
}

window.closeModal = function() {
    const overlay = document.getElementById('overlay');
    const sheet = document.getElementById('sheet');
    if(sheet) sheet.classList.add('translate-y-full');
    if(overlay) overlay.style.opacity = "0";
    
    setTimeout(() => {
        if(overlay) overlay.classList.add('hidden');
        killCamera();
        killCameraLembur();
        resetFormUI();
    }, 400);
}

function resetFormUI() {
    capturedBase64 = null;
    capturedBase64Lembur = null;
    
    const photoPrev = document.getElementById('photo-preview');
    const videoEl = document.getElementById('video');
    if(photoPrev) photoPrev.classList.add('hidden');
    if(videoEl) videoEl.classList.remove('hidden');
    
    const photoPrevLembur = document.getElementById('photo-preview-lembur');
    const videoLembur = document.getElementById('video-lembur');
    if(photoPrevLembur) photoPrevLembur.classList.add('hidden');
    if(videoLembur) videoLembur.classList.remove('hidden');

    izinBuktiBase64 = '';
    if (izinBuktiInput) izinBuktiInput.value = '';
    const imgBukti = document.getElementById('izin-bukti-img');
    const prevBukti = document.getElementById('izin-bukti-preview');
    if(imgBukti) imgBukti.src = '';
    if(prevBukti) prevBukti.style.display = 'none';
    
    const btn = document.getElementById('snap-btn');
    if(btn) {
        btn.innerHTML = '<i data-lucide="camera" class="w-6 h-6"></i> AMBIL FOTO';
        btn.classList.remove('bg-green-600');
    }
    
    const btnLembur = document.getElementById('snap-btn-lembur');
    if(btnLembur) {
        btnLembur.innerHTML = '<i data-lucide="camera" class="w-6 h-6"></i> AMBIL FOTO SURAT';
        btnLembur.classList.remove('bg-green-600');
    }
    
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

window.setShift = function(s) {
    selectedShift = s;
    const isPagi = s === 'Pagi';
    const btnPagi = document.getElementById('btn-pagi');
    const btnSiang = document.getElementById('btn-siang');
    
    if(btnPagi) btnPagi.className = isPagi ? 'p-4 rounded-2xl border-2 font-bold transition-all border-blue-600 bg-blue-600 text-white shadow-lg' : 'p-4 rounded-2xl border-2 font-bold transition-all border-gray-100 bg-gray-50 text-gray-400';
    if(btnSiang) btnSiang.className = !isPagi ? 'p-4 rounded-2xl border-2 font-bold transition-all border-blue-600 bg-blue-600 text-white shadow-lg' : 'p-4 rounded-2xl border-2 font-bold transition-all border-gray-100 bg-gray-50 text-gray-400';
}

// --- SUBMIT LOGIC (MAIN API CALL) ---
window.submitNow = async function() {
    const staffEl = document.getElementById('staff-select');
    const staff = staffEl ? staffEl.value : '';
    
    if(!staff) return Swal.fire('Oops', 'Pilih nama Anda dulu.', 'warning');

    let payload = { action: currentMode, staff };

    if(currentMode === 'LEMBUR') {
        const lemburStart = document.getElementById('lembur-start').value;
        const lemburEnd = document.getElementById('lembur-end').value;
        const lemburDesc = document.getElementById('lembur-desc').value;
        const lemburHours = document.getElementById('lembur-hours').value;
        const rawDay = document.getElementById('lembur-day').value;
        
        let lemburDay = '';
        if (rawDay) {
            const [yyyy, mm, dd] = rawDay.split('-');
            lemburDay = `${dd} ${mm} ${yyyy}`;
        }

        if(!capturedBase64Lembur) return Swal.fire('Oops', 'Ambil foto dokumen lembur.', 'warning');
        if(!lemburStart || !lemburEnd) return Swal.fire('Oops', 'Isi jam mulai dan selesai lembur.', 'warning');
        if(!lemburDesc) return Swal.fire('Oops', 'Isi deskripsi pekerjaan lembur.', 'warning');

        payload = {
            action: currentMode,
            staff,
            photo: capturedBase64, 
            location: addressText,
            hours: lemburHours,
            lemburStart,
            lemburEnd,
            lemburDesc,
            lemburDay,
            lemburSurat: capturedBase64Lembur
        };

    } else if (currentMode === 'IN' || currentMode === 'OUT') {
        if(!capturedBase64) return Swal.fire('Oops', 'Ambil foto selfie dulu.', 'warning');
        payload = {
            action: currentMode,
            staff,
            shift: selectedShift,
            photo: capturedBase64,
            location: addressText
        };

    } else if (currentMode === 'IZIN') {
        const reasonType = document.getElementById('izin-type').value;
        const detail = document.getElementById('izin-detail').value;
        const checkFull = document.getElementById('izin-fullday-check');
        const checkNonFull = document.getElementById('izin-nonfullday-check');
        
        if(!reasonType) return Swal.fire('Oops', 'Pilih jenis izin.', 'warning');
        if(!detail) return Swal.fire('Oops', 'Isi alasan detail.', 'warning');
        if(!izinBuktiBase64) return Swal.fire('Oops', 'Upload bukti screenshot persetujuan WA.', 'warning');

        let izinMode = (checkFull && checkFull.checked) ? 'FULLDAY' : 'NONFULLDAY';
        
        payload = {
            action: currentMode,
            staff,
            reasonType,
            detail,
            izinMode,
            izinDayStart: document.getElementById('izin-day-start').value,
            izinDayEnd: document.getElementById('izin-day-end').value,
            izinTimeStart: document.getElementById('izin-time-start').value,
            izinTimeEnd: document.getElementById('izin-time-end').value,
            izinTotalHari: document.getElementById('izin-total-hari').innerText.replace('Total: ','').replace(' Hari','').trim(),
            izinTotalJam: document.getElementById('izin-total-jam').innerText.replace('Total: ','').trim(),
            izinBukti: izinBuktiBase64
        };
    }

    Swal.fire({ title: 'Mengirim Data...', text: 'Mohon tunggu sebentar', didOpen: () => Swal.showLoading() });

    try {
        const res = await callApi('submit', payload);
        
        if (res && (res.success || res.izinBuktiUrl)) { 
             Swal.fire({ 
                 icon: 'success', 
                 title: 'Berhasil!', 
                 text: currentMode === 'IZIN' ? 'Bukti berhasil diupload.' : 'Data tersimpan.',
                 timer: 2000, 
                 showConfirmButton: false 
             });
             closeModal();
        } else {
             Swal.fire('Gagal', (res && res.error) ? res.error : 'Terjadi kesalahan sistem.', 'error');
        }
    } catch (e) {
        Swal.fire('Error Koneksi', 'Gagal menghubungi server.', 'error');
    }
}

// --- KAMERA LOGIC ---
async function initCamera(facing = 'user') {
    camFacing = facing;
    if(camStream) camStream.getTracks().forEach(t => t.stop());
    try {
        camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing } });
        const vid = document.getElementById('video');
        if(vid) vid.srcObject = camStream;
    } catch(e) { 
        console.warn("Camera access denied or n/a");
    }
}
window.switchCamera = function() {
    camFacing = (camFacing === 'user') ? 'environment' : 'user';
    initCamera(camFacing);
}
function killCamera() {
    if(camStream) camStream.getTracks().forEach(t => t.stop());
}
window.capturePhoto = function() {
    const v = document.getElementById('video'), c = document.getElementById('canvas'), ctx = c.getContext('2d');
    if(!v || !c) return;
    
    c.width = v.videoWidth || 640; c.height = v.videoHeight || 480;
    ctx.drawImage(v, 0, 0);
    
    const now = updateClock();
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, c.height - 40, c.width, 40);
    ctx.fillStyle = "white";
    ctx.font = "bold 20px Arial";
    ctx.fillText(now.time + " | " + now.date, 20, c.height - 15);

    capturedBase64 = c.toDataURL('image/jpeg', 0.8);
    document.getElementById('photo-preview').style.backgroundImage = `url(${capturedBase64})`;
    document.getElementById('photo-preview').classList.remove('hidden');
    document.getElementById('video').classList.add('hidden');
    
    const btn = document.getElementById('snap-btn');
    if(btn) {
        btn.classList.add('bg-green-600');
        btn.innerHTML = 'FOTO OKE ✓';
    }
}

// --- KAMERA LEMBUR ---
async function initCameraLembur(facing = 'environment') {
    camFacingLembur = facing;
    if(camStreamLembur) camStreamLembur.getTracks().forEach(t => t.stop());
    try {
        camStreamLembur = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing } });
        const vid = document.getElementById('video-lembur');
        if(vid) vid.srcObject = camStreamLembur;
    } catch(e) { console.log(e); }
}
window.switchCameraLembur = function() {
    camFacingLembur = (camFacingLembur === 'user') ? 'environment' : 'user';
    initCameraLembur(camFacingLembur);
}
function killCameraLembur() {
    if(camStreamLembur) camStreamLembur.getTracks().forEach(t => t.stop());
}
window.capturePhotoLembur = function() {
    const v = document.getElementById('video-lembur'), c = document.getElementById('canvas-lembur'), ctx = c.getContext('2d');
    if(!v || !c) return;

    c.width = v.videoWidth || 640; c.height = v.videoHeight || 480;
    ctx.drawImage(v, 0, 0);
    
    capturedBase64Lembur = c.toDataURL('image/jpeg', 0.8);
    document.getElementById('photo-preview-lembur').style.backgroundImage = `url(${capturedBase64Lembur})`;
    document.getElementById('photo-preview-lembur').classList.remove('hidden');
    document.getElementById('video-lembur').classList.add('hidden');
    
    const btn = document.getElementById('snap-btn-lembur');
    if(btn) {
        btn.classList.add('bg-green-600');
        btn.innerHTML = 'SURAT OKE ✓';
    }
}

// --- IZIN UTILS ---
function initIzinListeners() {
    izinBuktiInput = document.getElementById('izin-bukti');
    const izinBuktiDrop = document.getElementById('izin-bukti-drop');
    
    if(izinBuktiDrop && izinBuktiInput) {
        izinBuktiDrop.addEventListener('click', () => izinBuktiInput.click());
        izinBuktiInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(ev) {
                const imgBukti = document.getElementById('izin-bukti-img');
                const prevBukti = document.getElementById('izin-bukti-preview');
                if(imgBukti) imgBukti.src = ev.target.result;
                if(prevBukti) prevBukti.style.display = '';
                izinBuktiBase64 = ev.target.result; 
            };
            reader.readAsDataURL(file);
        });
    }

    const checkFull = document.getElementById('izin-fullday-check');
    const checkNonFull = document.getElementById('izin-nonfullday-check');
    
    function toggleIzin(e) {
        if(e.target === checkFull && checkFull.checked) checkNonFull.checked = false;
        if(e.target === checkNonFull && checkNonFull.checked) checkFull.checked = false;
        
        const dStart = document.getElementById('izin-day-start');
        const tStart = document.getElementById('izin-time-start');

        if (checkFull && checkFull.checked) {
             if(dStart) dStart.disabled = false;
             if(tStart) tStart.disabled = true;
        } else {
             if(dStart) dStart.disabled = true;
             if(tStart) tStart.disabled = false;
        }
    }
    if(checkFull) checkFull.addEventListener('change', toggleIzin);
    if(checkNonFull) checkNonFull.addEventListener('change', toggleIzin);
    
    // Trigger sekali untuk set state awal
    if(checkFull) toggleIzin({target: checkFull});

    // Kalkulasi Jam & Hari
    const calcTime = () => {
        const start = document.getElementById('izin-time-start').value;
        const end = document.getElementById('izin-time-end').value;
        if(!start || !end) return;
        const [sh, sm] = start.split(':').map(Number);
        const [eh, em] = end.split(':').map(Number);
        let diff = (eh * 60 + em) - (sh * 60 + sm);
        if(diff < 0) diff += 1440;
        const totalJamEl = document.getElementById('izin-total-jam');
        if(totalJamEl) totalJamEl.innerText = `Total: ${Math.floor(diff/60)} jam ${diff%60} menit`;
    };
    const tStartEl = document.getElementById('izin-time-start');
    const tEndEl = document.getElementById('izin-time-end');
    if(tStartEl) tStartEl.addEventListener('change', calcTime);
    if(tEndEl) tEndEl.addEventListener('change', calcTime);
    
    const calcDays = () => {
        const startEl = document.getElementById('izin-day-start');
        const endEl = document.getElementById('izin-day-end');
        if(!startEl || !endEl || !startEl.value || !endEl.value) return;
        
        const start = new Date(startEl.value);
        const end = new Date(endEl.value);
        const diffTime = Math.abs(end - start);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; 
        const totalHariEl = document.getElementById('izin-total-hari');
        if(totalHariEl) totalHariEl.innerText = `Total: ${diffDays} Hari`;
    };
    const dStartEl = document.getElementById('izin-day-start');
    const dEndEl = document.getElementById('izin-day-end');
    if(dStartEl) dStartEl.addEventListener('change', calcDays);
    if(dEndEl) dEndEl.addEventListener('change', calcDays);
}

// --- LEMBUR UTILS ---
function initLemburListeners() {
     const lDay = document.getElementById('lembur-day');
     if(lDay) {
         lDay.addEventListener('change', () => {
             const val = lDay.value;
             if (val) {
                 const [yyyy, mm, dd] = val.split('-');
                 const disp = document.getElementById('lembur-day-display');
                 if(disp) disp.innerText = `${dd} ${mm} ${yyyy}`;
             }
         });
     }
     
     const calcLembur = () => {
         const startEl = document.getElementById('lembur-start');
         const endEl = document.getElementById('lembur-end');
         if(!startEl || !endEl) return;
         
         const start = startEl.value;
         const end = endEl.value;
         if(!start || !end) return;
         
         const [sh, sm] = start.split(':').map(Number);
         const [eh, em] = end.split(':').map(Number);
         let diff = (eh * 60 + em) - (sh * 60 + sm);
         if(diff < 0) diff += 1440;
         
         let txt = '';
         if(Math.floor(diff/60) > 0) txt += Math.floor(diff/60) + ' jam ';
         if(diff%60 > 0) txt += diff%60 + ' menit';
         
         const hoursEl = document.getElementById('lembur-hours');
         if(hoursEl) hoursEl.value = txt || '0 menit';
     };
     const lStartEl = document.getElementById('lembur-start');
     const lEndEl = document.getElementById('lembur-end');
     if(lStartEl) lStartEl.addEventListener('change', calcLembur);
     if(lEndEl) lEndEl.addEventListener('change', calcLembur);
}

window.sendWaIzin = function() {
    const staffEl = document.getElementById('staff-select');
    const staffName = staffEl ? staffEl.value : "[Nama]";
    const msg = `Assalamualaikum Pak Reza, Nama saya ${staffName}, Saya Mohon Izin mengajukan Izin/Cuti.`;
    window.open(`https://wa.me/+6281280774886?text=${encodeURIComponent(msg)}`, '_blank');
}
