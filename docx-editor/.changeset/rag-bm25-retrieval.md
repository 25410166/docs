---
'@eigenpal/docx-js-editor': minor
---

Add local-first RAG: a BM25 retrieval layer and a `search_document` tool that returns the passages most relevant to a query (with their blockIds). `get_doc_stats` no longer dumps the full document text, which previously overflowed the local model's context on long documents and silently truncated summaries.
