/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import type { DocOpsTool } from './types';

/**
 * Phase 0 tool catalog — 5 read tools + 2 write tools.
 * Sent verbatim to the Anthropic messages API as the `tools` array.
 */
export const DOCOPS_CATALOG: DocOpsTool[] = [
  {
    name: 'get_outline',
    description:
      'Returns the document heading tree. Call this first to orient yourself before making structural changes.',
    input_schema: {
      type: 'object',
      properties: {
        maxDepth: {
          type: 'number',
          description: 'Maximum heading depth to include (1–9). Defaults to 6.',
        },
      },
    },
  },
  {
    name: 'get_selection',
    description:
      'Returns information about the current editor selection: text content, block IDs, and character count.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_doc_stats',
    description:
      'Returns document statistics: word count, paragraph count, table count, image count, and heading levels used.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_styles',
    description: 'Lists paragraph styles and fonts used in the document, sorted by frequency.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'find_text',
    description:
      'Search for text in the document. Returns matching block IDs and surrounding snippets.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The text to search for (case-insensitive).',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return. Defaults to 10.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'convert_range_to_table',
    description:
      'Converts the current editor selection (tab- or comma-delimited paragraphs) into a table. The user must have the relevant text selected first.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'insert_toc',
    description:
      "Inserts a Table of Contents at the cursor position, built from the document's heading structure.",
    input_schema: {
      type: 'object',
      properties: {},
    },
  },

  // ── Phase 1: mutation tools (suggestion / tracked-change path) ────────────
  {
    name: 'suggest_text_change',
    description:
      "Suggest a text change in a paragraph as a tracked change — the user sees a diff in the sidebar and can Accept or Reject it. Pass search='' to insert text at the end of the paragraph; pass replaceWith='' to delete the matched text.",
    input_schema: {
      type: 'object',
      properties: {
        paraId: {
          type: 'string',
          description: 'Stable block ID of the paragraph (from get_outline or find_text).',
        },
        search: {
          type: 'string',
          description:
            "Exact text to replace (case-sensitive). Use '' to append to the paragraph end.",
        },
        replaceWith: {
          type: 'string',
          description: "Replacement text. Use '' to delete the matched text.",
        },
      },
      required: ['paraId', 'search', 'replaceWith'],
    },
  },
  {
    name: 'set_paragraph_style',
    description:
      "Apply a paragraph style to a block. Use this to set heading levels, list styles, etc. Common styleIds: 'Heading1'–'Heading6', 'Normal', 'ListParagraph', 'Quote'. Call list_styles first to see styles actually present in this document.",
    input_schema: {
      type: 'object',
      properties: {
        paraId: {
          type: 'string',
          description: 'Stable block ID of the paragraph.',
        },
        styleId: {
          type: 'string',
          description:
            "Paragraph style ID. Examples: 'Heading1', 'Heading2', 'Normal', 'ListParagraph'.",
        },
      },
      required: ['paraId', 'styleId'],
    },
  },
  {
    name: 'add_comment',
    description:
      'Add a review comment anchored to a paragraph (optionally to a specific phrase within it). The comment appears in the comments sidebar.',
    input_schema: {
      type: 'object',
      properties: {
        paraId: {
          type: 'string',
          description: 'Stable block ID of the paragraph.',
        },
        text: {
          type: 'string',
          description: 'The comment text.',
        },
        search: {
          type: 'string',
          description:
            'Optional: a unique phrase in the paragraph to anchor the comment to. Omit to anchor to the whole paragraph.',
        },
      },
      required: ['paraId', 'text'],
    },
  },
];
