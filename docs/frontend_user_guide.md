# Frontend User Guide

## Tujuan Dokumen

Dokumen ini menjelaskan alur besar frontend ScreenAI Lab dari sudut pandang pengguna. Fokusnya bukan detail teknis, melainkan apa saja halaman yang tersedia, fitur apa yang bisa digunakan, fungsi tiap fitur, dan tombol utama yang muncul pada setiap role.

Role utama di frontend:

- Candidate
- Recruiter
- Super Admin

Selain itu, ada halaman publik untuk login, register, verifikasi email, dan reset password.

## Struktur Frontend Secara Umum

Frontend dibagi berdasarkan peran pengguna. Setelah login, pengguna diarahkan ke dashboard sesuai role:

- Candidate masuk ke dashboard kandidat.
- Recruiter masuk ke dashboard recruiter.
- Super Admin masuk ke dashboard admin.

Setiap user yang sudah login melihat sidebar di sebelah kiri. Sidebar berisi menu yang berbeda sesuai role. Di bagian bawah sidebar terdapat informasi email user, badge role, dan tombol `Log out`.

Struktur menu utama:

- Public/Auth: halaman sebelum login.
- Candidate Workspace: area pendaftaran dan status kandidat.
- Recruiter Workspace: area review, evaluasi, dan publikasi hasil.
- Super Admin Workspace: area pengelolaan sistem, user, periode, audit, dan monitoring email.

## Auth dan Akun

### Login

Halaman login digunakan untuk masuk ke portal ScreenAI Lab.

Fitur utama:

- Input email.
- Input password.
- Tombol show/hide password.
- Link forgot password.
- Link register.
- Penanganan akun yang belum verifikasi email.

Tombol utama:

- `Sign in`: masuk ke sistem.
- `Kirim Ulang Email Verifikasi`: muncul jika login gagal karena email belum diverifikasi.
- `Forgot password?`: menuju halaman permintaan reset password.
- `Register`: menuju halaman pendaftaran akun candidate.

### Register

Halaman register digunakan candidate untuk membuat akun baru.

Data yang diisi:

- Nama lengkap.
- NIM.
- Angkatan.
- Email.
- Password.
- Fakultas.
- Jurusan.

Tombol utama:

- `Create account`: membuat akun candidate.
- `Kembali ke Login`: kembali ke login setelah akun dibuat.
- `Kirim Ulang Email Verifikasi`: mengirim ulang email verifikasi setelah register.

Setelah register berhasil, candidate belum langsung masuk ke sistem. Candidate perlu membuka email verifikasi terlebih dahulu.

### Verify Email

Halaman ini digunakan untuk memverifikasi email dari link yang dikirim ke user.

Fitur utama:

- Verifikasi otomatis dari kode pada link.
- Tampilan sukses jika email berhasil diverifikasi.
- Tampilan error jika kode tidak ada, tidak valid, kedaluwarsa, atau sudah dipakai.
- Form kirim ulang email verifikasi jika memungkinkan.

Tombol utama:

- `Kirim Ulang Email Verifikasi`.
- `Kembali ke Login`.
- `Bantuan Akun`.

### Forgot Password

Halaman ini digunakan jika user lupa password.

Fitur utama:

- Input email.
- Pesan sukses generik agar sistem tidak membocorkan apakah email terdaftar atau tidak.

Tombol utama:

- `Kirim Link Reset`: meminta link reset password.
- `Kembali ke Login`.

### Reset Password

Halaman ini digunakan untuk membuat password baru dari link reset password.

Fitur utama:

- Input password baru.
- Input konfirmasi password.
- Validasi minimal panjang password.
- Pesan error jika kode reset tidak valid, kedaluwarsa, sudah dipakai, atau tidak ada.

Tombol utama:

- `Reset Password`: menyimpan password baru.
- `Kembali ke Login`.
- `Minta Link Baru`.

### Logout

Setelah login, tombol `Log out` tersedia di sidebar.

Fungsinya:

- Menghapus sesi/token lokal.
- Mengembalikan user ke halaman login.

## Candidate Page

Candidate page adalah area untuk kandidat mendaftar, melengkapi dokumen, submit aplikasi, dan melihat hasil seleksi.

### Alur Besar Candidate

Alur candidate secara garis besar:

1. Candidate register akun.
2. Candidate verifikasi email.
3. Candidate login.
4. Candidate melengkapi profil.
5. Candidate memilih divisi.
6. Candidate mengunggah dokumen.
7. Candidate melakukan review final.
8. Candidate submit aplikasi.
9. Candidate memantau status.
10. Candidate melihat pengumuman hasil.

Jika dokumen ditolak oleh recruiter/admin, candidate akan masuk ke alur koreksi dokumen. Pada tahap ini candidate hanya bisa mengganti dokumen yang ditolak.

### Menu Candidate

Sidebar candidate berisi:

- `Dashboard`
- `Application Overview`
- `Documents`
- `Application Status`
- `Profile`

### Dashboard

Dashboard adalah halaman awal candidate setelah login.

Fitur utama:

- Menampilkan sapaan dan ringkasan aplikasi.
- Menampilkan periode rekrutasi aktif.
- Menampilkan status aplikasi.
- Menampilkan progress upload dokumen.
- Menampilkan checklist dokumen wajib.
- Menampilkan banner hasil jika candidate sudah diumumkan lolos/tidak lolos.
- Menampilkan tahapan seleksi setelah aplikasi disubmit.

Tombol utama:

- `Start application`: mulai aplikasi baru.
- `Manage documents`: membuka halaman dokumen.
- `Continue uploading`: melanjutkan upload dokumen.
- `Review & Submit`: menuju halaman review final.
- `Fix documents`: mengganti dokumen yang ditolak.
- `View submission`: melihat status aplikasi.

### Profile

Halaman profile menampilkan informasi akun dan data akademik candidate.

Fitur utama:

- Nama lengkap.
- Email.
- Nomor WhatsApp.
- NIM.
- Fakultas.
- Jurusan.
- Angkatan.
- Role dan status akun.
- Divisi dan status aplikasi saat ini.
- Reference ID aplikasi jika sudah ada.

Tombol utama:

- `Edit Profile`: membuka form edit profil.
- `Open Application Overview`: membuka ringkasan aplikasi.

### Edit Profile

Halaman ini digunakan candidate untuk melengkapi atau mengubah data profil.

Fitur utama:

- Edit nama lengkap.
- Edit email.
- Edit nomor WhatsApp.
- Edit NIM, fakultas, jurusan, dan angkatan sebelum submit.
- Ubah password.
- Menampilkan warning jika profil belum lengkap.
- Mengunci field akademik setelah aplikasi disubmit.

Tombol utama:

- `Back to Profile`: kembali ke halaman profil.
- `Simpan Perubahan`: menyimpan perubahan profil.

### Application Overview

Halaman ini adalah ringkasan aplikasi candidate.

Fitur utama:

- Menampilkan aplikasi saat ini.
- Menampilkan divisi yang dipilih.
- Menampilkan status aplikasi.
- Menampilkan tanggal submit.
- Menampilkan Reference ID.
- Menampilkan progress kelengkapan dokumen.
- Memberi rekomendasi langkah berikutnya.

Tombol utama:

- `Start application`: mulai aplikasi jika belum ada.
- `Continue documents`: lanjut upload dokumen.
- `Review and submit`: masuk ke review final.
- `View application status`: melihat status aplikasi.

### Start Application

Halaman ini digunakan untuk memilih divisi dan membuat draft aplikasi.

Divisi yang tersedia:

- Big Data.
- Cyber Security.
- Game Technology.
- Geographic Information Systems.

Fitur utama:

- Memilih satu divisi.
- Membuat draft aplikasi.
- Mengunci pilihan divisi setelah aplikasi dibuat.
- Menampilkan pesan jika periode pendaftaran belum dibuka atau sudah ditutup.

Tombol utama:

- Kartu pilihan divisi.
- `Start application`: membuat draft aplikasi.
- `Application overview`: kembali ke ringkasan aplikasi.
- `Continue documents`: lanjut ke upload dokumen.
- `View application status`: melihat status jika aplikasi sudah disubmit.

### Documents

Halaman ini digunakan candidate untuk mengunggah dokumen pendaftaran.

Dokumen wajib:

- Curriculum Vitae.
- Motivation Letter.
- KHS / Transcript.
- KTM / Student ID.
- SWOT Analysis.
- Dokumen Pendukung.

Fitur utama:

- Upload dokumen satu per satu.
- Drag and drop file.
- Browse file manual.
- Melihat progress upload.
- Melihat status dokumen setelah direview.
- Mengganti dokumen yang sudah diupload selama masih draft.
- Mengganti hanya dokumen yang ditolak saat correction.

Tombol utama:

- Area upload/drop file.
- `Replace`: mengganti file yang sudah ada.
- `Back`: kembali ke step sebelumnya.
- `Next Step`: lanjut ke dokumen berikutnya.
- `Review & Submit`: masuk ke review final jika semua dokumen lengkap.
- `View Status`: melihat status aplikasi jika dokumen terkunci.

### Review & Submit

Halaman ini adalah tahap terakhir sebelum aplikasi dikirim.

Fitur utama:

- Menampilkan ringkasan profil.
- Menampilkan dokumen yang sudah diupload.
- Menampilkan warning bahwa submit bersifat final.
- Menampilkan checkbox konfirmasi.
- Memblokir submit jika profil belum lengkap.
- Memblokir submit jika dokumen belum lengkap.
- Memblokir submit jika periode pendaftaran tidak aktif.

Checkbox konfirmasi:

- Informasi sudah akurat.
- Dokumen asli/autentik.
- Candidate memahami bahwa submit bersifat final.

Tombol utama:

- `Edit Profile`: memperbaiki profil.
- `Back to documents`: kembali ke upload dokumen.
- `Submit final application`: mengirim aplikasi final.

Setelah submit, candidate tidak bisa lagi mengganti dokumen kecuali recruiter/admin meminta koreksi.

### Application Status

Halaman ini digunakan untuk memantau status aplikasi dan hasil pengumuman.

Fitur utama:

- Menampilkan Reference ID.
- Menampilkan status aplikasi.
- Menampilkan divisi.
- Menampilkan tanggal submit.
- Menampilkan tahapan seleksi.
- Menampilkan dokumen yang ditolak beserta alasan.
- Menampilkan hasil akhir jika sudah diumumkan.

Tombol utama:

- `Copy`: menyalin Reference ID.
- `Start application`: muncul jika belum ada aplikasi.
- `Continue documents`: lanjut upload dokumen jika masih draft.
- `Review and submit`: masuk review jika dokumen sudah lengkap.
- `Fix Documents`: mengganti dokumen yang ditolak.
- `Back to dashboard`: kembali ke dashboard.

## Recruiter Page

Recruiter page adalah area kerja tim rekrutmen untuk memantau aplikasi, memeriksa dokumen, menjalankan evaluasi AI, meninjau kandidat, dan mengumumkan hasil.

### Alur Besar Recruiter

Alur recruiter secara garis besar:

1. Recruiter membuka dashboard untuk melihat ringkasan.
2. Recruiter melihat aplikasi yang masuk.
3. Recruiter memeriksa dokumen kandidat.
4. Recruiter memverifikasi atau menolak dokumen.
5. Recruiter menjalankan evaluasi AI untuk kandidat yang siap.
6. Recruiter melihat ranked candidate list.
7. Recruiter membuka detail kandidat dan evidence.
8. Recruiter melakukan override skor jika diperlukan.
9. Recruiter memilih kandidat yang lolos.
10. Recruiter mempublikasikan hasil.

### Menu Recruiter

Sidebar recruiter berisi:

- `Dashboard`
- `Applications`
- `Evaluation`
- `Candidates`
- `Document Verification`
- `Announcements`
- `Analytics`
- `Rubrics`
- `Profile`

### Recruiter Dashboard

Dashboard recruiter menampilkan ringkasan area kerja.

Fitur utama:

- Menampilkan periode rekrutasi aktif.
- Menampilkan jumlah aplikasi.
- Menampilkan jumlah kandidat yang sudah dievaluasi.
- Menampilkan kandidat yang pending evaluation.
- Menampilkan top score.
- Menyediakan shortcut ke workspace utama.

Tombol utama:

- `Open` pada kartu Applications.
- `Open` pada kartu Evaluation.
- `Open` pada kartu Candidates.
- `Open` pada kartu Announcements.
- `Open` pada kartu Analytics.
- `Open` pada kartu Documents.
- `Open` pada kartu Rubrics.

### Applications

Halaman administratif untuk tracking pendaftaran dan kesiapan dokumen (bukan halaman evaluasi AI).

Fitur utama:

- Search berdasarkan nama, email, atau NIM.
- Quick filter status + filter divisi/status.
- Tabel administratif ringkas: Candidate (nama + email/NIM), Division, Application Status, Documents, Submitted, action.
- Tidak menampilkan composite score, Validasi AI, AI Recommendation, atau IPK sebagai kolom utama; detail lengkap tetap ada di Candidate Detail.
- Membuka detail kandidat jika kandidat sudah memiliki data evaluasi.

Tombol utama:

- Input search.
- Quick filter status.
- Dropdown division/status.
- `Reset`: menghapus filter.
- Klik row kandidat: membuka detail kandidat jika tersedia.

### Document Verification

Halaman ini digunakan untuk memeriksa dokumen kandidat.

Fitur utama:

- Melihat daftar aplikasi yang perlu review dokumen.
- Memilih satu kandidat.
- Melihat semua dokumen kandidat.
- Preview dokumen.
- Menandai dokumen sebagai verified.
- Menolak dokumen dengan alasan.
- Finalisasi hasil review dokumen.

Tombol utama:

- Dropdown division/status filter.
- Kartu kandidat pada daftar aplikasi.
- `Preview`: membuka preview dokumen.
- `Hide Preview`: menutup preview dokumen.
- `Verify`: menerima dokumen.
- `Reject`: menolak dokumen.
- `Finalize`: menyelesaikan review dokumen kandidat.

Hasil finalisasi:

- Jika semua dokumen verified, aplikasi masuk ke status verified dan siap evaluasi.
- Jika ada dokumen rejected, candidate akan diminta melakukan koreksi.

### Evaluation

Halaman ini digunakan untuk menjalankan evaluasi AI.

Fitur utama:

- Memilih divisi yang akan dievaluasi.
- Menjalankan evaluasi untuk kandidat yang dokumennya sudah verified.
- Melihat jumlah aplikasi di divisi.
- Melihat jumlah yang sudah dievaluasi.
- Melihat jumlah yang masih pending.
- Re-evaluate kandidat jika diperlukan.
- Menampilkan warning jika evaluasi dilakukan di luar fase evaluasi resmi.

Tombol utama:

- Dropdown division.
- `Run Evaluation`: menjalankan evaluasi.
- `Re-evaluate All`: menjalankan ulang evaluasi untuk semua kandidat di divisi tersebut.
- `Re-evaluate`: tombol konfirmasi di dialog.
- `Cancel`: membatalkan dialog re-evaluate.

### Candidates

Halaman ini menampilkan kandidat yang sudah memiliki hasil evaluasi sebagai ranked compact card/list.

Fitur utama:

- Menampilkan kandidat sebagai compact ranked row: rank, nama, email/metadata kecil, divisi, status, badge Validasi AI, dan composite score.
- Tidak menampilkan badge AI Recommended (rekomendasi AI hanya tampil di Announcements).
- Filter berdasarkan divisi dan status.
- Membuka detail kandidat via `Open Detail`.

Tombol utama:

- Dropdown division/status filter.
- `Reset`.
- `Open Detail` pada tiap kandidat.

### Candidate Detail

Halaman ini digunakan recruiter untuk melihat detail kandidat.

Fitur utama:

- Menampilkan anonymous ID kandidat.
- Menampilkan status dan composite score.
- Menampilkan card Candidate Profile (nama, email, WhatsApp, NIM, fakultas, jurusan, angkatan, IPK, divisi, status aplikasi, submitted at, anonymous ID) di bagian atas. Identitas kandidat selalu terlihat oleh recruiter untuk verifikasi dan pengambilan keputusan; yang dianonimkan hanya teks dokumen yang dikirim ke AI.
- Menampilkan dokumen aplikasi.
- Preview/download dokumen, termasuk dokumen SWOT Analysis.
- Menampilkan language certificate jika ada.
- Menampilkan profile summary.
- Menampilkan chart kompetensi.
- Menampilkan score breakdown.
- Menampilkan justification dan evidence.
- Override score per dimensi.
- Menampilkan card "Validasi Evaluasi AI" (hanya jika kandidat sudah dievaluasi AI): status badge (Menunggu Validasi / Tervalidasi / Perlu Diskusi), nama validator, waktu validasi, dan catatan validasi. Ini hanya checkpoint internal — tidak mengubah skor dan bukan syarat pengumuman.

Tombol utama:

- `Back`: kembali ke halaman sebelumnya.
- `Preview`: membuka preview dokumen.
- Checkbox `Verified`: toggle verifikasi dokumen pendukung legacy.
- Tombol pencil pada score card: membuka dialog override.
- `Save Override`: menyimpan override score.
- `Cancel`: membatalkan override.
- `Tandai Tervalidasi`: menandai hasil evaluasi AI sebagai tervalidasi (catatan opsional).
- `Perlu Diskusi`: menandai hasil evaluasi AI perlu dibahas (catatan wajib).
- `Open in new tab`: membuka dokumen di tab baru.
- `Download`: mengunduh dokumen.

Catatan: catatan validasi terpisah dari alasan override skor. Override skor tidak otomatis menandai hasil sebagai tervalidasi; recruiter perlu memvalidasi ulang secara eksplisit. Status validasi juga muncul sebagai badge "Validasi AI" pada tabel Candidates dan Evaluation.

### Announcements

Halaman ini adalah workspace keputusan akhir untuk mempublikasikan hasil seleksi.

Fitur utama:

- **Ready to Announce**: tabel keputusan untuk kandidat yang sudah selesai Evaluasi AI dan **belum** diumumkan (status `screening`). Hanya kandidat ini yang ikut keputusan publish.
- **Published**: daftar read-only kandidat yang sudah diumumkan (`announced_pass` → "Lolos", `announced_fail` → "Tidak Lolos"). Tidak editable dan tidak ikut bulk publish.
- Keputusan eksplisit per kandidat: **Lolos**, **Tidak Lolos**, atau **Belum Diputuskan** (dropdown decision), bukan lagi checkbox.
- Kandidat rekomendasi AI ditandai dengan row highlight hijau pudar + badge kecil "AI Recommended" (decision support saja, hanya pada Ready to Announce). Tidak ada kolom AI Recommendation terpisah.
- Default decision mengikuti rekomendasi AI bila threshold tersedia (recommended → Lolos, lainnya → Tidak Lolos); bila tidak tersedia, default Belum Diputuskan.
- Helper: `Apply AI Recommendation` dan `Tandai semua Belum Diputuskan → Tidak Lolos`.
- Publish hasil berdasarkan divisi; menampilkan ringkasan Lolos/Tidak Lolos/Belum Diputuskan.
- Super admin dapat publish di luar fase announcement.

Tombol utama:

- Dropdown division/status filter.
- Decision dropdown per kandidat (Lolos / Tidak Lolos / Belum Diputuskan).
- `Apply AI Recommendation`, `Tandai semua Belum Diputuskan → Tidak Lolos`.
- `Publish Results`: membuka dialog konfirmasi.
- `Publish`: mempublikasikan hasil.
- `Cancel`: membatalkan publikasi.

Catatan penting:

- Publish membutuhkan satu divisi spesifik, bukan `All divisions`.
- Bulk publish hanya menyentuh kandidat **Ready to Announce** (status `screening`); kandidat yang sudah diumumkan tidak berubah.
- Publish diblokir jika masih ada kandidat **Belum Diputuskan**.
- Publish boleh dilakukan walaupun **tidak ada kandidat Lolos** (semua Tidak Lolos), selama semua kandidat Ready to Announce sudah diputuskan; muncul konfirmasi khusus.
- Koreksi hasil yang sudah diumumkan tidak lewat bulk publish (gunakan jalur single announcement bila diperlukan).
- Publish adalah action sensitif karena hasil diumumkan ke kandidat.

### Analytics

Halaman ini menampilkan metrik rekrutmen.

Fitur utama:

- Ringkasan active period.
- Total applications.
- Total verified.
- Total evaluated.
- Average score.
- Review/correction count.
- Applicants per division.
- Funnel status aplikasi.
- Distribusi angkatan.
- Distribusi fakultas.
- Distribusi jurusan.
- Document completeness.
- Missing documents.
- Evaluation progress.
- Score distribution.

Tombol utama:

- Dropdown division filter.

### Rubrics

Halaman ini digunakan untuk mengelola rubric penilaian.

Fitur utama:

- Melihat daftar rubric.
- Membuat rubric baru.
- Mengedit rubric.
- Mengatur posisi/divisi rubric.
- Mengatur dimensi penilaian.
- Mengatur bobot dimensi.
- Mengatur indikator.
- Menghapus rubric.

Tombol utama:

- `New Rubric`: membuat rubric baru.
- `Create First Rubric`: membuat rubric pertama saat list kosong.
- `Cancel`: keluar dari form.
- `Add Dimension`: menambah dimensi.
- Tombol trash pada dimensi: menghapus dimensi.
- `Add Indicator`: menambah indikator.
- Tombol `X` pada indikator: menghapus indikator.
- `Save Rubric`: menyimpan rubric.
- Tombol pencil: edit rubric.
- Tombol trash: membuka dialog delete.
- `Delete`: menghapus rubric.

### Recruiter Profile

Halaman ini digunakan recruiter untuk melihat dan mengubah akun sendiri.

Fitur utama:

- Melihat nama.
- Melihat email.
- Melihat role.
- Melihat status akun.
- Mengubah nama.
- Mengubah email.
- Mengubah password.

Tombol utama:

- `Edit Profile`.
- `Simpan Perubahan`.

## Super Admin Page

Super admin page adalah area pengelolaan sistem. Super admin dapat mengelola user, periode recruitment, audit log, email monitoring, dan tetap dapat membuka workspace recruiter.

### Alur Besar Super Admin

Alur super admin secara garis besar:

1. Super admin membuka dashboard admin.
2. Super admin membuat atau memantau periode rekrutmen.
3. Super admin mengelola user dan role.
4. Super admin membantu user dengan reset password link.
5. Super admin memantau audit log.
6. Super admin memantau email notification.
7. Super admin dapat masuk ke workspace recruiter untuk oversight rekrutmen.

### Menu Super Admin

Sidebar super admin berisi:

- `Dashboard`
- `Applications`
- `Evaluation`
- `Candidates`
- `Document Verification`
- `Announcements`
- `Analytics`
- `Users`
- `Periods`
- `Audit Logs`
- `Emails`
- `Settings`
- `Rubrics`
- `Profile`

Menu Applications, Evaluation, Candidates, Document Verification, Announcements, Analytics, dan Rubrics memakai workspace yang sama dengan recruiter.

### Admin Dashboard

Dashboard admin menampilkan ringkasan sistem.

Fitur utama:

- Menampilkan periode aktif.
- Menampilkan statistik periode.
- Menampilkan total users.
- Menampilkan total applications.
- Menampilkan jumlah evaluated.
- Menampilkan status active period.
- Menyediakan shortcut ke workspace admin.

Tombol utama:

- `Open` pada Users.
- `Open` pada Periods.
- `Open` pada Recruiter Applications.
- `Open` pada Audit Logs.
- `Open` pada Emails.
- `Open` pada Analytics.
- `Open` pada Settings.

### Users

Halaman ini digunakan untuk mengelola user.

Fitur utama:

- Search user berdasarkan nama, email, atau NIM.
- Filter berdasarkan role.
- Melihat daftar user.
- Mengubah role user.
- Deactivate/reactivate user.
- Mengirim reset password link.
- Melihat status active/deactivated.
- Melihat tanggal pembuatan akun.

Tombol utama:

- `Search`: mencari user.
- Dropdown role filter.
- Dropdown role pada row user: mengubah role.
- `Deactivate`: menonaktifkan user.
- `Reactivate`: mengaktifkan kembali user.
- `Send reset link`: mengirim link reset password ke email user.
- `Kelola Periode Rekrutasi`: menuju halaman periods.
- `Prev` dan `Next`: pagination.

Catatan:

- Super admin tidak bisa mengubah role/status akun sendiri dari tabel.
- `Send reset link` meminta konfirmasi sebelum dikirim.

### Periods

Halaman ini digunakan untuk mengatur periode rekrutmen.

Fitur utama:

- Melihat periode aktif.
- Menutup periode aktif.
- Membuat periode baru.
- Mengatur tanggal mulai.
- Mengatur akhir pendaftaran.
- Mengatur akhir evaluasi.
- Mengatur tanggal tutup.
- Mengatur threshold Top N.
- Melihat riwayat periode.
- Mengedit periode yang sudah ada.

Tombol utama:

- `Tutup Periode`: membuka dialog penutupan periode.
- `Ya, tutup`: mengonfirmasi penutupan periode.
- `Batal`: membatalkan dialog.
- `Buat & Aktifkan`: membuat periode baru dan menjadikannya aktif.
- `Edit`: mengedit row periode.
- `Simpan`: menyimpan perubahan periode.
- `Batal`: membatalkan edit periode.

Catatan:

- Periode baru hanya bisa dibuat jika tidak ada periode aktif.
- Urutan tanggal harus valid: mulai, akhir pendaftaran, akhir evaluasi, tutup.

### Audit Logs

Halaman ini digunakan untuk memantau tindakan penting di sistem.

Fitur utama:

- Melihat timestamp tindakan.
- Melihat action type.
- Melihat actor.
- Melihat affected user.
- Melihat old value dan new value.
- Melihat reason.
- Filter berdasarkan action type.
- Filter berdasarkan actor ID.
- Filter berdasarkan affected user ID.
- Filter berdasarkan tanggal.
- Pagination.

Tombol utama:

- Dropdown rows.
- Dropdown action type.
- `Apply`: menerapkan filter.
- `Reset`: menghapus filter.
- `Retry`: mencoba ulang saat gagal load.
- `Prev` dan `Next`: pagination.

Halaman ini bersifat read-only.

### Emails

Halaman ini digunakan untuk memantau email notification.

Fitur utama:

- Melihat total email.
- Melihat email sent/captured.
- Melihat email failed.
- Melihat email disabled/mock.
- Melihat provider status.
- Melihat notification logs.
- Filter berdasarkan notification type.
- Filter berdasarkan status email.
- Filter berdasarkan recipient email.
- Filter berdasarkan tanggal.
- Menampilkan daftar template read-only.

Tombol utama:

- Dropdown rows.
- Dropdown notification type.
- Dropdown status.
- `Apply`: menerapkan filter.
- `Reset`: menghapus filter.
- `Retry`: mencoba ulang saat gagal load.
- `Prev` dan `Next`: pagination.

Halaman ini bersifat monitoring/read-only. Tidak ada editor template aktif pada frontend saat ini.

### Settings

Halaman settings saat ini masih placeholder.

Fitur utama:

- Menjelaskan bahwa backend support untuk settings belum tersedia.
- Menjaga route dan menu tetap stabil.
- Memberi gambaran kemungkinan settings di masa depan.

Tombol utama:

- Tidak ada tombol mutasi.

### Super Admin Profile

Halaman ini digunakan super admin untuk melihat dan mengubah akun sendiri.

Fitur utama:

- Melihat nama.
- Melihat email.
- Melihat role.
- Melihat status akun.
- Mengubah nama.
- Mengubah email.
- Mengubah password.

Tombol utama:

- `Edit Profile`.
- `Simpan Perubahan`.

## Catatan Status Penting

### Status Aplikasi Candidate

- `Draft`: aplikasi masih disiapkan.
- `Submitted`: aplikasi sudah dikirim.
- `Document Review`: dokumen sedang direview.
- `Correction Requested`: ada dokumen yang perlu diperbaiki.
- `Verified`: dokumen diterima.
- `Evaluasi AI`: aplikasi masuk tahap evaluasi.
- `Pengumuman`: hasil sudah atau akan ditampilkan.

### Status Dokumen

- `Pending`: belum direview.
- `Verified`: dokumen diterima.
- `Rejected`: dokumen ditolak dan perlu alasan.

### Fase Rekrutmen

- `Belum dibuka`: periode belum mulai.
- `Pendaftaran`: candidate bisa mendaftar dan submit.
- `Evaluasi AI`: recruiter menjalankan evaluasi.
- `Pengumuman`: hasil dapat dipublish.
- `Selesai`: periode sudah berakhir.

### Status Email

- `Sent`: email berhasil dikirim.
- `Captured`: email dicatat dalam mode mock/capture.
- `Failed`: email gagal.
- `Disabled`: pengiriman email sedang disabled.

## Ringkasan Struktur Menu

### Candidate

```text
Dashboard
Application
  Application Overview
  Documents
  Application Status
Account
  Profile
```

### Recruiter

```text
Overview
  Dashboard
Recruitment
  Applications
  Evaluation
  Candidates
  Document Verification
  Announcements
  Analytics
Configuration
  Rubrics
Account
  Profile
```

### Super Admin

```text
Overview
  Dashboard
Recruitment
  Applications
  Evaluation
  Candidates
  Document Verification
  Announcements
  Analytics
Administration
  Users
  Periods
  Audit Logs
  Emails
  Settings
Configuration
  Rubrics
Account
  Profile
```

## Catatan Umum

- Candidate hanya bisa mengakses halaman candidate.
- Recruiter bisa mengakses halaman recruiter dan shared recruiter workspace.
- Super admin bisa mengakses halaman admin dan shared recruiter workspace.
- Beberapa halaman lama masih tersedia tetapi tidak muncul di sidebar, seperti `/upload` dan `/my-applications`.
- Settings masih placeholder.
- Emails adalah halaman monitoring, bukan editor template.
- Publish announcement, role change, deactivate user, reset password link, close period, dan delete rubric adalah action sensitif.

## Penutup

Secara garis besar, frontend ScreenAI Lab sudah tersusun berdasarkan workflow per role. Candidate difokuskan pada pendaftaran dan pemantauan status. Recruiter difokuskan pada review, evaluasi, dan pengumuman. Super admin difokuskan pada pengelolaan sistem, periode, user, audit, dan monitoring email.

Dokumen ini dapat digunakan sebagai user guide internal, bahan onboarding tester, dan pendamping manual testing Phase 12 tanpa perlu membaca detail teknis source code.
