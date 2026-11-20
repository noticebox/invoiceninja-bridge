# 0003: Files that aren't pictures or PDFs go zipped

- Status: accepted
- Date: 2026-11-20

## Context and Problem Statement

Requests come with 3D models (STL, 3MF, OBJ, STEP), pictures and PDFs. Invoice Ninja 5.13 validates a document with Laravel's `mimes`
rule against a fixed list (`png, ai, jpeg, tiff, pdf, gif, psd, txt, doc, xls, ppt, xlsx, docx, pptx, webp, xml, zip, csv, ods, odt,
odp`), by the file's content. `ADDITIONAL_UPLOAD_EXTENSIONS` adds to the list, but a binary STL's content reads as
`application/octet-stream` and is refused whatever its extension. Checked on a running instance, 2026-11-20.

## Considered Options

1. Upload every file as it is, and accept that models are refused.
2. Add the model extensions to `ADDITIONAL_UPLOAD_EXTENSIONS`.
3. Upload pictures and PDFs as they are, and everything else as a zip holding the file under its name.

## Decision Outcome

Option 3. Option 2 doesn't work for binary models. A zip is on the list, opens anywhere, and makes an STL smaller. Pictures and PDFs
stay as they are, so Invoice Ninja shows them. A file over Invoice Ninja's 100 MB after zipping, or refused anyway (a 422), is left in
noticebox and named in the quote's notes; the rest is attached and the handover is done.

### Consequences

- Good: every file a request brings can reach the quote without changing Invoice Ninja's code or settings.
- Bad: a model is one click further away (unzip). Invoice Ninja's PHP limit (10 MB by default) still has to be raised for large files.
