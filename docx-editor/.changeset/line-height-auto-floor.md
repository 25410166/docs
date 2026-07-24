---
'@casualoffice/docs': patch
---

Fix paragraph text overlapping itself when `w:spacing w:lineRule="auto"` specifies a multiplier below 1.0 (e.g. `w:line="170"` = 0.71x). The computed line box was smaller than the glyphs actually need, so consecutive lines visually collided instead of just sitting close together. Floors the computed line height at the font's natural single-line height, matching the floor already applied to empty paragraphs.
