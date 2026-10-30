# SEO preparation — review only

October 30, 2026. No merge, deployment, Google account/DNS change, tracking activation or article publication is authorized by this branch.

## Scope and coexistence

This branch owns dormant Search Console URL-prefix fallback and GA4 preparation. The existing website chat owns the journal editor/template in its separate checkout; do not replace that build. Both supplied article bodies are prepared privately outside this public repository, using that owner's renderer/schema. No unpublished body or source attachment is committed here.

Public production home/product/About have already been made indexable independently of GitHub main. Main still contains stale sitewide noindex. This branch deliberately leaves every existing HTML head unchanged and makes no indexing edits. **Do not deploy a complete build from this old snapshot:** reconcile the current production indexability changes into the eventual release, retaining private/ops/cart/payment/newsletter exclusions. A successful build is not permission to deploy.

## Search Console

First inspect the correct Google account's existing property list, property type, verification status and authorized users. Public DNS/meta absence is not conclusive evidence of no property. Reuse an existing suitable property.

Preferred route: DNS-verified Domain property using the Google-issued TXT value and separately approved DNS operator/change. This requires no site code. Preserve existing records.

Alternative only after founder route decision: `GSC_VERIFICATION` contains the URL-prefix verification token. Empty/unset default means no tag. Middleware adds exactly one valid token to the homepage only and preserves existing SEO metadata and robots settings. A preexisting verification tag is never replaced automatically. Local fixture test is not Google verification. No Cloudflare variable has been set.

## Inactive GA4 gates

No values are added to wrangler.toml or production. The same-origin config endpoint defaults to disabled/test:

| Variable | Default | Requirement before use |
|---|---|---|
| `GA4_MEASUREMENT_ID` | empty | Existing approved stream ID; not a reporting credential |
| `GA4_ACTIVATION_APPROVED` | false | Explicit activation/deployment decision |
| `GA4_CONSENT_APPROVED` | false | Explicit tool/privacy/consent implementation decision |
| `GA4_INTERNAL_TRAFFIC` | false | Set true for an approved internal-only test environment |

All gates, plus affirmative visitor consent, must pass. No Google loader or cookieless ping before consent. An approved consent UI must call `window.FavroeAnalytics.setConsent(true)` on each eligible page. This branch does not invent a consent policy, install a CMP or infer consent from browsing. Denial revokes collection for that page; re-consent after withdrawal requires a fresh page load. Advertising storage/signals/personalization stay denied/disabled.

Loopback and Pages preview hosts are internally excluded. Browser opt-out/internal flag `favroe-analytics-internal=true` excludes a device. This is not a claim that every employee/device is identifiable: the founder must select a real internal-traffic policy and property filter. Review GA4 enhanced-measurement automatic interactions/pageviews and configure them explicitly in the authorized test property; code-level event settings do not audit account-level injection or collection.

## Event contract

- `view_item`: eligible pink product selection at approved-consent boot.
- `add_to_cart`: successful local bag addition; item key, pack price and pack quantity only.
- `begin_checkout`: valid Stripe response immediately before redirect, not on a failed attempt.
- `quote_submit`: after `/api/inquiries` confirmed success; only fixed form identifier, no names/email/free text/reference.
- `wholesale_view`: eligible wholesale page after consent.
- `purchase`: read-only `/api/analytics-purchase` returns only a minimal projection of an existing webhook-verified, paid live order. No test/refunded/held record, browser total or return-page visit becomes revenue. Value excludes tax/shipping; those are separate fields. Pack identities/quantities are preserved. No customer/address/email fields returned.

Ecommerce is suppressed while `FAVROE_PAYMENT_MODE` is test. Unit fixtures exercise synthetic live payloads locally without contacting Google/Stripe. Test purchases/quotes for future DebugView must use an authorized separate test property/isolated environment; production-property exclusions and no real charge must be evidenced before testing. No existing live-checkout gate is changed.

Client purchase deduplication persists the transaction ID before queueing the event; GA4 also receives that ID. Storage unavailable means fail closed. This prevents same-browser refresh duplicates but is not exactly-once delivery or cross-device attribution. Ad blockers, declined consent, abandoned return navigation or delayed webhook records can prevent a browser event. Existing verified order data remains the commercial truth. A server-side reporting/attribution project is not included.

The page URL sent to Google omits query and fragment (including Stripe session IDs); referrer is origin only. No form content, email, address, request note or authentication data is collected by these event hooks.

## Reporting dependency and release work

Existing destination is `/ops/`, not another dashboard. Reporting requires authorized GA4 property access, Search Console property/report access and an approved server-side connection/data contract to existing orders/inquiries. Measurement ID and ordinary ops sign-in are insufficient. No reporting connection/account grant was created.

Before any separately approved deployment: integrate with the journal owner's latest source, reconcile production/main indexing drift, regenerate cache-busting versions for changed `app.js`/`commerce.js` references in the release (metadata stays unchanged), approve consent UI/internal policy, test appropriate isolated fixtures and review the final narrow diff. The current branch changes neither HTML nor shared account bindings/configuration.

## Validation / remaining evidence

Local tests cover disabled defaults, consent/internal/test suppression, field filtering, all event payloads, purchase deduplication, verified-order projection and homepage-only verification insertion. Existing commerce/newsletter suite is rerun. Wrangler Pages Functions compiles locally. Default settings contact no Google endpoint. **GA4 DebugView remains blocked** until authorized test-property access and testing/consent scope are supplied. No DebugView, Google verification, all-production-routes HTTP pass or live activation is claimed.

Primary references consulted:
- https://support.google.com/webmasters/answer/9008080
- https://developers.google.com/tag-platform/security/guides/consent
- https://developers.google.com/analytics/devguides/collection/ga4/views
