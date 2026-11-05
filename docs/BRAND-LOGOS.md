# Brand logos

Brand research offers **Change logo** for the workspace brand and every configured
competitor, including those whose ads have not been collected. Upload a PNG, JPEG,
WebP or ICO file smaller than 200 KB, or reset to automatic. The sample workspace
uses fixed fictional monograms and cannot upload or fetch logos.

The shared brand identity component uses an uploaded logo first, then an automatic
Facebook Page picture when a Meta Page ID is saved, then the website icon, then
the brand's initials on its colour. A failed or absent image
always leaves the monogram visible. Marks are decorative beside a visible name;
standalone marks have the brand name as their accessible text.

Automatic Page pictures use a saved numeric Meta Page ID, or one unambiguous
advertiser Page ID from saved ads or ad-library evidence. Creator Page IDs are
not used. The anonymous Graph picture request can redirect only to approved Meta
image hosts, with the same public-DNS, HTTPS, time and size checks. It sends no
reporting token or credentials. A failed picture request falls back to the website.

Website icons come only from saved website domains. The existing bounded public
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
If retrieval fails, a previously retained icon is preserved for the same domain
and Page identity. A changed Page ID triggers a fresh lookup.
An unknown website or unsupported outbound transport uses the monogram.

Tests inject fixture transport and public DNS results. The browser preview blocks
website retrieval and tests upload/reset using a local PNG. No test contacts a
brand website or provider.
