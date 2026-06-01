# DESIGN.md — MBC Laboratory Frontend Redesign Guide

## 0. Purpose

Dokumen ini menjadi acuan utama untuk redesign frontend **ScreenAI Lab / MBC Laboratory Recruitment Portal**.

Tujuan redesign bukan sekadar membuat tampilan lebih ramai, tetapi membangun UI yang terasa resmi, kredibel, informatif, dan sesuai identitas MBC Laboratory. Frontend harus membantu candidate, recruiter, dan super admin memahami status rekrutmen, prioritas kerja, deadline, serta next action tanpa kebingungan.

Dokumen ini mengadaptasi prinsip UI reference “Academic Luminary / Digital Curator” seperti floating architecture, tonal layering, spacious layout, glass surface, dan gradient CTA. Namun, seluruh brand foundation disesuaikan dengan brand guidelines MBC Laboratory: warna MBC, logo MBC, tone MBC, serta typeface Montserrat dan Poppins.

---

## 1. Creative North Star

## MBC Research Command Curator

Frontend ScreenAI Lab harus terasa seperti **portal riset dan rekrutmen resmi MBC Laboratory**: calm, structured, modern, credible, dan action-oriented.

Arah visualnya menggabungkan dua karakter:

**Research Command**  
Portal harus membantu user memahami status, prioritas, deadline, dan next action. Candidate harus tahu apa yang harus dilakukan. Recruiter harus tahu queue mana yang perlu diproses. Super admin harus tahu kondisi sistem dan risiko operasional.

**Digital Curator**  
Data, form, dokumen, evaluasi, dan status rekrutmen disajikan seperti artefak yang dikurasi: clean, floating, spacious, dan memiliki hierarchy yang jelas. UI tidak boleh terasa penuh, default, atau asal tempel card.

## Brand Personality Translation

| Brand Trait | UI Translation |
| --- | --- |
| Professional | Layout rapi, hierarchy jelas, tidak playful berlebihan |
| Confident | CTA jelas, warna primary kuat, status mudah dibaca |
| Curious | Elemen insight, analytics, score explanation, empty state edukatif |
| Kind | Copywriting membantu, error state tidak menyalahkan user, onboarding jelas |

## Design Keywords

Gunakan kata-kata ini sebagai quality check visual:

- Research-grade
- Calm authority
- Structured
- Helpful
- Precise
- Premium academic
- Operational clarity
- Human but not playful

Hindari kesan berikut:

- Generic SaaS
- AI-generated dashboard
- Too much grey
- Crowded academic portal
- Overdecorated landing page
- Neon/cyberpunk
- Corporate banking UI

---

## 2. Brand Foundation

## 2.1 Logo Usage

Gunakan logo resmi MBC Laboratory sebagai brand anchor utama.

Recommended usage:

- Gunakan full MBC Lab logo pada Login, Register, Forgot Password, Reset Password, dan Sidebar Header.
- Gunakan compact mark hanya jika horizontal space terbatas.
- Pada light surface, gunakan varian primary atau blue.
- Pada dark/navy surface, gunakan varian white.
- Berikan clear space yang cukup di sekitar logo.
- Jangan stretch, rotate, outline, flip, recolor sembarangan, menambahkan gradient pada logo, atau menaruh logo di background ramai.

Implementation recommendation:

```txt
frontend/src/assets/brand/
  mbc-logo-primary.png
  mbc-logo-blue.png
  mbc-logo-white.png
  mbc-logo-mark.png
```

Generic icon seperti `BarChart3` tidak boleh lagi menjadi brand mark utama pada sidebar atau auth pages.

---

## 3. Color System

Color system harus memakai brand MBC Laboratory, bukan palette mentah dari UI reference.

## 3.1 Core Brand Palette

| Token | HEX | Usage |
| --- | --- | --- |
| `mbc-blue` | `#0065B0` | Main primary, active state, link, primary icon |
| `mbc-atlanta` | `#1E3F75` | Deep navy, sidebar, header, gradient start |
| `mbc-red` | `#E12A26` | Destructive, rejected, urgent, critical action |
| `mbc-black` | `#0D0D0D` | Strong text, high emphasis |
| `mbc-gray` | `#777777` | Muted text, secondary labels |
| `mbc-white` | `#FFFFFF` | Card surface, inverted text |

## 3.2 Semantic Tokens

| Token | HEX | Purpose |
| --- | --- | --- |
| `background` | `#F7FAFC` | Main app background |
| `foreground` | `#0D0D0D` | Main text |
| `card` | `#FFFFFF` | Primary content cards |
| `card-foreground` | `#0D0D0D` | Text on card |
| `primary` | `#0065B0` | Main action and active navigation |
| `primary-foreground` | `#FFFFFF` | Text on primary |
| `primary-deep` | `#1E3F75` | Deep brand color |
| `secondary` | `#EEF5FB` | Soft blue section background |
| `secondary-foreground` | `#1E3F75` | Text on secondary |
| `muted` | `#F1F5F9` | Subtle surface |
| `muted-foreground` | `#64748B` | Secondary text |
| `accent` | `#EAF4FC` | Hover/active soft surface |
| `accent-foreground` | `#1E3F75` | Text on accent |
| `destructive` | `#E12A26` | Error, delete, rejected |
| `destructive-foreground` | `#FFFFFF` | Text on destructive |
| `warning` | `#A33F00` | Action required, phase warning |
| `success` | `#15803D` | Verified, passed, completed |
| `info` | `#0065B0` | Informational state |
| `border` | `rgba(30, 63, 117, 0.12)` | Ghost border only |
| `input` | `#EEF5FB` | Input background |
| `ring` | `#0065B0` | Focus ring |

## 3.3 Surface Hierarchy

Adopt prinsip **tonal layering** dari UI reference.

| Layer | Token | Value | Description |
| --- | --- | --- | --- |
| Base layer | `surface` | `#F7FAFC` | The desk |
| Section layer | `surface-container-low` | `#EEF5FB` | The folder |
| Card layer | `surface-container-lowest` | `#FFFFFF` | The paper |
| Hover/elevated layer | `surface-container-high` | `#F3F8FD` | Lifted surface |
| Strong surface | `surface-container-highest` | `#E4F0FA` | Selected/inactive step track |
| Glass surface | `surface-glass` | `rgba(255,255,255,0.78)` | Floating topbar/sidebar panels |

## 3.4 Gradient Rules

Main CTA tidak boleh flat. Gunakan MBC signature gradient:

```css
linear-gradient(135deg, #1E3F75 0%, #0065B0 100%)
```

Gunakan gradient hanya untuk:

- Primary buttons
- Login/register hero panel
- Active sidebar marker
- Key status hero
- Important dashboard highlights

Jangan gunakan gradient pada:

- Logo
- Regular cards
- Semua table rows
- Semua icon background
- Decorative noise yang mengganggu readability

## 3.5 Color Usage Ratio

Gunakan rasio ini agar UI tetap calm:

- 70% light neutral / soft blue surfaces
- 20% MBC blue/navy
- 7% gray text and neutral utility
- 3% red/warning/success accents

Boho Red sangat kuat. Gunakan hanya untuk destructive, rejected, delete, atau urgent action.

---

## 4. Typography

Gunakan typeface dari brand guidelines MBC Laboratory.

## 4.1 Font Pairing

| Role | Font |
| --- | --- |
| Display, headline, title, metric numbers | Montserrat |
| Body, labels, forms, tables, helper text | Poppins |

Jangan gunakan Manrope/Inter dari UI reference sebagai final brand fonts.

## 4.2 Type Scale

| Token | Font | Size | Weight | Letter Spacing | Usage |
| --- | --- | --- | --- | --- | --- |
| `display-lg` | Montserrat | 3rem | 700 | -0.03em | Auth hero / major page hero |
| `display-md` | Montserrat | 2.5rem | 700 | -0.025em | Dashboard hero |
| `headline-lg` | Montserrat | 2rem | 700 | -0.02em | Major section title |
| `headline-md` | Montserrat | 1.5rem | 650 | -0.015em | Page title |
| `headline-sm` | Montserrat | 1.25rem | 600 | -0.01em | Card title |
| `body-lg` | Poppins | 1rem | 400 | 0 | Important description |
| `body-md` | Poppins | 0.9375rem | 400 | 0 | Default UI text |
| `body-sm` | Poppins | 0.875rem | 400 | 0 | Table text / helper |
| `label-md` | Poppins | 0.75rem | 600 | 0.04em | Badge / form label |
| `label-sm` | Poppins | 0.6875rem | 600 | 0.06em | Micro-data, uppercase |

## 4.3 Copywriting Language

Default language untuk candidate-facing UI adalah Bahasa Indonesia.

Recommended style:

- Clear, supportive, and direct.
- Gunakan English hanya untuk technical terms yang sudah umum.
- Hindari campuran bahasa dalam satu komponen.
- Gunakan frasa action-oriented.

| Current Style | Recommended |
| --- | --- |
| `Sign in to ScreenAI Lab` | `Masuk ke Portal Rekrutmen MBC Lab` |
| `Start application` | `Mulai Pendaftaran` |
| `Continue uploading` | `Lanjut Unggah Dokumen` |
| `Review & Submit` | `Tinjau & Kirim Pendaftaran` |
| `Run evaluation first` | `Jalankan evaluasi terlebih dahulu` |
| `No submitted applications` | `Belum ada pendaftaran terkirim` |

Recruiter/admin UI boleh tetap memakai technical terms, tetapi struktur kalimat harus konsisten.

---

## 5. Layout Philosophy

## 5.1 No-Line Rule, But Practical

Borders tidak boleh menjadi cara utama membuat section. Gunakan tonal difference, spacing, dan elevation terlebih dahulu.

Allowed:

- Ghost borders dengan opacity rendah.
- Input outlines.
- Focus rings.
- Table column separation jika diperlukan untuk readability.
- Destructive/critical state outlines.

Avoid:

- Default 1px gray border di semua card.
- Terlalu banyak divider line.
- Table-heavy pages dengan border keras.
- Nested cards dengan repeated borders.

## 5.2 Floating Architecture

Sebagian besar content harus terasa seperti floating cards di atas soft blue surfaces.

Use:

- `background` untuk page base.
- `secondary` atau `surface-container-low` untuk page zones.
- `card` untuk content blocks.
- Ambient shadows untuk important containers.
- Generous spacing antar section.

## 5.3 Spacing Scale

| Token | Value | Usage |
| --- | --- | --- |
| `space-1` | 4px | Icon/text micro gap |
| `space-2` | 8px | Small component gap |
| `space-3` | 12px | List item gap |
| `space-4` | 16px | Form field gap |
| `space-5` | 20px | Card padding |
| `space-6` | 24px | Section internal gap |
| `space-8` | 32px | Major content gap |
| `space-12` | 48px | Auth/hero vertical gap |
| `space-16` | 64px | Landing-like section gap |

Jika halaman terasa penuh, naikkan spacing sebelum menambahkan dekorasi.

---

## 6. Elevation & Depth

## 6.1 Ambient Shadow

Shadows harus terasa, bukan terlihat berat.

Default card shadow:

```css
0px 12px 32px rgba(13, 13, 13, 0.06)
```

Navy-tinted shadow untuk brand surfaces:

```css
0px 18px 40px rgba(30, 63, 117, 0.12)
```

Hindari pure black heavy shadow.

## 6.2 Radius

| Token | Value | Usage |
| --- | --- | --- |
| `radius-sm` | 8px | Inputs, badges |
| `radius-md` | 12px | Cards, table wrappers |
| `radius-lg` | 16px | Dashboard cards |
| `radius-xl` | 20px | Auth card, hero card |
| `radius-pill` | 999px | Buttons, chips |

Cards umumnya memakai 12–16px. Buttons memakai pill radius agar kontras dengan card geometry.

---

## 7. Core Components

## 7.1 AppShell

Replace shell sederhana dengan struktur berikut:

```txt
AppShell
  BrandSidebar
  MainArea
    GlassTopbar
    PageContainer
      PageHeader
      PageContent
```

Desktop:

- Sidebar fixed, 260–280px width.
- Main content max width sekitar `1280px`.
- Topbar sticky, glass surface, subtle blur.
- Page padding: 24px mobile, 32px desktop.

Mobile:

- Sidebar menjadi drawer.
- Topbar berisi menu button, compact logo, user menu.
- Table-heavy pages berubah menjadi card list.

## 7.2 BrandSidebar

Sidebar adalah primary brand surface.

Recommended style:

- Deep navy atau very soft light surface sesuai final direction.
- Gunakan logo MBC asli.
- Group navigation by role.
- Active item memakai MBC gradient atau strong blue pill.
- Inactive item memakai muted text.
- User role badge muncul di bawah.
- Logout button calm, tidak terlalu destructive.

Candidate groups:

- Beranda
- Pendaftaran
- Dokumen
- Status Seleksi
- Profil

Recruiter groups:

- Overview
- Applications
- Document Verification
- Evaluation
- Candidates
- Announcements
- Analytics
- Rubrics
- Profile

Super Admin groups:

- Control Center
- Users
- Periods
- Applications
- Evaluation
- Document Verification
- Announcements
- Audit Logs
- Emails
- Settings
- Profile

## 7.3 GlassTopbar

Topbar harus memberikan current context.

Content:

- Current recruitment period name.
- Current phase badge.
- Deadline/countdown bila tersedia.
- Role badge.
- User menu.
- Optional quick action sesuai role.

Style:

```css
background: rgba(255, 255, 255, 0.78);
backdrop-filter: blur(24px);
box-shadow: 0px 8px 24px rgba(30, 63, 117, 0.08);
```

## 7.4 PageHeader

Setiap protected page harus memakai `PageHeader` konsisten.

Content:

- Eyebrow atau breadcrumb.
- Title.
- Description.
- Primary action.
- Optional status chip.

Example:

```txt
Pendaftaran / Dokumen
Lengkapi Dokumen Pendaftaran
Unggah seluruh dokumen wajib sebelum periode pendaftaran berakhir.
[Unggah Dokumen]
```

## 7.5 Cards

Cards adalah content surface utama.

Style:

- Background: `card`
- Border: none by default
- Radius: 12–16px
- Shadow: ambient
- Padding: 20–24px
- Hover: soft surface shift, bukan shadow dramatis
- Use title + description + action pattern

Card tidak boleh hanya menjadi kotak kosong. Setiap card harus mengomunikasikan state, insight, atau action.

## 7.6 MetricCard

Metric card harus menjelaskan arti angka.

Structure:

```txt
[Icon]
24
Applications
+4 submitted today
```

Rules:

- Number memakai Montserrat.
- Label memakai Poppins.
- Tambahkan helper text jika memungkinkan.
- Gunakan semantic color sesuai meaning.
- Hindari metric tanpa konteks.

## 7.7 StatusBadge

Buat centralized status badge system.

| Status | Tone | Label |
| --- | --- | --- |
| `draft` | neutral | Draft |
| `submitted` | info | Terkirim |
| `screening` | info | Screening |
| `verified` | success | Terverifikasi |
| `correction_requested` | warning | Perlu Revisi |
| `evaluated` | info | Terevaluasi |
| `announced_pass` | success | Lolos |
| `announced_fail` | destructive | Tidak Lolos |
| `rejected` | destructive | Ditolak |
| `closed` | neutral | Ditutup |

## 7.8 Buttons

Primary:

- Gradient MBC.
- Pill radius.
- White text.
- Hanya untuk main action.

Secondary:

- Transparent atau soft blue background.
- Ghost border.
- Navy text.

Tertiary:

- Text button.
- Untuk small actions.

Destructive:

- Boho Red.
- Hanya untuk destructive actions.

## 7.9 Inputs

Input style:

- Background: soft blue surface.
- Border: ghost border.
- Focus: 2px MBC Blue ring.
- Radius: 10–12px.
- Padding comfortable.
- Include helper text jika validasi strict.

Password fields harus memiliki visible toggle icon yang konsisten dengan input controls lain.

## 7.10 StepTrack

Use StepTrack for recruitment progress.

Candidate version:

```txt
Pendaftaran → Verifikasi Dokumen → Evaluasi → Pengumuman
```

Recruiter/admin version:

```txt
Submission → Document Verification → Evaluation → Announcement → Closed
```

Rules:

- Active step memakai MBC Blue.
- Completed step memakai success.
- Inactive step memakai `surface-container-highest`.
- Connector line 4px, bukan 1px.
- Setiap step memiliki helper text/date bila tersedia.

## 7.11 Empty State

Empty state harus membantu, bukan sekadar kosong.

Structure:

```txt
[Icon/Illustration]
Belum ada pendaftaran terkirim
Pendaftaran kandidat akan muncul di sini setelah mereka mengirim dokumen final.
[Lihat Periode Aktif]
```

Rules:

- Jelaskan kenapa halaman kosong.
- Berikan next action bila memungkinkan.
- Jangan gunakan generic “No data”.

## 7.12 Loading State

Gunakan skeleton sesuai layout final.

Avoid:

- Full-page spinner untuk data-heavy pages.
- Empty white page dengan loader.

Use:

- Card skeleton.
- Table row skeleton.
- Metric skeleton.

---

## 8. Page-Level Redesign Guidance

## 8.1 Auth Pages

Applies to:

- Login
- Register
- Verify Email
- Forgot Password
- Reset Password

Goal: membuat first impression terasa official, branded, dan trustworthy.

Recommended layout:

- Split layout pada desktop.
- Left/hero side: MBC logo, headline, tagline, recruitment value proposition.
- Right side: form card.
- Use soft MBC gradient background.
- Tambahkan small visual card berisi recruitment phases atau lab divisions.
- Gunakan Bahasa Indonesia untuk candidate-facing copy.

Login headline:

```txt
Masuk ke Portal Rekrutmen MBC Lab
Kelola pendaftaran, dokumen, dan status seleksi dalam satu tempat.
```

Register headline:

```txt
Buat Akun Kandidat
Mulai perjalananmu bersama Multimedia Application, Big Data, and Cybersecurity Laboratory.
```

## 8.2 Candidate Dashboard

Goal: candidate langsung memahami current status dan next action.

Recommended structure:

```txt
CandidateStatusHero
  Current status
  Next action
  Deadline/countdown
  Primary CTA

RecruitmentStepTrack

ApplicationProgressCard
  Documents uploaded
  Missing requirements
  Submit readiness

DocumentChecklistCard

AnnouncementCard, only when relevant
```

Examples of next-action messages:

- `Lengkapi 2 dokumen lagi sebelum mengirim pendaftaran.`
- `Pendaftaranmu sudah terkirim dan sedang diproses recruiter.`
- `Dokumen perlu direvisi. Periksa catatan recruiter.`
- `Hasil seleksi sudah tersedia. Cek pengumuman sekarang.`

Hindari terlalu banyak CTA yang sama pentingnya.

## 8.3 Candidate Application Flow

Goal: application process terasa guided, bukan disconnected pages.

Recommended flow:

1. Choose division.
2. Complete profile.
3. Upload documents.
4. Review application.
5. Submit final application.
6. Track status.

Gunakan persistent step indicator pada application-related pages.

## 8.4 Candidate Documents Page

Goal: document requirements jelas.

Recommended improvements:

- Setiap dokumen memiliki requirement card.
- Show status: missing, uploaded, verified, rejected, needs correction.
- Show allowed file type and max size.
- Show recruiter note saat correction requested.
- Disabled final submit harus menjelaskan alasannya.

## 8.5 Candidate Status Page

Goal: transparan dan reassuring.

Recommended content:

- Submission timestamp.
- Current phase.
- Verification status.
- Evaluation/announcement status jika relevan.
- Apa yang bisa/tidak bisa dilakukan candidate sekarang.
- Clear explanation saat waiting.

## 8.6 Recruiter Dashboard

Goal: recruiter melihat work queues dan operational priorities.

Recommended structure:

```txt
RecruiterCommandHero
  Active period
  Current phase
  Next deadline
  Primary action

QueueMetrics
  Pending document verification
  Pending evaluation
  Correction requested
  Ready for announcement

DivisionBreakdown
  Big Data
  Cyber Security
  GIS
  Game Tech

WorkQueue
  Highest priority candidates/actions
```

Dashboard tidak boleh hanya menjadi shortcut grid. Shortcut bersifat secondary.

## 8.7 Recruiter Applications Page

Goal: candidate review lebih cepat.

Recommended improvements:

- Search by name, email, NIM.
- Quick filter chips: All, Submitted, Verified, Correction Requested, Evaluated, Recommended.
- Division filter.
- Status filter.
- Sort by submitted date, score, completeness.
- Table row hover reveal primary action.
- Mobile view menjadi candidate cards.

Table columns:

- Candidate
- Division
- Status
- Docs
- Score
- Recommendation
- Submitted
- Action

## 8.8 Document Verification Page

Goal: verification precise dan low-friction.

Recommended layout:

```txt
Left: Candidate/document queue
Right: Document preview and verification panel
```

Requirements:

- Toggle atau tab untuk setiap document type.
- Preview document bila memungkinkan.
- Status per document.
- Notes/rejection reason.
- Finalize verification action.
- Clear state saat verification belum finalized.

## 8.9 Evaluation Page

Goal: AI evaluation terasa controlled dan auditable, bukan magical.

Recommended improvements:

- Show current phase requirement.
- Show division selection.
- Show candidates ready for evaluation.
- Explain what AI will evaluate.
- Show last evaluation timestamp.
- Show retry/re-run state.
- Show threshold N context.
- Show warning before destructive re-run.

## 8.10 Candidates Page

Goal: support ranking dan decision-making.

Recommended improvements:

- Ranked list by composite score.
- Recommendation badge.
- Division tabs.
- Score breakdown.
- AI explanation preview.
- Manual review notes jika tersedia.
- Clear action: open detail, select for announcement.

## 8.11 Announcements Page

Goal: prevent mistakes before publishing results.

Recommended improvements:

- Pre-publish checklist.
- Show selected pass/fail counts per division.
- Require confirmation before publish.
- Show preview of candidate-facing result.
- Disable publish if evaluation incomplete.
- Make irreversible actions visually clear.

## 8.12 Admin Dashboard

Goal: super admin bisa monitor system health dan mencegah human error.

Recommended structure:

```txt
AdminControlHero
  Active period
  Current phase
  Critical status
  Primary action

SystemMetrics
  Total users
  Total applications
  Evaluated
  Pending verification

PeriodControlPanel
  Active period details
  Phase schedule
  Threshold N
  Allowed admin actions

RiskAlerts
  Active period conflict
  Missing configuration
  Unverified documents in evaluation phase
  Email delivery issue
```

## 8.13 Recruitment Period Page

Goal: period creation and update aman.

Recommended rules:

- Jika ada active period, jangan tampilkan create-new-period sebagai primary normal action.
- Show clear warning before stopping/closing active period.
- Prevent overlapping active periods.
- Show phase timeline preview before saving.
- Show validation errors inline.

## 8.14 Users Page

Goal: admin bisa manage accounts dengan aman.

Recommended improvements:

- Search and filter by role/status.
- Role badge.
- Account status badge.
- Action menu per user.
- Confirm dangerous changes.
- Password reset action jelas sebagai assisted/admin-only.

## 8.15 Audit Logs Page

Goal: admin actions traceable.

Recommended improvements:

- Filter by actor, action, date, entity.
- Use compact timeline cards.
- Highlight destructive or sensitive actions.
- Avoid raw JSON-first presentation unless expanded.

---

## 9. Data Visualization

Use Recharts with MBC color tokens.

Chart palette:

```txt
#0065B0
#1E3F75
#E12A26
#15803D
#A33F00
#777777
```

Rules:

- Prefer simple bar/line charts.
- Jangan overload dashboard dengan chart.
- Gunakan chart hanya bila mendukung keputusan.
- Selalu include labels, legends, dan empty states.
- Hindari rainbow palette.

---

## 10. Accessibility

Minimum requirements:

- Semua text harus readable di light dan brand surfaces.
- Focus state harus visible.
- Buttons harus punya accessible labels.
- Icon-only buttons perlu `aria-label`.
- Status tidak boleh bergantung pada warna saja.
- Tables harus tetap navigable.
- Form errors harus dekat dengan field.
- Destructive actions memerlukan confirmation.

Contrast rules:

- Body text memakai `foreground`, bukan gray yang terlalu lemah.
- Muted text tetap harus readable.
- White text on MBC Blue/Navy allowed.
- Hindari red text on dark navy tanpa contrast check.

---

## 11. Responsive Behavior

Desktop first, tetapi mobile tidak boleh rusak.

Breakpoints:

- Mobile: single column, drawer nav, card lists.
- Tablet: two-column cards jika natural.
- Desktop: sidebar + content grid.
- Wide desktop: max content width, jangan membuat line terlalu panjang.

Tables:

- Desktop: full table.
- Mobile: card list with key-value rows.

Forms:

- Mobile: single column.
- Desktop: two columns hanya jika fields naturally paired.

---

## 12. Implementation Guidelines

## 12.1 Suggested Frontend File Structure

```txt
frontend/src/
  assets/
    brand/
      mbc-logo-primary.png
      mbc-logo-blue.png
      mbc-logo-white.png
      mbc-logo-mark.png

  components/
    layout/
      AppShell.jsx
      BrandSidebar.jsx
      GlassTopbar.jsx
      PageHeader.jsx
      PageContainer.jsx

    brand/
      MbcLogo.jsx
      BrandGradient.jsx

    common/
      StatusBadge.jsx
      PhaseBadge.jsx
      EmptyState.jsx
      LoadingState.jsx
      MetricCard.jsx
      ActionCard.jsx
      StepTrack.jsx
      ConfirmActionDialog.jsx

    candidate/
      CandidateStatusHero.jsx
      DocumentRequirementCard.jsx
      ApplicationProgressCard.jsx

    recruiter/
      WorkQueueCard.jsx
      DivisionBreakdownCard.jsx
      CandidateReviewCard.jsx

    admin/
      AdminControlHero.jsx
      RiskAlertCard.jsx
      PeriodSafetyPanel.jsx

  lib/
    designTokens.js
    statusMaps.js
    phaseMaps.js
```

## 12.2 CSS Variable Direction

Replace default grayscale theme dengan MBC tokens.

```css
:root {
  --background: #F7FAFC;
  --foreground: #0D0D0D;

  --card: #FFFFFF;
  --card-foreground: #0D0D0D;

  --primary: #0065B0;
  --primary-foreground: #FFFFFF;
  --primary-deep: #1E3F75;

  --secondary: #EEF5FB;
  --secondary-foreground: #1E3F75;

  --muted: #F1F5F9;
  --muted-foreground: #64748B;

  --accent: #EAF4FC;
  --accent-foreground: #1E3F75;

  --destructive: #E12A26;
  --destructive-foreground: #FFFFFF;

  --border: rgba(30, 63, 117, 0.12);
  --input: #EEF5FB;
  --ring: #0065B0;

  --surface-container-low: #EEF5FB;
  --surface-container-lowest: #FFFFFF;
  --surface-container-high: #F3F8FD;
  --surface-container-highest: #E4F0FA;

  --radius: 0.875rem;
}
```

Font direction:

```css
@import "@fontsource-variable/montserrat";
@import "@fontsource-variable/poppins";

@theme inline {
  --font-heading: "Montserrat Variable", sans-serif;
  --font-sans: "Poppins Variable", sans-serif;
}
```

Dependency note:

```bash
npm install @fontsource-variable/montserrat @fontsource-variable/poppins
```

Stop using Geist as primary app font once the new font system is implemented.

## 12.3 Component Migration Strategy

Jangan redesign semua halaman sekaligus.

Recommended order:

1. Design tokens and fonts.
2. Logo assets and brand helper component.
3. AppShell, BrandSidebar, GlassTopbar, PageHeader.
4. Common components: StatusBadge, MetricCard, EmptyState, StepTrack.
5. Auth pages.
6. Candidate Dashboard.
7. Recruiter Dashboard.
8. Admin Dashboard.
9. Applications and Document Verification.
10. Evaluation, Candidates, Announcements, Periods, Users, Audit Logs.

---

## 13. Design QA Checklist

Sebuah page redesign dianggap selesai bila:

- Menggunakan MBC colors, bukan default shadcn grayscale.
- Menggunakan Montserrat/Poppins.
- Logo MBC tampil pada area brand identity.
- Ada satu primary action yang jelas.
- Page menjelaskan current status.
- Empty/loading/error states membantu.
- Destructive actions protected.
- Cards floating lewat surface/elevation, bukan hard borders.
- Copywriting candidate-facing konsisten Bahasa Indonesia.
- Mobile layout tetap usable.
- Tables readable dan filterable.
- Page terasa seperti MBC Laboratory, bukan generic SaaS.

---

## 14. Do and Don’t

## Do

- Use MBC Blue and Atlanta Navy as the main identity.
- Use Boho Red only for urgent/destructive/rejected states.
- Use spacious layouts and tonal layering.
- Use glass surface for topbar or floating context panels.
- Use real MBC logo assets.
- Make dashboard content action-oriented.
- Use step tracks for recruitment journey.
- Use helpful microcopy.
- Make recruiter/admin pages operational, not just navigational.

## Don’t

- Do not use the ScholarFlow colors directly.
- Do not use Manrope/Inter as final brand fonts.
- Do not keep generic chart icons as the brand mark.
- Do not overuse borders to separate every section.
- Do not make every card visually equal.
- Do not use red as decoration.
- Do not mix English and Indonesian randomly.
- Do not make tables unusable on mobile.
- Do not hide important workflow status inside secondary text.
- Do not create a flashy cyberpunk look just because the lab includes cybersecurity.

---

## 15. Final Direction

Final redesigned frontend should feel like:

```txt
MBC Laboratory Recruitment Portal
A research-grade command interface for candidates, recruiters, and administrators.
Calm, structured, branded, and operationally clear.
```

It should not feel like:

```txt
A generic SaaS dashboard with default shadcn styling.
```

Redesign berhasil ketika user dapat langsung mengenali identitas MBC Lab, memahami current recruitment status, dan tahu next action tanpa kebingungan.
