# NexaSystemsStudio / Gridworth Tools — Etsy Growth Plan

Updated: 2026-09-16

## Objective
Increase qualified Etsy impressions, clicks, favorites and first/next sales before expanding the catalog further.

## Current operating rule
Do not scale more near-identical listings until existing listings are measured and optimized. Prioritize conversion and discoverability on the current catalog.

## Listing optimization checklist
For every active listing:
1. Lead the title with the exact buyer-intent phrase; keep it natural and preferably under ~15 words.
2. First image must communicate niche + outcome in under 2 seconds on mobile.
3. Use multiple listing images: outcome/benefit, spreadsheet/dashboard preview, included files/features, how-it-works, use case, compatibility, instant-download explanation.
4. Add accurate descriptive alt text to listing images.
5. First description sentence must clearly say what the buyer receives and who it is for.
6. Cover relevant long-tail buyer intents across tags/attributes without keyword stuffing.
7. Verify digital files, image quality, price, shop policies and listing state.
8. Add a short product/demo video where feasible.

## Priority niches for iteration
Start with products already showing stronger historical search visibility: Mobile Detailing, Photography, Lawn Care and Handyman. Use these to test higher-CTR thumbnails/titles. Separately repair weak-discovery listings: Pressure Washing, Cleaning, Painting, Dog Grooming, Personal Trainer and Pet Care.

## Distribution
- Pinterest: niche-specific, keyword-led pins linking directly to the matching Etsy listing; create multiple distinct creative angles rather than reposting one cover.
- Instagram: move away from pure product ads. Use problem-first carousels/reels: pain point -> consequence -> tool/demo -> result -> CTA.
- Link directly to the relevant listing rather than a generic storefront where possible.

## Measurement
Track daily per listing when available: Etsy views, favorites, orders/revenue; social impressions/reach, saves, pin clicks and outbound clicks. Classify each listing as gaining, flat or declining against the previous snapshot.

## Decision rules
- Impressions but low clicks: replace/iterate thumbnail and title.
- Clicks/views but no favorites or orders: improve offer, proof, product previews, description and price/value framing.
- No impressions: rework keyword intent/tags/category/attributes and distribute externally.
- A listing produces favorites/orders: preserve the winning intent and create adjacent creative/keyword tests rather than rewriting everything.

## Technical backlog for Nexi Etsy API
1. Keep authenticated listing/shop reads and write safeguards healthy.
2. Add a normalized audit endpoint/report that returns listing id, state, title, price, tags, image count, file count and obvious completeness warnings.
3. Add snapshot persistence for daily listing metadata so changes can be compared over time.
4. Add receipt/order metrics only through Etsy-supported authenticated endpoints/scopes; do not scrape Etsy.
5. Expose a concise growth report endpoint combining listing audit + supported order data.

Do not store secrets, OAuth tokens or internal bearer keys in the repository.