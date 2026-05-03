# Elite Travel & Sports Tours USA — master cleanup checklist

This checklist is staged work: keep **structure approvals first**, then run **cleanup passes**.

## Locked rules (sitewide)

### Global Unique Image Pass (non-negotiable)

Run once **after internal page structures are approved**. Do **not** fix images one‑by‑one in isolation.

Goals:

1. **Uniqueness**: every significant photographic image remains **unique across the entire site**.
   - Repeat background textures/gradients are fine.
   - Do not reuse the same obvious stock hero/editorial/card treatment image in multiple contexts.
   - Treat “duplicate” by **same source photo**, even when referenced at different widths/crops/parameters.

2. **Context**: each page’s imagery must match intent (not merely “looks premium”).
   - **About**: brand authority / premium travel / selective sport posture
   - **Experiences**: active journey moments / play / destinations / courts
   - **Destinations**: location-rich scenery where possible
   - **Process**: planning / movement / transitions / elegant operational atmosphere
   - **Concierge**: service / logistics / hospitality / premium interiors details
   - **Plan a Journey**: calm inquiry / understated luxury / quiet refinement

Procedure:

1. Export a **full inventory** of photographic URLs/assets used in `styles.css`, page HTML, and `assets/` references.
2. Cluster duplicates → replace with distinct images aligned to category rules above.
3. Re-scan until **no unintended duplicates remain** (hero, split panels, editorial bands, card families).
