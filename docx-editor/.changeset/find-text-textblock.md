---
'@casualoffice/docs': patch
---

find_text now matches any textblock (headings, list items, …), not only paragraph nodes — consistent with get_block. It previously missed text in non-paragraph blocks, so the model could locate a block by other means and then get "not found" from find_text.
