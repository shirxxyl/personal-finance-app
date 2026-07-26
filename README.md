# Ledger · Personal Finance Tracker

## What's in this version

- Flat expense categories: Groceries, Dining Out, Shopping, House Appliance, Personal Care,
  Entertainment, Travel, Transportation, Gifts, Utilities, Pet. Every one of them supports both
  one-time entries and recurring items — no need to choose one or the other.
- Savings categories: Emergency Fund, Investment, Retirement.
- Income: Fixed Income (recurring items — paycheck, etc.) and Extra Income (one-time entries).
- Recurring items: template amount with history (past months keep their old amount when you
  change the template), a billing day of month, and — for income only — a single-month override
  that doesn't touch the template.
- Home dashboard: net balance, budget remaining, savings progress, this month's recurring bills
  (occurred vs. upcoming), expense/income breakdowns, and recent transactions.
- Charts: spending breakdown, daily trend, 6-month income vs. expense.
- Bill splitting: enter a total amount and number of people, the app records your share.
- All data lives in your browser's local IndexedDB — nothing is sent anywhere.

## Testing it locally

**Quickest way**: just double-click `index.html` to open it in your browser.
IndexedDB works fine this way, so your data saves normally. Two caveats with the plain-file
approach:
- The Service Worker (offline caching) won't register, so you need an internet connection the
  first time to load the chart library and fonts.
- "Add to Home Screen" won't give you the full app-like experience.

**Closer to the real thing**: serve the folder locally and open it from your phone:
```
cd finance-app
python3 -m http.server 8000
```
Then, with your phone on the same Wi-Fi, open `http://<your-computer's-LAN-IP>:8000` in Safari.

Getting the real installable, offline-capable version onto your home screen still needs the
GitHub Pages hosting step we discussed — happy to walk through that whenever you're ready.

## Heads-up: this version reset your data

The category structure changed from a nested, Chinese taxonomy to the flat English one above —
there's no clean way to map the old test categories onto the new ones, so opening this version
performs a one-time reset (categories, transactions, and recurring items all start fresh). This
only happens once per browser profile.

## Still rough around the edges

- Visual styling is still a first pass — colors/type/spacing can be refined further
- Category management is function-first; the interaction polish can improve
- Recurring items and category-budget editing use plain form controls for now
