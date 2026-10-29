/* Public configuration. Never put passwords, payment secrets or API tokens here.
   Stripe is the authority for final prices, stock, shipping, tax and payment. */
window.FAVROE_COMMERCE = {
  currency: 'USD',
  checkout: { enabled: true, endpoint: 'api/checkout' },
  finishes: {
    pink: { label: 'Pink', image: 'assets/pink-container-set.webp', selectable: true, stockConfirmed: true },
    aluminum: { label: 'Aluminum', image: 'assets/packaging-v3.webp', selectable: false, stockConfirmed: false }
  },
  packs: [
    { sets: 50, name: 'Discovery 50', cents: 1999 },
    { sets: 100, name: 'Starter 100', cents: 3499 },
    { sets: 200, name: 'Wholesale 200', cents: 6499 },
    { sets: 400, name: 'Volume 400', cents: 11999 }
  ],
  // Public selection flags only. Stripe Price IDs are configured on the server.
  variants: {
    'pink-50': { saleEnabled: true },
    'pink-100': { saleEnabled: true },
    'pink-200': { saleEnabled: true },
    'pink-400': { saleEnabled: true },
    'aluminum-50': { saleEnabled: false },
    'aluminum-100': { saleEnabled: false },
    'aluminum-200': { saleEnabled: false },
    'aluminum-400': { saleEnabled: false }
  },
  customization: { mode: 'quote-only', proposedSetupCents: 30000, scopeApproved: false }
};
