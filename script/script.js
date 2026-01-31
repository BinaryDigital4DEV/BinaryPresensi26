/**
 * KONFIGURASI API
 * URL Web App AppScript Anda
 */
const APPSCRIPT_URL = "https://script.google.com/macros/s/AKfycbwn3-RbwfhO0gKAYQgOE6eca4rraJTxNQ8do17NNBW04uTIvdjh-19PZKreGQFHER88/exec"; 

// --- API HELPER ---
async function callApi(command, payload = {}, additionalData = {}) {
  // Bungkus payload agar seragam dengan Backend lama
  const body = {
    command: command,
    payload: payload, 
    ...additionalData 
  };
  
  try {
    const response = await fetch(APPSCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify(body),
      // text/plain untuk menghindari CORS preflight (OPTIONS)
      headers: { "Content-Type": "text/plain;charset=utf-8" } 
    });
    
    const result = await response.json();
    return result;
  } catch (e) {
    console.error("API Error", e);
    throw new Error("Gagal menghubungi server Google.");
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
    lucide.createIcons();
    updateClock();
    setInterval(updateClock, 1000);
    initGeoLocation();
    fetchStaff(); // Load initial data
    initIzinListeners();
    initLemburListeners();
});

// --- CLOCK & GREETING ---
function updateClock() {
    const now = new Date();
    document.getElementById('clock').innerText = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
    document.getElementById('date-label').innerText = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    
    const hr = now.getHours();
    let g = "Selamat Malam";
    if(hr < 11) g = "Selamat Pagi";
    else if(hr < 15) g = "Selamat Siang";
    else if(hr < 19) g = "Selamat Sore";
    document.getElementById('greet-msg').innerText = g;
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
                document.getElementById('geo-status').innerHTML = '<span class="status-dot bg-green-400"></span>Terverifikasi';
            } catch (e) {
                addressText = coords;
                document.getElementById('geo-status').innerHTML = '<span class="status-dot bg-yellow-400"></span>GPS Only';
            }
        }, () => {
            addressText = "GPS Tidak Aktif";
            document.getElementById('geo-status').innerHTML = '<span class="status-dot bg-red-400"></span>Tanpa GPS';
        });
    }
}

// --- FETCH DATA STAFF (API Call) ---
async function fetchStaff() {
    try {
        const data = await callApi('getInitialData');
        
        // Populate Staff
        const select = document.getElementById('staff-select');
        select.innerHTML = '<option value="">Pilih Nama Anda...</option>';
        if(data.staffList) {
            data.staffList.forEach(name => {
                let opt = document.createElement('option');
                opt.value = name; opt.text = name;
                select.add(opt);
            });
        }

        // Populate Izin
        const izinSelect = document.getElementById('izin-type');
        izinSelect.innerHTML = '<option value="">Pilih Jenis Izin...</option>';
        if (data.izinReasons) {
            data.izinReasons.forEach(reason => {
                let opt = document.createElement('option');
                opt.value = reason; opt.text = reason;
                izinSelect.add(opt);
            });
        }
        
        // Event hari ini
        if(data.events) {
            const todayKey = new Date().toLocaleDateString('en-US', {month: '2-digit', day: '2-digit'});
            const ev = data.events.find(e => e.date == todayKey);
            if(ev) document.getElementById('event-name').innerText = ev.name;
        }

    } catch (e) {
        console.error("Gagal load data awal", e);
        const select = document.getElementById('staff-select');
        select.innerHTML = '<option value="">Offline Mode (Demo)</option><option value="Admin">Admin</option>';
    }
}

// --- UI HANDLERS (MODAL & TABS) ---
function openForm(type) {
    currentMode = type;
    const titleMap = { 'IN': 'Masuk Kerja', 'OUT': 'Pulang Kerja', 'IZIN': 'Izin / Cuti', 'LEMBUR': 'Lembur Unit' };
    document.getElementById('sheet-title').innerText = titleMap[type] || 'Form Absensi';
    
    // Toggle Visibility
    const els = {
        shift: document.getElementById('ui-shift'),
        camera: document.getElementById('ui-camera'),
        izin: document.getElementById('ui-izin'),
        lembur: document.getElementById('ui-lembur')
    };
    
    els.shift.classList.toggle('hidden', type !== 'IN' && type !== 'OUT');
    els.camera.classList.toggle('hidden', type !== 'IN' && type !== 'OUT');
    els.izin.classList.toggle('hidden', type !== 'IZIN');
    els.lembur.classList.toggle('hidden', type !== 'LEMBUR');

    // Khusus Lembur
    const elLemburSurat = document.getElementById('ui-lembur-surat');
    const elLemburHours = document.getElementById('ui-lembur-hours');
    const elLemburDesc = document.getElementById('ui-lembur-desc');
    
    if (type === 'LEMBUR') {
         elLemburSurat.style.display = '';
         elLemburHours.style.display = '';
         elLemburDesc.style.display = '';
         // Reset Lembur
         document.getElementById('lembur-start').value = '';
         document.getElementById('lembur-end').value = '';
         document.getElementById('lembur-desc').value = '';
         document.getElementById('lembur-hours').value = 0;
         document.getElementById('lembur-day').value = '';
         document.getElementById('lembur-day-display').innerText = '';
         capturedBase64Lembur = null;
         
         // Start Camera Lembur
         killCamera(); 
         initCameraLembur('environment');
    } else {
        elLemburSurat.style.display = 'none';
        elLemburHours.style.display = 'none';
        elLemburDesc.style.display = 'none';
        killCameraLembur();
    }

    if (type === 'IN' || type === 'OUT') {
        initCamera('user');
    }

    // Animation Show
    const overlay = document.getElementById('overlay');
    const sheet = document.getElementById('sheet');
    overlay.classList.remove('hidden');
    setTimeout(() => {
        overlay.style.opacity = "1";
        sheet.classList.remove('translate-y-full');
    }, 10);
}

function closeModal() {
    const overlay = document.getElementById('overlay');
    const sheet = document.getElementById('sheet');
    sheet.classList.add('translate-y-full');
    overlay.style.opacity = "0";
    setTimeout(() => {
        overlay.classList.add('hidden');
        killCamera();
        killCameraLembur();
        resetFormUI();
    }, 400);
}

function resetFormUI() {
    capturedBase64 = null;
    capturedBase64Lembur = null;
    
    document.getElementById('photo-preview').classList.add('hidden');
    document.getElementById('video').classList.remove('hidden');
    
    document.getElementById('photo-preview-lembur').classList.add('hidden');
    document.getElementById('video-lembur').classList.remove('hidden');

    izinBuktiBase64 = '';
    if (izinBuktiInput) izinBuktiInput.value = '';
    document.getElementById('izin-bukti-img').src = '';
    document.getElementById('izin-bukti-preview').style.display = 'none';
    
    // Reset buttons
    document.getElementById('snap-btn').innerHTML = '<i data-lucide="camera" class="w-6 h-6"></i> AMBIL FOTO';
    document.getElementById('snap-btn').classList.remove('bg-green-600');
    
    document.getElementById('snap-btn-lembur').innerHTML = '<i data-lucide="camera" class="w-6 h-6"></i> AMBIL FOTO SURAT';
    document.getElementById('snap-btn-lembur').classList.remove('bg-green-600');
    
    lucide.createIcons();
}

function setShift(s) {
    selectedShift = s;
    const isPagi = s === 'Pagi';
    document.getElementById('btn-pagi').className = isPagi ? 'p-4 rounded-2xl border-2 font-bold transition-all border-blue-600 bg-blue-600 text-white shadow-lg' : 'p-4 rounded-2xl border-2 font-bold transition-all border-gray-100 bg-gray-50 text-gray-400';
    document.getElementById('btn-siang').className = !isPagi ? 'p-4 rounded-2xl border-2 font-bold transition-all border-blue-600 bg-blue-600 text-white shadow-lg' : 'p-4 rounded-2xl border-2 font-bold transition-all border-gray-100 bg-gray-50 text-gray-400';
}

// --- SUBMIT LOGIC (MAIN API CALL) ---
async function submitNow() {
    const staff = document.getElementById('staff-select').value;
    
    // -- VALIDASI UMUM --
    if(!staff) return Swal.fire('Oops', 'Pilih nama Anda dulu.', 'warning');

    let payload = { action: currentMode, staff };

    // -- LOGIC PER MODE --
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

        let izinMode = checkFull.checked ? 'FULLDAY' : 'NONFULLDAY';
        
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

    // -- KIRIM KE APPSCRIPT --
    Swal.fire({ title: 'Mengirim Data...', text: 'Mohon tunggu sebentar', didOpen: () => Swal.showLoading() });

    try {
        const res = await callApi('submit', payload);
        
        if (res.success || res.izinBuktiUrl) { 
             Swal.fire({ 
                 icon: 'success', 
                 title: 'Berhasil!', 
                 text: currentMode === 'IZIN' ? 'Bukti berhasil diupload.' : 'Data tersimpan.',
                 timer: 2000, 
                 showConfirmButton: false 
             });
             closeModal();
        } else {
             Swal.fire('Gagal', res.error || 'Terjadi kesalahan di server.', 'error');
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
        document.getElementById('video').srcObject = camStream;
    } catch(e) { 
        Swal.fire('Kamera Error', 'Izinkan akses kamera browser.', 'error'); 
    }
}
function switchCamera() {
    camFacing = (camFacing === 'user') ? 'environment' : 'user';
    initCamera(camFacing);
}
function killCamera() {
    if(camStream) camStream.getTracks().forEach(t => t.stop());
}
function capturePhoto() {
    const v = document.getElementById('video'), c = document.getElementById('canvas'), ctx = c.getContext('2d');
    c.width = v.videoWidth || 640; c.height = v.videoHeight || 480;
    ctx.drawImage(v, 0, 0);
    
    // Watermark simple
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
    btn.classList.add('bg-green-600');
    btn.innerHTML = 'FOTO OKE ✓';
}

// --- KAMERA LEMBUR ---
async function initCameraLembur(facing = 'environment') {
    camFacingLembur = facing;
    if(camStreamLembur) camStreamLembur.getTracks().forEach(t => t.stop());
    try {
        camStreamLembur = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing } });
        document.getElementById('video-lembur').srcObject = camStreamLembur;
    } catch(e) { console.log(e); }
}
function switchCameraLembur() {
    camFacingLembur = (camFacingLembur === 'user') ? 'environment' : 'user';
    initCameraLembur(camFacingLembur);
}
function killCameraLembur() {
    if(camStreamLembur) camStreamLembur.getTracks().forEach(t => t.stop());
}
function capturePhotoLembur() {
    const v = document.getElementById('video-lembur'), c = document.getElementById('canvas-lembur'), ctx = c.getContext('2d');
    c.width = v.videoWidth || 640; c.height = v.videoHeight || 480;
    ctx.drawImage(v, 0, 0);
    
    capturedBase64Lembur = c.toDataURL('image/jpeg', 0.8);
    document.getElementById('photo-preview-lembur').style.backgroundImage = `url(${capturedBase64Lembur})`;
    document.getElementById('photo-preview-lembur').classList.remove('hidden');
    document.getElementById('video-lembur').classList.add('hidden');
    
    const btn = document.getElementById('snap-btn-lembur');
    btn.classList.add('bg-green-600');
    btn.innerHTML = 'SURAT OKE ✓';
}

// --- IZIN UTILS ---
function initIzinListeners() {
    izinBuktiInput = document.getElementById('izin-bukti');
    const izinBuktiDrop = document.getElementById('izin-bukti-drop');
    
    izinBuktiDrop.addEventListener('click', () => izinBuktiInput.click());
    izinBuktiInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(ev) {
            document.getElementById('izin-bukti-img').src = ev.target.result;
            document.getElementById('izin-bukti-preview').style.display = '';
            izinBuktiBase64 = ev.target.result; // Simpan base64 raw
        };
        reader.readAsDataURL(file);
    });

    const checkFull = document.getElementById('izin-fullday-check');
    const checkNonFull = document.getElementById('izin-nonfullday-check');
    
    function toggleIzin(e) {
        if(e.target === checkFull && checkFull.checked) checkNonFull.checked = false;
        if(e.target === checkNonFull && checkNonFull.checked) checkFull.checked = false;
        
        if (checkFull.checked) {
             document.getElementById('izin-day-start').disabled = false;
             document.getElementById('izin-time-start').disabled = true;
        } else {
             document.getElementById('izin-day-start').disabled = true;
             document.getElementById('izin-time-start').disabled = false;
        }
    }
    checkFull.addEventListener('change', toggleIzin);
    checkNonFull.addEventListener('change', toggleIzin);
    toggleIzin({target: checkFull});

    // Kalkulasi Jam
    const calcTime = () => {
        const start = document.getElementById('izin-time-start').value;
        const end = document.getElementById('izin-time-end').value;
        if(!start || !end) return;
        const [sh, sm] = start.split(':').map(Number);
        const [eh, em] = end.split(':').map(Number);
        let diff = (eh * 60 + em) - (sh * 60 + sm);
        if(diff < 0) diff += 1440;
        document.getElementById('izin-total-jam').innerText = `Total: ${Math.floor(diff/60)} jam ${diff%60} menit`;
    };
    document.getElementById('izin-time-start').addEventListener('change', calcTime);
    document.getElementById('izin-time-end').addEventListener('change', calcTime);
    
    // Kalkulasi Hari
    const calcDays = () => {
        const start = new Date(document.getElementById('izin-day-start').value);
        const end = new Date(document.getElementById('izin-day-end').value);
        if(!start || !end) return;
        const diffTime = Math.abs(end - start);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; 
        document.getElementById('izin-total-hari').innerText = `Total: ${diffDays} Hari`;
    };
    document.getElementById('izin-day-start').addEventListener('change', calcDays);
    document.getElementById('izin-day-end').addEventListener('change', calcDays);
}

// --- LEMBUR UTILS ---
function initLemburListeners() {
     document.getElementById('lembur-day').addEventListener('change', () => {
         const val = document.getElementById('lembur-day').value;
         if (val) {
             const [yyyy, mm, dd] = val.split('-');
             document.getElementById('lembur-day-display').innerText = `${dd} ${mm} ${yyyy}`;
         }
     });
     
     // Auto calc hours for Lembur
     const calcLembur = () => {
         const start = document.getElementById('lembur-start').value;
         const end = document.getElementById('lembur-end').value;
         if(!start || !end) return;
         const [sh, sm] = start.split(':').map(Number);
         const [eh, em] = end.split(':').map(Number);
         let diff = (eh * 60 + em) - (sh * 60 + sm);
         if(diff < 0) diff += 1440;
         
         let txt = '';
         if(Math.floor(diff/60) > 0) txt += Math.floor(diff/60) + ' jam ';
         if(diff%60 > 0) txt += diff%60 + ' menit';
         document.getElementById('lembur-hours').value = txt || '0 menit';
     };
     document.getElementById('lembur-start').addEventListener('change', calcLembur);
     document.getElementById('lembur-end').addEventListener('change', calcLembur);
}

function sendWaIzin() {
    const staffName = document.getElementById('staff-select').value || "[Nama]";
    const msg = `Assalamualaikum Pak Reza, Nama saya ${staffName}, Saya Mohon Izin mengajukan Izin/Cuti.`;
    window.open(`https://wa.me/+6281280774886?text=${encodeURIComponent(msg)}`, '_blank');
}
