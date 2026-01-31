
// Script ID Web Apps Script
const SCRIPT_ID = '16CpmLWlEeUlYpfYpuMgbhCh_c8CNOZbKTFlYe-QnnYrrGD4duk3z6b0Z';
const BASE_URL = `https://script.google.com/macros/s/AKfycbxA5VCi04SdbSSv289a8saMRk0GwogpowKe5qOjh9COPjNnFiGDzxygUKR5Tbp_kedY/exec`;

// Fetch initial data (staff, izin reasons, events)
async function fetchInitialData() {
	try {
		const res = await fetch(`${BASE_URL}?action=getInitialData`);
		const data = await res.json();
		// Mapping data
		window.staffList = data.staffList || [];
		window.izinReasons = data.izinReasons || [];
		window.events = data.events || [];
		// TODO: Render ke UI
		console.log('Staff:', staffList);
		console.log('Izin Reasons:', izinReasons);
		console.log('Events:', events);
	} catch (e) {
		console.error('Gagal fetch initial data:', e);
	}
}

// Fetch address from coordinates
async function fetchAddressFromCoords(coords) {
	try {
		const res = await fetch(`${BASE_URL}?action=getAddressFromCoords&coords=${encodeURIComponent(coords)}`);
		const address = await res.text();
		return address;
	} catch (e) {
		console.error('Gagal fetch address:', e);
		return coords;
	}
}

// Submit absensi/izin/lembur
async function submitForm(payload) {
	try {
		const res = await fetch(BASE_URL, {
			method: 'POST',
			body: JSON.stringify(payload),
			headers: { 'Content-Type': 'application/json' }
		});
		const result = await res.json();
		// TODO: Handle response (success/error)
		console.log('Submit result:', result);
		return result;
	} catch (e) {
		console.error('Gagal submit:', e);
		return { error: e.message };
	}
}

// Contoh mapping payload untuk submit
function getAbsensiPayload({staff, action, shift, location, photo}) {
	return {
		staff,
		action, // 'IN' atau 'OUT'
		shift,  // 'Pagi', 'Siang', dst
		location,
		photo // base64
	};
}

function getIzinPayload({staff, reasonType, detail, izinMode, izinDayStart, izinDayEnd, izinTotalHari, izinTimeStart, izinTimeEnd, izinTotalJam, izinBukti}) {
	return {
		staff,
		reasonType,
		detail,
		izinMode, // 'FULLDAY' atau 'NONFULLDAY'
		izinDayStart,
		izinDayEnd,
		izinTotalHari,
		izinTimeStart,
		izinTimeEnd,
		izinTotalJam,
		izinBukti // base64
	};
}

function getLemburPayload({staff, action, lemburDay, lemburStart, lemburEnd, lemburDesc, photo}) {
	return {
		staff,
		action: 'LEMBUR',
		lemburDay,
		lemburStart,
		lemburEnd,
		lemburDesc,
		photo // base64
	};
}

// Inisialisasi data saat halaman dimuat
window.addEventListener('DOMContentLoaded', fetchInitialData);
