# Brand logos

Brand research offers **Change logo** for the workspace brand and every configured
competitor, including those whose ads have not been collected. Upload a PNG, JPEG,
WebP or ICO file smaller than 200 KB, or reset to automatic. The sample workspace
uses fixed fictional monograms and cannot upload or fetch logos.

The shared brand identity component uses an uploaded logo first, then an automatic
website icon, then the brand's initials on its colour. A failed or absent image
always leaves the monogram visible. Marks are decorative beside a visible name;
standalone marks have the brand name as their accessible text.

Automatic icons come only from saved website domains. The existing bounded public
website transport checks the saved host and its www variant, pins public DNS,
rechecks redirects and limits response sizes and time. Discovery prefers an
apple-touch-icon, then the largest declared favicon. SVG and other formats are
rejected by MIME and container signature. ffprobe checks dimensions; ffmpeg writes
a 64px square PNG. Nothing is hotlinked and no logo service is used.

Logo manifests and immutable PNG objects live in `brand-logos/` under the existing
media storage root. Uploads do not replace ad media or write database rows. Both
successful and unsuccessful automatic checks are cached for one calendar month;
the first later request refreshes them. Concurrent image requests share a lookup,
and manifest updates preserve an upload that arrives during automatic retrieval.
If retrieval fails, a previously retained icon is preserved for the same domain.
An unknown website or unsupported outbound transport uses the monogram.

Tests inject fixture transport and public DNS results. The browser preview blocks
website retrieval and tests upload/reset using a local PNG. No test contacts a
brand website or provider.
