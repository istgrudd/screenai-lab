# Candidate Period Status Consistency Fix

## Background Issue

Candidate topbar sudah menampilkan active recruitment period dengan benar, tetapi Candidate Application Status page masih dapat menampilkan fallback "Tidak ada periode aktif" pada status card. Ini membuat informasi periode di topbar, dashboard, dan status page tidak konsisten.

## Files Changed

- `frontend/src/pages/candidate/ApplicationStatusPage.jsx`
- `frontend/src/lib/candidateUx.js`

## Root Cause

`ApplicationStatusPage.jsx` belum mengambil active recruitment period melalui `getActivePeriod()` dan belum meneruskannya ke `CandidateStatusHero` maupun `ApplicationProgressCard`. Akibatnya `CandidateStatusHero` menerima `activePeriod` kosong dan `periodDeadlineContext()` menggunakan fallback null period.

Halaman ini juga belum mengambil user melalui `getMe()`, sehingga greeting di `CandidateStatusHero` jatuh ke fallback "Halo, Kandidat" walaupun data user tersedia.

## Implementation Summary

- Menambahkan fetch `getActivePeriod()` di `ApplicationStatusPage.jsx`.
- Menyimpan `activePeriod` dan `periodLoading` pada state halaman status.
- Menangani kondisi tidak ada active period dengan fallback `null`, tanpa crash.
- Menambahkan fetch `getMe()` agar `CandidateStatusHero` bisa menampilkan greeting user yang konsisten.
- Meneruskan `user`, `activePeriod`, dan loading period ke `CandidateStatusHero` pada flow draft dan submitted/status.
- Meneruskan `activePeriod` ke `ApplicationProgressCard` agar draft candidate tidak salah dianggap phase-blocked saat periode aktif berada di fase `SUBMISSION`.
- Memperjelas label deadline global di `periodDeadlineContext()`:
  - `EVALUATION`: "Batas evaluasi"
  - `ANNOUNCEMENT`: "Jadwal pengumuman"

## Scope Yang Sengaja Tidak Diubah

- Tidak mengubah backend.
- Tidak mengubah logic progression bar kandidat.
- Tidak mengubah `CandidateApplicationStepTrack.jsx`.
- Tidak membuat global context/refactor besar untuk active period.
- Tidak mengubah copy utama candidate application status seperti Draft, Review Dokumen, Perlu Revisi, dan hasil pengumuman.

## Testing Checklist Dan Hasil

- `npm run lint`: berhasil.
- `npm run build`: berhasil.
- Build menampilkan warning ukuran chunk Vite yang sudah bersifat umum dan tidak terkait perubahan ini.
- Manual browser login flow belum dijalankan karena membutuhkan sesi kandidat/backend aktif.

## Expected Behavior

- Jika active recruitment period tersedia, Application Status card menerima period yang sama dengan topbar/dashboard.
- Fallback "Tidak ada periode aktif" hanya muncul saat `getActivePeriod()` benar-benar tidak mengembalikan periode aktif.
- ApplicationProgressCard tidak lagi memunculkan phase-blocked warning palsu hanya karena prop `activePeriod` tidak dikirim.
- Greeting Application Status menggunakan data user ketika tersedia.
- Progression bar kandidat tetap mengikuti action/progress kandidat, bukan recruitment period global.

## Notes / Known Limitations

- Fetch active period masih dilakukan per halaman, mengikuti pola yang sudah ada di Dashboard dan Topbar. Refactor global shared period state sengaja tidak dilakukan agar perubahan tetap minimal.
