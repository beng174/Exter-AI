# Reference renders: how every screen must look

`png/<Screen>.png` is the approved look of each screen at 1440px wide.
`<Screen>.html` is the same screen as plain static HTML, with the exact markup and
inline styles. Open it in a browser (no runtime needed) to measure spacing, sizes,
colours and copy. Both are generated from `design/screens/*.dc.html`.

| Reference | App view |
| --- | --- |
| Main | `overview` (Home) |
| Brands | `brands` |
| Competitors | `competitors` |
| Creatives | `creatives` |
| CreativeDetail | `creative` |
| Formats | `formats` |
| Patterns | `patterns` |
| Audience | `audience` |
| Winners | `winners` |
| Briefs | `briefs` |
| Creators | `creators` |
| Scores | `scores` |
| Ask | `ask` |
| Reports | `reports` |
| DataSources | `data` |
| Sidebar | shared sidebar |

All brand names, numbers, quotes and dates in the references are placeholders.
Replace them with real data. The "Sample data" pill only appears in demo mode.

## Fidelity rules

These rules sit on top of `research/UI-SPEC.md` and decide every layout question.

1. **Same structure.** Every section in the same order, position, width and card
   shape as the reference. Every page uses the reference header: context line,
   title, one line subtitle with the date range, actions on the right, then the
   row of source status pills and "About this data" where the reference has them.
   Do not add filter cards, notes or explanation blocks that the reference does
   not have. Filters sit where the reference shows them; elsewhere the date range
   is a compact control in the header.
2. **Same components.** Chips, score bars, thumbnails, bar charts, heatmaps, tiles,
   priority cards and tables with a Basis column, drawn as in the reference. Table
   text 14px with the reference row height. Data labels go in the Basis column or
   as one small chip per tile, not after every number unless the reference does so.
3. **Same copy.** Headings, subtitles, labels, column names, nav labels (including
   "Audience & voice" and "Opportunities & briefs") and button text word for word.
   Replace only sample values. Do not add caveat sentences to the page; caveats go
   behind "About this data".
4. **Same icons.** Sidebar and page icons as in the reference, using the nearest
   `lucide-react` icon.
5. **Missing data keeps the design.** A section keeps its frame, title and place.
   Inside it, show one muted line and at most one action where the content would
   be. In tables, hide columns and measure rows with no usable data and say so in one
   line above the table. Omit uncollected brands from metric columns and explain
   the uncollected set once, with its collection action. Never swap a designed chart, card row or tile grid for a
   different layout. Buttons for features that are not built yet stay in place,
   disabled, with a tooltip saying what they need.
6. **Check every screen.** Screenshot each screen at 1440px, put it beside the
   reference PNG and fix every difference in layout, spacing, type size, colour,
   icon and copy that real data does not explain. Attach both images per screen in
   the PR, and list any difference you kept and why.
7. **Alignment on every screen, in real and sample workspaces.**
   - Centre the main content column in the area right of the sidebar, with a
     maximum content width of 1280px. Every section on a page shares its left edge.
   - Cards in a row have equal height. Use CSS grid and subgrid so sibling chip
     and priority lines, titles, descriptions, metrics, proof rows and actions
     share rows. Pin actions to the bottom; never truncate text for alignment.
     Empty sections still collapse under rule 5 instead of stretching blank space.
   - Number and label rows use a fixed-width number column and the same first-line
     baseline. Labels wrap under themselves. Corresponding rows start at the same
     height across sibling cards.
   - Use tabular figures everywhere. Right-align numeric table cells and headers;
     left-align text. Basis and Label columns have fixed widths and centred chips.
   - Metric tiles have equal heights and shared label, value and note rows, with
     values on one baseline.
   - Section titles and right-hand actions share a baseline. Action rows have
     centred controls with 44px target heights.
   - Use the spacing scale 4, 8, 12, 16, 24, 32px consistently: 16px from section
     title to content, 16px between cards and 24px between sections.
   - Left-align headings, labels and paragraphs. Centre only chips, badges,
     thumbnail empty states and reference-centred single-value cells.
   Check every screen at 1280px, 1440px and 1920px, in both workspaces.
