# Project Architecture Rules

- Preserve semantic inline scientific markup (`sub`, `sup`, and equation spans) throughout formatting, pagination, preview, and export because flattening paragraph text corrupts manuscripts.
- Re-format requests explicitly bypass the completed-format idempotency guard, while automatic formatting remains idempotent to prevent duplicate jobs.