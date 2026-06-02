# Phase KHS LLM Parser Cache Rubric Gating

## 1. Ringkasan Perubahan

KHS parser sekarang memakai satu jalur structured parser: DeepSeek V4 Flash sebagai LLM parser untuk text-based PDF. Rule-based course extraction tidak lagi dipertahankan karena variasi layout KHS Telkom membuat ekstraksi kolom course-level sulit dibuat robust. Evaluation tetap cache-first dan rubric-driven: raw KHS tidak dikirim ke AI scoring, hanya structured academic summary yang sudah divalidasi.

## 2. Masalah Sebelumnya

- Parser rule-based bisa membaca IPK/SKS final pada beberapa layout, tetapi course extraction tidak konsisten.
- Grade sering terbaca `null`, course yang sudah selesai dapat salah masuk ongoing, dan `ips_history` sering kosong.
- Angka pada nama mata kuliah seperti `FISIKA 1`, `KALKULUS 1`, atau `FISIKA 2` berisiko disalahartikan sebagai SKS.
- Pemisahan `name_id` dan `name_en` sulit stabil jika hanya mengandalkan regex atau koordinat tabel.
- Raw KHS tidak boleh masuk prompt AI scoring; scoring hanya boleh memakai summary akademik terstruktur.

## 3. Arsitektur Baru

- `backend/services/khs_parser.py` menjadi LLM-only parser:
  - extract text PDF dengan PyMuPDF `page.get_text("text")`.
  - jika text kosong, tidak memanggil LLM dan return machine-unreadable.
  - redact PII dari raw text sebelum memanggil DeepSeek V4 Flash.
  - meminta strict JSON tanpa markdown.
  - memvalidasi schema, range numerik, grade, status, dan ongoing course subset.
- `backend/services/submit_anonymization.py` menjalankan parser KHS setelah accepted document review dan menyimpan wrapper ke `CandidateDocument.sections_json`.
- `backend/services/evaluation_service.py` membaca cache KHS, fallback inline jika cache missing/stale, dan hanya menambahkan summary KHS ke scoring prompt jika rubrik membutuhkan academic evidence.
- `backend/services/rag_pipeline.py` tetap menerima hanya structured academic summary, bukan raw KHS.

## 4. Flow KHS Baru

Text-based PDF:
1. BackgroundTask mengekstrak `raw_text` dengan PyMuPDF.
2. Parser meredaksi PII, termasuk nama kandidat, NIM, dosen wali, URL iGracias, timestamp cetak, token/session/link, dan identifier lain yang tidak dibutuhkan.
3. Parser memanggil DeepSeek V4 Flash (`deepseek-v4-flash`) untuk menghasilkan JSON akademik.
4. JSON divalidasi ketat.
5. Hasil valid disimpan di `candidate_documents.sections_json`.

Image-based/scanned PDF:
1. Jika `raw_text` kosong, LLM tidak dipanggil.
2. Cache menyimpan `processing_status="machine_unreadable"`.
3. `processing_error="KHS PDF has no extractable text; OCR/manual review required"`.
4. OCR tetap out-of-scope.

## 5. Validation Layer

Validator menolak output LLM yang tidak valid:

- IPK harus `null` atau `0.00-4.00`.
- `total_sks_final` harus `null` atau `0-300`.
- IPS harus `null` atau `0.00-4.00`.
- `ips_history` hanya berisi semester dengan IPS final eksplisit. Baris dengan IPS `null` atau `0.0` (semester berjalan / belum ada nilai final) di-drop, sehingga semester ongoing tidak pernah tercatat sebagai IPS `0.0`.
- Total SKS semester harus `null` atau `0-30`.
- SKS course harus `null` atau `1-6`.
- Grade hanya boleh `A`, `AB`, `B`, `BC`, `C`, `D`, `E`, `T`, `K`, atau `null`.
- Jika grade ada, `status` harus `completed` dan `is_completed=true`.
- Jika grade `null`, `status` harus `ongoing` dan `is_completed=false`.
- Course tanpa `code`, `name_id`, dan `name_en` dibuang.
- `ongoing_courses` harus subset dari `courses` dengan grade `null`.
- JSON invalid atau schema invalid disimpan sebagai `processing_status="parse_error"`.

## 5b. LLM Call Robustness (KHS Parser)

### Masalah: empty / invalid JSON response

Parser sempat gagal dengan:

```
[LLM] JSON parse attempt 1/3 failed: Expecting value: line 1 column 1 (char 0)
[LLM] Retrying with stricter prompt...
```

Akar masalah: KHS parser memakai generic `call_llm_json_async()`/`call_llm_json()`
yang tidak memberi guard ketika `message.content` dari DeepSeek kosong atau bukan
JSON valid. `json.loads("")` melempar `Expecting value: line 1 column 1 (char 0)`,
dan tidak ada logging finish_reason/raw response untuk debugging.

### Solusi: dedicated parser `call_khs_llm_parser`

KHS sekarang memakai fungsi khusus `backend/utils/llm_client.py::call_khs_llm_parser`
(bukan generic `call_llm_json`) dengan karakteristik:

- model `deepseek-v4-flash`, `temperature=0`, `max_tokens=8192`.
- `response_format={"type": "json_object"}` agar DeepSeek mengembalikan JSON bare.
- thinking mode dimatikan via `extra_body={"thinking": {"type": "disabled"}}`.
  Jika SDK/API menolak field `thinking`, otomatis fallback memanggil ulang tanpa
  `extra_body` tetapi `response_format` dipertahankan
  (`_looks_like_thinking_rejection` mendeteksi penolakan).
- guard wajib setelah response:

  ```python
  choice = response.choices[0]
  content = choice.message.content
  if not content or not content.strip():
      raise EmptyLLMResponseError(
          f"LLM returned empty content. finish_reason={choice.finish_reason!r}, "
          f"model={model!r}, message={choice.message!r}"
      )
  ```

- empty content -> `EmptyLLMResponseError`; JSON gagal di-parse -> `LLMJsonError`
  dengan preview raw response maksimal 1000 karakter, model, dan finish_reason.

### `_parse_json_response` lebih defensive

- handle `raw is None` dan empty string secara eksplisit.
- strip markdown code fence (```json ... ```).
- coba parse langsung; jika gagal, ekstrak object JSON `{...}` pertama yang
  seimbang (menghormati string/escape) bila model menambah teks pembungkus.
  Tidak lebih permisif dari itu agar tidak menerima sampah.
- error message menyertakan preview raw response.

### Error handling flow (tidak pernah crash background task)

`parse_khs_text` memetakan setiap kegagalan ke hasil `parse_error` /
`machine_unreadable`, tidak melempar exception:

| Kondisi | processing_status | processing_error |
|---|---|---|
| `raw_text` kosong | `machine_unreadable` | `KHS PDF has no extractable text; OCR/manual review required` (LLM tidak dipanggil) |
| LLM content kosong | `parse_error` | `LLM returned empty content` |
| JSON invalid | `parse_error` | `LLM returned invalid JSON: ...` |
| Validation gagal | `parse_error` | `LLM JSON failed validation: ...` |
| Error SDK/API lain | `parse_error` | `LLM parser call failed: <ClassName>: ...` |

Semua kegagalan diberi logging via `logging.getLogger(__name__)` sehingga mudah
ditelusuri di log backend.

### PII redaction tambahan

Selain nama, NIM, dosen wali, URL iGracias, timestamp cetak, dan token/session,
`redact_khs_pii` kini juga meredaksi email (`[REDACTED_EMAIL]`) dan nomor HP
Indonesia (`[REDACTED_PHONE]`, pola `08xx`/`+628xx`, dijaga sempit agar tidak
mengganggu NIM/SKS).

## 6. Cache Wrapper

`sections_json` untuk KHS berbentuk:

```json
{
  "parsed_khs": {
    "ipk_final": 3.46,
    "total_sks_final": 105,
    "ips_history": [
      { "term_label": "2024/2025 - GANJIL", "ips": 3.59, "total_sks": 13 }
    ],
    "courses": [
      {
        "code": "AZK1BAB3",
        "name_id": "FISIKA 1",
        "name_en": "PHYSICS 1",
        "sks": 3,
        "grade": "A",
        "term_label": "2024/2025 - GANJIL",
        "status": "completed",
        "is_completed": true
      }
    ],
    "ongoing_courses": [],
    "parse_warning": null,
    "parser_version": "telkom_khs_llm_v1"
  },
  "processing_status": "parsed",
  "processing_error": null,
  "parser_version": "telkom_khs_llm_v1",
  "source": "llm_parser",
  "model": "deepseek-v4-flash"
}
```

Metadata `last_scoring` dapat ditambahkan saat evaluation berjalan untuk menyimpan `khs_used_in_ai_scoring`, `khs_source`, `khs_warning`, dan timestamp evaluasi.

## 7. Rubric-Driven AI Scoring

KHS masuk scoring prompt hanya jika rubric/dimension/indicator mengandung academic evidence keyword, antara lain:

- `ipk`, `ips`, `gpa`, `cgpa`
- `academic`, `akademik`
- `mata kuliah`, `coursework`, `course`, `kuliah`
- `nilai`, `transkrip`, `khs`, `sks`
- `academic readiness`, `konsistensi ipk`, `relevant course`, `mata kuliah relevan`

Jika tidak cocok, `khs_used_in_ai_scoring=false` dan scoring prompt tidak menerima blok KHS.

## 8. Testing Yang Dijalankan

- `python -m py_compile backend/services/khs_parser.py backend/services/submit_anonymization.py backend/services/evaluation_service.py backend/routers/evaluate_batch.py scripts/smoke_test_phase2_parsers.py scripts/smoke_test_evaluation.py`
  - Hasil: passed.
- `python -m scripts.smoke_test_phase2_parsers`
  - Hasil: passed.
  - Mencakup mocked LLM valid response, DeepSeek V4 Flash model selection, PII redaction sebelum LLM call, final IPK/SKS, grade `A/AB/B`, ongoing hanya nilai kosong, `FISIKA 1`/`KALKULUS 1` tidak mengubah SKS, `ips_history`, cache wrapper parsed, empty text tidak memanggil LLM, invalid JSON -> parse_error, empty LLM content -> parse_error, invalid IPK, invalid SKS, invalid grade, missing file, dan KTM validator regression.
  - Tambahan `test_khs_llm_client` menguji `call_khs_llm_parser` dengan fake OpenAI client:
    - valid JSON string -> dict.
    - `response_format=json_object`, `thinking` disabled, `max_tokens=8192`, `temperature=0` benar-benar dikirim.
    - markdown fenced JSON tetap ter-parse.
    - JSON dibungkus teks tambahan tetap diekstrak.
    - empty content / `None` content -> `EmptyLLMResponseError`.
    - non-JSON content -> `LLMJsonError`.
    - penolakan `thinking` -> fallback memanggil ulang tanpa `extra_body` tetapi tetap `response_format`.
- `python -m scripts.smoke_test_evaluation`
  - Hasil: passed.
  - Mencakup document review accepted membuat cache `candidate_documents` untuk `cv`, `motivation_letter`, `swot`, dan `khs`; evaluation memakai cached parsed KHS; rubrik akademik membuat `khs_used_in_ai_scoring=true`; rubrik non-akademik membuat `khs_used_in_ai_scoring=false`; result endpoint metadata; cache invalidation; empty rubric guard; force re-evaluate; announcement regression.

## 9. Known Limitations

- Parser LLM hanya untuk PDF KHS yang punya extractable text layer.
- OCR untuk KHS scan/image-based masih out-of-scope.
- Kualitas output course-level bergantung pada teks hasil ekstraksi PyMuPDF dan kepatuhan LLM terhadap prompt, tetapi hasil tetap dibatasi oleh validation layer.
- File KHS real Telkom di root project hanya dipakai sebagai referensi lokal untuk PII redaction/debugging dan tidak boleh di-commit.

## 10. Privacy Note

Raw KHS tidak dikirim ke AI scoring. Untuk parsing, teks KHS harus melalui PII redaction sebelum dikirim ke DeepSeek V4 Flash. Evaluation prompt hanya menerima structured academic summary ketika rubrik meminta academic evidence.

## 11. Development Note

- Saat mengetes background task + LLM secara end-to-end, jalankan uvicorn **tanpa**
  `--reload`. WatchFiles dapat memotong proses background ketika file berubah,
  sehingga parse KHS tidak selesai dan cache tidak tersimpan.
- Jangan commit file KHS asli yang mengandung data pribadi (mis. PDF KHS Telkom
  di root project). File tersebut hanya untuk referensi lokal PII
  redaction/debugging.
