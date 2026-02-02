/**
 * KONFIGURASI API
 * Ganti dengan URL Deployment Terbaru Anda (berakhiran /exec)
 */
const APPSCRIPT_URL = "https://script.google.com/macros/s/AKfycbwn3-RbwfhO0gKAYQgOE6eca4rraJTxNQ8do17NNBW04uTIvdjh-19PZKreGQFHER88/exec";

// --- VARIABEL GLOBAL ---
let currentMode = '';
let selectedShift = 'Pagi';
let capturedBase64 = null;
let camStream = null;
let camFacing = 'user';
let addressText = "Mencari Lokasi...";
let izinBuktiBase64 = '';
let capturedBase64Lembur = null;
let camStreamLembur = null;
let camFacingLembur = 'environment';

// --- FUNGSI API (CORE) ---
async function callApi(command, payload = {}, additionalData = {}) {
    console.log(`📡 Memanggil API: ${command}`); // Debugging
    
    // Bungkus payload agar seragam dengan Backend
    const bodyData = {
        command: command,
        payload: payload, 
        ...additionalData 
    };
  
    try {
        const response = await fetch(APPSCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify(bodyData),
            // 'text/plain' mencegah Browser melakukan 'Preflight Check' yang sering bikin error CORS di GAS
            headers: { "Content-Type": "text/plain;charset=utf-8" } 
        });
        
        const result = await response.json();
        console.log(`✅ API Sukses:`, result);
        return result;
    } catch (e) {
        console.error("❌ API Error:", e);
        // Tampilkan error ke layar agar user tahu
        Swal.fire({
            icon: 'error',
            title: 'Koneksi Gagal',
            text: 'Gagal mengambil data dari server. Pastikan internet lancar.',
            footer: '<small>Cek Console Log untuk detail error.</small>'
        });
        return null;
    }
}

// --- FUNGSI UI GLOBAL (WAJIB ADA DI LUAR DOMContentLoaded) ---

// 1. Membuka Form (Tombol Dashboard)
function openForm(type) {
    console.log("Tombol diklik:", type); // Debugging klik
    currentMode = type;
    
    // Update Judul
    const titleMap = { 'IN': 'Masuk Kerja', 'OUT': 'Pulang Kerja', 'IZIN': 'Izin / Cuti', 'LEMBUR': 'Lembur Unit' };
    document.getElementById('sheet-title').innerText = titleMap[type] || 'Form Absensi';
    
    // Reset & Toggle Element
    const els = {
        shift: document.getElementById('ui-shift'),
        camera: document.getElementById('ui-camera'),
        izin: document.getElementById('ui-izin'),
        lembur: document.getElementById('ui-lembur')
    };

    // Helper toggle class
    const toggle = (el, show) => { if(el) el.classList.toggle('hidden', !show); };

    toggle(els.shift, type === 'IN' || type === 'OUT');
    toggle(els.camera, type === 'IN' || type === 'OUT');
    toggle(els.izin, type === 'IZIN');
    toggle(els.lembur, type === 'LEMBUR');

    // Khusus Mode Lembur
    const elLemburSurat = document.getElementById('ui-lembur-surat');
    const elLemburInfo = document.getElementById('ui-lembur-hours');
    const elLemburDesc = document.getElementById('ui-lembur-desc');
    
    if (type === 'LEMBUR') {
         if(elLemburSurat) elLemburSurat.style.display = 'block';
         if(elLemburInfo) elLemburInfo.style.display = 'block';
         if(elLemburDesc) elLemburDesc.style.display = 'block';
         
         // Reset form lembur
         resetLemburForm();
         
         // Matikan kamera selfie, nyalakan kamera lembur
         killCamera(); 
         initCameraLembur('environment');
    } else {
        if(elLemburSurat) elLemburSurat.style.display = 'none';
        if(elLemburInfo) elLemburInfo.style.display = 'none';
        if(elLemburDesc) elLemburDesc.style.display = 'none';
        killCameraLembur();
    }

    // Jika Masuk/Pulang, nyalakan kamera selfie
    if (type === 'IN' || type === 'OUT') {
        initCamera('user');
    }

    // Animasi Buka Modal
    const overlay = document.getElementById('overlay');
    const sheet = document.getElementById('sheet');
    overlay.classList.remove('hidden');
    setTimeout(() => {
        overlay.style.opacity = "1";
        sheet.classList.remove('translate-y-full');
    }, 10);
}

// 2. Menutup Form
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

// 3. Set Shift
function setShift(s) {
    selectedShift = s;
    const isPagi = s === 'Pagi';
    const btnPagi = document.getElementById('btn-pagi');
    const btnSiang = document.getElementById('btn-siang');
    
    if(btnPagi) btnPagi.className = isPagi ? 'p-4 rounded-2xl border-2 font-bold transition-all border-blue-600 bg-blue-600 text-white shadow-lg' : 'p-4 rounded-2xl border-2 font-bold transition-all border-gray-100 bg-gray-50 text-gray-400';
    if(btnSiang) btnSiang.className = !isPagi ? 'p-4 rounded-2xl border-2 font-bold transition-all border-blue-600 bg-blue-600 text-white shadow-lg' : 'p-4 rounded-2xl border-2 font-bold transition-all border-gray-100 bg-gray-50 text-gray-400';
}

// 4. Submit Data
async function submitNow() {
    const staff = document.getElementById('staff-select').value;
    if(!staff) return Swal.fire('Gagal', 'Silakan pilih nama Anda terlebih dahulu.', 'warning');

    let payload = { action: currentMode, staff };

    // -- VALIDASI & PAYLOAD BUILDER --
    if(currentMode === 'LEMBUR') {
        const lStart = document.getElementById('lembur-start').value;
        const lEnd = document.getElementById('lembur-end').value;
        const lDesc = document.getElementById('lembur-desc').value;
        const lHours = document.getElementById('lembur-hours').value;
        const rawDay = document.getElementById('lembur-day').value;
        
        if(!capturedBase64Lembur) return Swal.fire('Foto Kurang', 'Ambil foto surat tugas lembur.', 'warning');
        if(!lStart || !lEnd) return Swal.fire('Data Kurang', 'Jam mulai/selesai wajib diisi.', 'warning');
        if(!lDesc) return Swal.fire('Data Kurang', 'Deskripsi pekerjaan wajib diisi.', 'warning');

        let lemburDay = '';
        if (rawDay) {
            const [yyyy, mm, dd] = rawDay.split('-');
            lemburDay = `${dd} ${mm} ${yyyy}`;
        }

        payload = {
            ...payload,
            photo: capturedBase64, // Bisa null
            location: addressText,
            hours: lHours,
            lemburStart: lStart,
            lemburEnd: lEnd,
            lemburDesc: lDesc,
            lemburDay: lemburDay,
            lemburSurat: capturedBase64Lembur
        };

    } else if (currentMode === 'IN' || currentMode === 'OUT') {
        if(!capturedBase64) return Swal.fire('Foto Kurang', 'Wajib ambil foto selfie.', 'warning');
        payload = {
            ...payload,
            shift: selectedShift,
            photo: capturedBase64,
            location: addressText
        };

    } else if (currentMode === 'IZIN') {
        const reasonType = document.getElementById('izin-type').value;
        const detail = document.getElementById('izin-detail').value;
        const checkFull = document.getElementById('izin-fullday-check');
        
        if(!reasonType) return Swal.fire('Data Kurang', 'Pilih jenis izin.', 'warning');
        if(!detail) return Swal.fire('Data Kurang', 'Isi alasan detail.', 'warning');
        if(!izinBuktiBase64) return Swal.fire('Bukti Kurang', 'Upload screenshot bukti persetujuan WA.', 'warning');

        let izinMode = (checkFull && checkFull.checked) ? 'FULLDAY' : 'NONFULLDAY';
        
        payload = {
            ...payload,
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

    // -- EKSEKUSI --
    Swal.fire({ title: 'Mengirim Data...', text: 'Jangan tutup halaman ini', didOpen: () => Swal.showLoading() });

    const res = await callApi('submit', payload);

    if (res && (res.success || res.izinBuktiUrl)) { 
        Swal.fire({ icon: 'success', title: 'Berhasil!', timer: 2000, showConfirmButton: false });
        closeModal();
    } else {
        Swal.fire('Gagal', (res && res.error) ? res.error : 'Terjadi kesalahan sistem.', 'error');
    }
}

// --- INIT (JALAN SAAT WEBSITE DIBUKA) ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Load Icon
    try { lucide.createIcons(); } catch(e) {}
    
    // 2. Jalankan Jam
    updateClock();
    setInterval(updateClock, 1000);
    
    // 3. Ambil Lokasi
    initGeoLocation();
    
    // 4. AMBIL DATA STAFF (PENTING)
    fetchStaff(); 
    
    // 5. Init Listeners Lainnya
    initIzinListeners();
    initLemburListeners();
});

// --- HELPER FUNCTIONS LAINNYA ---

async function fetchStaff() {
    // Tampilkan loading di dropdown
    const select = document.getElementById('staff-select');
    select.innerHTML = '<option>Sedang memuat data...</option>';

    const data = await callApi('getInitialData');
    
    if (data && data.staffList) {
        select.innerHTML = '<option value="">Pilih Nama Anda...</option>';
        data.staffList.forEach(name => {
            let opt = document.createElement('option');
            opt.value = name; opt.text = name;
            select.add(opt);
        });

        // Load Jenis Izin
        const izinSelect = document.getElementById('izin-type');
        if(izinSelect && data.izinReasons) {
            izinSelect.innerHTML = '<option value="">Pilih Jenis Izin...</option>';
            data.izinReasons.forEach(reason => {
                let opt = document.createElement('option');
                opt.value = reason; opt.text = reason;
                izinSelect.add(opt);
            });
        }
        
        // Update Event Hari Ini
        if(data.events) {
            const todayKey = new Date().toLocaleDateString('en-US', {month: '2-digit', day: '2-digit'});
            const ev = data.events.find(e => e.date == todayKey);
            if(ev) document.getElementById('event-name').innerText = ev.name;
        }
    } else {
        select.innerHTML = '<option>Gagal memuat data (Cek Koneksi)</option>';
    }
}

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

function initGeoLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (pos) => {
            const coords = pos.coords.latitude + ", " + pos.coords.longitude;
            const res = await callApi('geo', {}, { coords: coords });
            addressText = (res && typeof res === 'string') ? res : coords;
            document.getElementById('geo-status').innerHTML = '<span class="status-dot bg-green-400"></span>Terverifikasi';
        }, () => {
            addressText = "GPS Tidak Aktif";
            document.getElementById('geo-status').innerHTML = '<span class="status-dot bg-red-400"></span>Tanpa GPS';
        });
    }
}

// --- KAMERA LOGIC ---
async function initCamera(facing) {
    camFacing = facing;
    if(camStream) camStream.getTracks().forEach(t => t.stop());
    try {
        camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing } });
        document.getElementById('video').srcObject = camStream;
    } catch(e) { console.warn("Camera Error"); }
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
    
    // Watermark
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

// --- LOGIC LEMBUR & IZIN (SIMPLIFIED) ---
function resetLemburForm() {
    document.getElementById('lembur-start').value = '';
    document.getElementById('lembur-end').value = '';
    document.getElementById('lembur-desc').value = '';
    document.getElementById('lembur-hours').value = 0;
    document.getElementById('lembur-day').value = '';
    capturedBase64Lembur = null;
    
    document.getElementById('photo-preview-lembur').classList.add('hidden');
    document.getElementById('video-lembur').classList.remove('hidden');
    
    const btn = document.getElementById('snap-btn-lembur');
    btn.classList.remove('bg-green-600');
    btn.innerHTML = '<i data-lucide="camera" class="w-6 h-6"></i> AMBIL FOTO SURAT';
    lucide.createIcons();
}

function initIzinListeners() {
    // Upload Listener
    const izinBuktiInput = document.getElementById('izin-bukti');
    const izinBuktiDrop = document.getElementById('izin-bukti-drop');
    if(izinBuktiDrop) {
        izinBuktiDrop.addEventListener('click', () => izinBuktiInput.click());
        izinBuktiInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(ev) {
                    document.getElementById('izin-bukti-img').src = ev.target.result;
                    document.getElementById('izin-bukti-preview').style.display = 'flex';
                    izinBuktiBase64 = ev.target.result;
                };
                reader.readAsDataURL(file);
            }
        });
    }
    // Toggle Shift
    const checkFull = document.getElementById('izin-fullday-check');
    const checkNonFull = document.getElementById('izin-nonfullday-check');
    const toggleIzin = (e) => {
        if(e.target === checkFull && checkFull.checked) checkNonFull.checked = false;
        if(e.target === checkNonFull && checkNonFull.checked) checkFull.checked = false;
        
        const isFull = checkFull.checked;
        document.getElementById('izin-day-start').disabled = !isFull;
        document.getElementById('izin-time-start').disabled = isFull;
    };
    if(checkFull) checkFull.addEventListener('change', toggleIzin);
    if(checkNonFull) checkNonFull.addEventListener('change', toggleIzin);
}

function initLemburListeners() {
    // Auto calc hours
    const calc = () => {
         const start = document.getElementById('lembur-start').value;
         const end = document.getElementById('lembur-end').value;
         if(start && end) {
             const [sh, sm] = start.split(':').map(Number);
             const [eh, em] = end.split(':').map(Number);
             let diff = (eh * 60 + em) - (sh * 60 + sm);
             if(diff < 0) diff += 1440;
             document.getElementById('lembur-hours').value = Math.floor(diff/60) + ' jam ' + (diff%60) + ' menit';
         }
    };
    document.getElementById('lembur-start').addEventListener('change', calc);
    document.getElementById('lembur-end').addEventListener('change', calc);
}

// Camera Lembur Helpers
async function initCameraLembur(facing) {
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
function sendWaIzin() {
    const staffName = document.getElementById('staff-select').value || "[Nama]";
    const msg = `Assalamualaikum Pak Reza, Nama saya ${staffName}, Saya Mohon Izin mengajukan Izin/Cuti.`;
    window.open(`https://wa.me/+6281280774886?text=${encodeURIComponent(msg)}`, '_blank');
}
function resetFormUI() {
    capturedBase64 = null;
    const photoPrev = document.getElementById('photo-preview');
    const videoEl = document.getElementById('video');
    if(photoPrev) photoPrev.classList.add('hidden');
    if(videoEl) videoEl.classList.remove('hidden');
    const btn = document.getElementById('snap-btn');
    if(btn) { btn.innerHTML = '<i data-lucide="camera" class="w-6 h-6"></i> AMBIL FOTO'; btn.classList.remove('bg-green-600'); }
    try{ lucide.createIcons(); } catch(e){}
}
