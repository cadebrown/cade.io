# Resume and CV documents

Findwork owns the private fact ledger, reusable statements, and ordered resume/CV
selections. The website renders a minimal snapshot of those selections. HTML and
PDF use the same frozen block order and wording; the snapshot records the PDF's
SHA-256 so a stale or mismatched download fails validation.

## Private local review

In Findwork, build each selection in review mode, then project each verified
bundle into a new directory:

```sh
npm run resume -- build --spec profile/resumes/resume.yaml --max-pages 1
npm run resume -- build --spec profile/resumes/cv.yaml --max-pages 3
npm run resume -- site-export --artifact RESUME_BUNDLE --output-root REVIEW_ROOT/resume
npm run resume -- site-export --artifact CV_BUNDLE --output-root REVIEW_ROOT/cv
```

Use the returned bundle directories, not the latest filename by guesswork.
Keep REVIEW_ROOT outside this public repository, under Findwork's ignored
outputs directory. Each projection contains only document.json and document.pdf;
never copy the raw ledger, selected facts, statement approvals, or bundle manifest.

From this repository:

```sh
npm run career:preview -- --source REVIEW_ROOT
```

The preview binds to 127.0.0.1:4325 and exposes `/resume`, `/cv`, `/resume.pdf`,
and `/cv.pdf`. `--port` selects another local port. Both pages identify the private
review and use noindex metadata and headers. Review PDFs retain their review
markings. The private input path is read only on the server.

Each page offers **View PDF** to open its full-page PDF URL and **Download PDF**
to save the same file with a descriptive filename. These ordinary links work
without JavaScript; the PDF response is inline, while the download link uses the
HTML `download` attribute.

The default document accent is slate blue (`#284B70`), chosen from the local
resume style comparison. Findwork applies it to new resume/CV PDFs, editable
Word copies, and standalone HTML. The career pages use the same accent in light
mode and a lighter slate blue in dark mode; all styling stays within the career
documents. Company/title/date hierarchy, bold skill labels, and focused project
and publication links preserve the source wording. Rebuild and project both
documents after a renderer change so the PDF links serve the new verified files.

Normal development and production builds do not read that directory. Supplying
CAREER_REVIEW_DIR to a production build fails. Review mode is never a release
override. Browser printing is useful; the downloadable PDF is the curated
document output.

## Public release

A generation request is not a wording-approval record. Findwork's existing
candidate review workflow records permitted uses and exact wording decisions;
website use is separate from resume use. Its `approve --purpose website` command
checks fact eligibility without widening permissions. Public `site-export
--mode export` requires an export bundle whose frozen facts and statements pass
both resume and website checks. Changing wording, URLs, facts, or their
permissions invalidates those decisions.

After the candidate reviews the finished documents, export both selections again
from the approved current inputs, using `site-export --mode export` into
PUBLIC_ROOT/resume and PUBLIC_ROOT/cv. Then run:

```sh
npm run career:import -- --source PUBLIC_ROOT
```

The importer validates both public snapshots and matching PDF bytes before making
local changes. It saves only the minimal JSON under `src/data/career/`, replaces
the two canonical PDFs in `src/assets/`, and updates the existing shared-asset
mapping. `/resume.pdf` and `/cv.pdf` become canonical; `/cade-brown-resume.pdf`,
`/cade-brown-cv.pdf`, and the historic `/bones/` aliases redirect directly to
them. Public PDFs use the site's existing asset publisher; there is no second
copy in the content snapshot or `public/`. A partial import fails the build's
PDF hash check. Importing does not commit or deploy. Do not run the public
import for a private review; the importer rejects it.

The October 14, 2026 release uses the selected slate-blue layout, a one-page
resume and a three-page CV. Both share the headline “Agentic performance
optimization | Compilers & DSLs | GPU numerical libraries.” Historical PDF URLs
serve these current documents. The pre-migration URL inventory stays unchanged;
its byte-preservation test explicitly checks these two updated documents against
their approved snapshots and retains historical byte checks for every other file.

## Validation

Run the Findwork document tests and bundle verification, then `npm run validate`
here. The ordinary browser suite covers public career routes, both themes,
desktop/mobile/WebKit, downloads, exact PDF bytes, and historic redirects. With
private projections available, run the separate review-mode browser checks:

```sh
CAREER_REVIEW_DIR=REVIEW_ROOT npx playwright test --config playwright.career.config.ts
```

This owns loopback port 4326 and tests desktop Chromium, mobile Chromium, and
WebKit. Screenshots are saved under `artifacts/career/screenshots/`.
Review both themes, desktop and mobile, keyboard links, document anchors,
download content type/bytes, and every PDF page. The site's snapshot tests check
private metadata rejection, unsafe links, review/public separation, PDF hashes,
and ordering. PDF text extraction establishes reading order, not universal ATS
compatibility. Publication is a separate action.
