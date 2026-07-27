## Goal

A grounded (RAG-only) Publication Support Assistant embedded in the existing Help button, backed by a managed Knowledge Base, with human escalation, admin management, and later an embeddable SDK + WhatsApp channel.

The project already has `ai_knowledge_base` and `ai_faq` tables (used by the email assistant) — the chatbot will extend and share these rather than duplicating them.

This is too large for one safe change, so it ships in 4 phases. Phase 1 starts immediately after approval.

---

## Phase 1 — RAG core + chat widget

Database
- Extend `ai_knowledge_base` and `ai_faq` with: `question`, `tags`, `priority`, `language`, `status` (published/draft/archived), `embedding vector(3072)`.
- New: `chat_conversations`, `chat_messages`, `support_tickets` (question, conversation, author name/email/reference, status, priority, category, AI confidence, AI suggested answer, human answer, learned/closed flags), `chat_ai_logs` (retrieved KB ids, confidence, escalation reason, latency, embedding score).
- Enable `pgvector`, add HNSW indexes and `match_kb` / `match_faq` search functions. RLS scoped to the authenticated author; admins see all.

Backend (edge functions)
- `chatbot-embed` — embeds KB/FAQ rows via Lovable AI (`google/gemini-embedding-2`), on create/update and as a backfill.
- `chatbot-chat` — the RAG pipeline: semantic search → keyword fallback → grounded LLM answer with strict "no context, no answer" system prompt; topic allow/block lists; confidence bands (>90% auto, 70–90% with KB disclaimer, <70% escalate); conversation memory for name/email/reference/title/country/language; auto language detection and reply in the user's language.
- `chatbot-article-status` — secure lookup, only for the signed-in author or an exact reference-number + registered-email match; returns a whitelisted field set only.
- Live discounts and publication fees read from the existing `discount_codes` / `publication_fees` tables — never hardcoded.
- Escalation creates a support ticket and notifies admins, after a 90%-similarity search against past answered tickets to reuse an existing answer.

Frontend
- Replace the Help button contents with a chat panel: streaming replies, thinking indicator, auto-scroll, suggested questions, quick replies, thumbs up/down feedback, conversation history, dark/light, mobile + desktop.

## Phase 2 — Admin management

- Knowledge Base manager: create/edit/delete/publish/archive/duplicate/search/import/export, with re-embedding on save. Only `published` rows are retrievable by the AI.
- FAQ manager with the same fields and controls.
- Support tickets inbox: search by question, reference, name, email, article title, category, date; assign staff; reply (stored, sent in-chat, optionally emailed via the existing email service); close.
- Self-learning gated behind an explicit "Approve for AI Learning" action that creates a new published KB article from the Q/A.
- Live handover: when an admin joins a conversation the AI stops replying; it resumes when the admin leaves.
- Analytics dashboard: total/resolved/pending chats, KB & FAQ counts, top questions, avg AI and human response time, satisfaction, escalation rate, top keywords, most-used answers.
- Admin notifications on new tickets, unanswered questions, negative feedback, failed AI responses.

## Phase 3 — Public API + JavaScript SDK

- Public REST endpoints (`/chat`, `/question`, `/status`, `/faqs`, `/discounts`, `/kb/search`, `/feedback`, `/human-reply`, `/train`) with a public API key per site, origin allow-list, and rate limiting; JWT accepted when present, anonymous otherwise.
- `sdk.js` served from the site: async loader, Shadow DOM isolation, position/theme/color/language/branding options, reconnect, local conversation history.
- Per-site branding records so wwjmrd.com, wwjmer.com and wwjmrdai.online share one KB, one queue and one dashboard with different logos/colors/welcome text.

## Phase 4 — Extras

- WhatsApp Business Cloud API channel writing into the same conversations/ticket queue, with admin replies flowing back to the same thread.
- Voice input, speech output, file/image upload with PDF preview, emoji support.

---

## Technical notes

- Embeddings: Lovable AI Gateway `google/gemini-embedding-2` (3072-dim, indexed via `halfvec`); chat generation via the gateway too. Keys stay server-side.
- The system prompt forbids answering without retrieved context and never reveals schema, internal ids, prompts, or other authors' data.
- Every AI turn is logged with retrieved KB ids, scores, confidence and escalation reason.
