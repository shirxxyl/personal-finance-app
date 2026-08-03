// ============ Data layer: IndexedDB wrapper + recurring-item engine ============
const DB_NAME = 'financeLedgerDB';
const DB_VERSION = 1;
let dbInstance = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) return resolve(dbInstance);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('categories')) {
        db.createObjectStore('categories', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('recurringItems')) {
        db.createObjectStore('recurringItems', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('transactions')) {
        const store = db.createObjectStore('transactions', { keyPath: 'id' });
        store.createIndex('date', 'date', { unique: false });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = (e) => { dbInstance = e.target.result; resolve(dbInstance); };
    req.onerror = (e) => reject(e.target.error);
  });
}

function tx(storeName, mode) {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function getAll(storeName) {
  return tx(storeName, 'readonly').then((store) => new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

function put(storeName, value) {
  return tx(storeName, 'readwrite').then((store) => new Promise((resolve, reject) => {
    const req = store.put(value);
    req.onsuccess = () => resolve(value);
    req.onerror = () => reject(req.error);
  }));
}

function del(storeName, id) {
  return tx(storeName, 'readwrite').then((store) => new Promise((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  }));
}

function getMeta(key) {
  return tx('meta', 'readonly').then((store) => new Promise((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : null);
    req.onerror = () => reject(req.error);
  }));
}

function setMeta(key, value) {
  return put('meta', { key, value });
}

// ---------- helpers ----------
const uid = (p) => p + '_' + Math.random().toString(36).slice(2, 9);
const todayISO = () => new Date().toISOString().slice(0, 10);
const currentMonth = () => todayISO().slice(0, 7);
const monthOf = (dateStr) => dateStr.slice(0, 7);

// ---------- seed categories ----------
// Categories are plain organizational nodes: a name, and (for expense/saving) a monthly budget.
// Whether a given dollar is one-time or recurring is chosen per-entry in the Add Entry form —
// it's not a property of the category. "Fixed Income" and "Extra Income" remain as two income
// categories for organization, but both can hold one-time or recurring entries equally.
const SEED_CATEGORIES = [
  { id: 'exp', name: 'Expenses', level: 1, parentId: null, type: 'expense', budget: null },
  { id: 'exp-groceries', name: 'Groceries', level: 2, parentId: 'exp', type: 'expense', budget: null },
  { id: 'exp-dining', name: 'Dining Out', level: 2, parentId: 'exp', type: 'expense', budget: null },
  { id: 'exp-shopping', name: 'Shopping', level: 2, parentId: 'exp', type: 'expense', budget: null },
  { id: 'exp-house', name: 'House Appliance', level: 2, parentId: 'exp', type: 'expense', budget: null },
  { id: 'exp-personal', name: 'Personal Care', level: 2, parentId: 'exp', type: 'expense', budget: null },
  { id: 'exp-entertainment', name: 'Entertainment', level: 2, parentId: 'exp', type: 'expense', budget: null },
  { id: 'exp-travel', name: 'Travel', level: 2, parentId: 'exp', type: 'expense', budget: null },
  { id: 'exp-transportation', name: 'Transportation', level: 2, parentId: 'exp', type: 'expense', budget: null },
  { id: 'exp-gifts', name: 'Gifts', level: 2, parentId: 'exp', type: 'expense', budget: null },
  { id: 'exp-utilities', name: 'Utilities', level: 2, parentId: 'exp', type: 'expense', budget: null },
  { id: 'exp-pet', name: 'Pet', level: 2, parentId: 'exp', type: 'expense', budget: null },

  { id: 'sav', name: 'Savings', level: 1, parentId: null, type: 'saving', budget: null },
  { id: 'sav-emergency', name: 'Emergency Fund', level: 2, parentId: 'sav', type: 'saving', budget: null },
  { id: 'sav-invest', name: 'Investment', level: 2, parentId: 'sav', type: 'saving', budget: null },
  { id: 'sav-retire', name: 'Retirement', level: 2, parentId: 'sav', type: 'saving', budget: null },

  { id: 'inc', name: 'Income', level: 1, parentId: null, type: 'income', budget: null },
  { id: 'inc-fixed', name: 'Fixed Income', level: 2, parentId: 'inc', type: 'income', budget: null },
  { id: 'inc-extra', name: 'Extra Income', level: 2, parentId: 'inc', type: 'income', budget: null },

  { id: 'debt', name: 'Debt', level: 1, parentId: null, type: 'debt', budget: null },
  { id: 'debt-mortgage', name: 'Mortgage', level: 2, parentId: 'debt', type: 'debt', budget: null },
  { id: 'debt-car', name: 'Car Loan', level: 2, parentId: 'debt', type: 'debt', budget: null },
  { id: 'debt-student', name: 'Student Loan', level: 2, parentId: 'debt', type: 'debt', budget: null },
  { id: 'debt-other', name: 'Other Debt', level: 2, parentId: 'debt', type: 'debt', budget: null },
];

// Idempotent migration: adds the Debt root + starter subcategories for browsers that were
// already seeded before Debt existed. Safe to call every time — no-ops if 'debt' is already there.
async function ensureDebtRoot() {
  const existing = await getAll('categories');
  if (existing.some(c => c.id === 'debt')) return;
  const debtSeed = SEED_CATEGORIES.filter(c => c.id === 'debt' || c.parentId === 'debt');
  for (const c of debtSeed) await put('categories', c);
}

// Schema version bump: category records no longer carry a "recurring" flag — recurring vs.
// one-time is now chosen per-entry, not per-category. Existing categories just keep an unused
// field if they have one; no reset needed for this change.
const SCHEMA_KEY = 'seeded_v2_en';

async function ensureSeeded() {
  const done = await getMeta(SCHEMA_KEY);
  if (done) return;
  for (const storeName of ['categories', 'recurringItems', 'transactions']) {
    const all = await getAll(storeName);
    for (const rec of all) await del(storeName, rec.id);
  }
  for (const c of SEED_CATEGORIES) await put('categories', c);
  await setMeta(SCHEMA_KEY, true);
}

// ---------- category tree helpers ----------
async function getCategories() { return getAll('categories'); }

function buildIndex(categories) {
  const byId = {}; categories.forEach(c => byId[c.id] = c);
  return byId;
}

function children(categories, parentId) {
  return categories.filter(c => c.parentId === parentId);
}

function isLeaf(categories, id) {
  return children(categories, id).length === 0;
}

function ancestors(categories, id) {
  const byId = buildIndex(categories);
  const chain = [];
  let c = byId[id];
  while (c) { chain.unshift(c); c = c.parentId ? byId[c.parentId] : null; }
  return chain;
}

function catPath(categories, id) {
  return ancestors(categories, id).map(c => c.name).join(' / ');
}

function leafDescendants(categories, id) {
  const kids = children(categories, id);
  if (kids.length === 0) return [id];
  return kids.flatMap(k => leafDescendants(categories, k.id));
}

// ---------- recurring-item engine ----------
// item.history: [{month:'YYYY-MM', amount}] ascending by month
// item.overrides: {'YYYY-MM': amount} — income items only
// item.endMonth: 'YYYY-MM' | null — the month this item stopped (inclusive), history before it is kept
function amountForMonth(item, month) {
  if (item.endMonth && month >= item.endMonth) return 0;
  if (item.overrides && item.overrides[month] !== undefined) return item.overrides[month];
  const history = (item.history || []).filter(h => h.month <= month);
  if (history.length === 0) return 0;
  history.sort((a, b) => a.month.localeCompare(b.month));
  return history[history.length - 1].amount;
}

function daysInMonth(month) {
  return new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
}

// The actual billing date for this item in a given month (capped to the last day of short months).
function billingDateForMonth(item, month) {
  const day = Math.min(Math.max(item.dayOfMonth || 1, 1), daysInMonth(month));
  return `${month}-${String(day).padStart(2, '0')}`;
}

// Whether this month's charge/deposit has already happened as of today.
function hasOccurred(item, month, todayStr) {
  return billingDateForMonth(item, month) <= todayStr;
}

async function getRecurringItems() { return getAll('recurringItems'); }

async function getRecurringItemsByCategory(categoryId) {
  const all = await getRecurringItems();
  return all.filter(i => i.categoryId === categoryId);
}

async function recurringSpentForSubtree(categories, catId, month) {
  const ids = new Set(leafDescendants(categories, catId));
  const items = await getRecurringItems();
  return items.filter(i => ids.has(i.categoryId))
    .reduce((s, i) => s + amountForMonth(i, month), 0);
}

// ---------- transaction helpers ----------
async function getTransactions() { return getAll('transactions'); }

async function transactionsForMonth(month) {
  const all = await getTransactions();
  return all.filter(t => monthOf(t.date) === month);
}

async function txSpentForSubtree(categories, catId, month) {
  const ids = new Set(leafDescendants(categories, catId));
  const all = await transactionsForMonth(month);
  return all.filter(t => ids.has(t.categoryId)).reduce((s, t) => s + t.amount, 0);
}

async function subtreeActual(categories, catId, month) {
  const [rec, txs] = await Promise.all([
    recurringSpentForSubtree(categories, catId, month),
    txSpentForSubtree(categories, catId, month)
  ]);
  return rec + txs;
}

function subtreeBudget(categories, catId) {
  const kids = children(categories, catId);
  if (kids.length === 0) {
    const byId = buildIndex(categories);
    return byId[catId].budget || 0;
  }
  return kids.reduce((s, k) => s + subtreeBudget(categories, k.id), 0);
}

window.LedgerDB = {
  openDB, getAll, put, del, getMeta, setMeta,
  uid, todayISO, currentMonth, monthOf,
  ensureSeeded, ensureDebtRoot, getCategories, buildIndex, children, isLeaf, ancestors, catPath,
  leafDescendants,
  amountForMonth, daysInMonth, billingDateForMonth, hasOccurred,
  getRecurringItems, getRecurringItemsByCategory,
  recurringSpentForSubtree, getTransactions, transactionsForMonth, txSpentForSubtree,
  subtreeActual, subtreeBudget
};
