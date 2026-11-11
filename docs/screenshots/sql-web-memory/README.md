# Bounded web reads: browser fixtures

These screenshots use fictional real-workspace-shaped fixtures, not production
records. All provider calls are blocked. Existing reference layouts are preserved.
The Data sources memory warning deliberately simulates 85% heap utilisation.

| Screen | Screenshot | Verified |
| --- | --- | --- |
| Creatives | [1440px](creatives-1440.png) | Full count, bounded page and coverage |
| Creatives, next page | [1440px](creatives-pagination-1440.png) | Different IDs, browser Back restores first page |
| Home | [1440px](home-1440.png) | Full-workspace totals and SQL top ads |
| Winners | [1440px](winners-1440.png) | Preview filter changes the full count before paging |
| Data sources | [1440px](data-sources-1440.png), [390px](data-sources-390.png) | Full coverage, heap usage and 80% warning |

Browser checks found no page errors or horizontal overflow at 390px. The separate
50,000-ad Postgres/HTTP fixture peaked at 116,319,648 bytes of web heap. Neither
fixture proves live provider coverage or production memory usage.
