(function () {
  const D = window.LedgerDB;
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => '$' + (Math.round((n + Number.EPSILON) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtShort = (n) => '$' + Math.round(n).toLocaleString('en-US');

  let categories = [];
  let recurringItems = [];
  let transactions = [];
  let month = D.currentMonth();
  let year = D.currentMonth().slice(0, 4);
  let chartRange = 'monthly';
  let pieChart = null, trendChart = null, spendingSummaryChart = null, incomeBreakdownChart = null, yearlyBudgetChart = null, yearlyTrendChart = null;

  // Small hand-drawn outline icons — used instead of emoji so the app looks the
  // same on every platform. `color` accepts any CSS color value, including var(--x).
  function icon(name, opts) {
    const size = (opts && opts.size) || 14;
    const color = (opts && opts.color) || 'currentColor';
    const attrs = `width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" style="vertical-align:-2px;" aria-hidden="true"`;
    const paths = {
      check: `<circle cx="12" cy="12" r="9" stroke="${color}" stroke-width="1.6"/><path d="M8 12.5l2.7 2.7L16 9.5" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`,
      clock: `<circle cx="12" cy="12" r="9" stroke="${color}" stroke-width="1.6"/><path d="M12 7.5v5l3.2 2" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`,
      refresh: `<path d="M4 4v5h5" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 20v-5h-5" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.5 9a7 7 0 0 1 12-3.5L20 8" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M18.5 15a7 7 0 0 1-12 3.5L4 16" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`,
      repeat: `<path d="M17 2l4 4-4 4" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 11V9a4 4 0 0 1 4-4h14" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 22l-4-4 4-4" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 13v2a4 4 0 0 1-4 4H3" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`
    };
    return `<svg ${attrs}>${paths[name] || ''}</svg>`;
  }

  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._h); toast._h = setTimeout(() => t.classList.remove('show'), 1800);
  }

  async function reloadData() {
    [categories, recurringItems, transactions] = await Promise.all([
      D.getCategories(), D.getRecurringItems(), D.getTransactions()
    ]);
  }

  // ---------- local sync aggregation (works off in-memory arrays) ----------
  function leafDescendants(catId) { return D.leafDescendants(categories, catId); }
  function isLeaf(catId) { return D.isLeaf(categories, catId); }
  function children(catId) { return D.children(categories, catId); }
  function byId(id) { return D.buildIndex(categories)[id]; }
  function catPath(id) { return D.catPath(categories, id); }
  function rootType(catId) { return D.ancestors(categories, catId)[0].type; }

  function recurringSpentForSubtree(catId, m) {
    const ids = new Set(leafDescendants(catId));
    return recurringItems.filter(i => ids.has(i.categoryId)).reduce((s, i) => s + D.amountForMonth(i, m), 0);
  }
  function txSpentForSubtree(catId, m) {
    const ids = new Set(leafDescendants(catId));
    return transactions.filter(t => D.monthOf(t.date) === m && ids.has(t.categoryId)).reduce((s, t) => s + t.amount, 0);
  }
  function subtreeActual(catId, m) { return recurringSpentForSubtree(catId, m) + txSpentForSubtree(catId, m); }
  function subtreeBudget(catId) { return D.subtreeBudget(categories, catId); }

  // ---------- budget rollover ----------
  function prevMonthOf(m) {
    const [y, mm] = m.split('-').map(Number);
    return new Date(y, mm - 2, 1).toISOString().slice(0, 7);
  }
  function monthsBetweenInclusive(start, end) {
    if (start > end) return [];
    const months = [];
    let [y, m] = start.split('-').map(Number);
    const [ey, em] = end.split('-').map(Number);
    while (y < ey || (y === ey && m <= em)) {
      months.push(`${y}-${String(m).padStart(2, '0')}`);
      m++; if (m > 12) { m = 1; y++; }
    }
    return months;
  }
  // Cumulative budget remaining for a rollover-enabled leaf, from its rollover start month
  // through `uptoMonth` inclusive. Can go negative (a carried deficit). Returns null if
  // rollover isn't active for this category/month.
  function rolloverCumulativeRemaining(catId, uptoMonth) {
    const c = byId(catId);
    if (!c || !c.rollover || !c.rolloverStartMonth || uptoMonth < c.rolloverStartMonth) return null;
    const months = monthsBetweenInclusive(c.rolloverStartMonth, uptoMonth);
    const totalBudget = (c.budget || 0) * months.length;
    const totalSpent = months.reduce((s, mm) => s + subtreeActual(catId, mm), 0);
    return totalBudget - totalSpent;
  }
  // Budget remaining for any node (leaf or parent), rollover-aware where applicable.
  function remainingForNode(catId, m) {
    if (isLeaf(catId)) {
      const c = byId(catId);
      if (c && c.rollover && c.rolloverStartMonth && m >= c.rolloverStartMonth) {
        return rolloverCumulativeRemaining(catId, m);
      }
      return (c && c.budget || 0) - subtreeActual(catId, m);
    }
    return children(catId).reduce((s, k) => s + remainingForNode(k.id, m), 0);
  }

  // ---------- month options ----------
  function monthOptionsHTML(selected) {
    const months = [];
    const base = new Date(month + '-01T00:00:00');
    for (let i = 11; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      months.push(d.toISOString().slice(0, 7));
    }
    if (!months.includes(D.currentMonth())) months.push(D.currentMonth());
    return months.map(m => `<option value="${m}" ${m === selected ? 'selected' : ''}>${m}</option>`).join('');
  }
  function syncMonthSelects() {
    ['monthSelect', 'monthSelectChart', 'monthSelectTx'].forEach(id => {
      $(id).innerHTML = monthOptionsHTML(month);
    });
  }

  function syncYearSelect() {
    const curY = Number(D.currentMonth().slice(0, 4));
    const years = [];
    for (let y = curY; y >= curY - 5; y--) years.push(String(y));
    $('yearSelect').innerHTML = years.map(y => `<option value="${y}" ${y === year ? 'selected' : ''}>${y}</option>`).join('');
  }

  function populateDaySelects() {
    const opts = Array.from({ length: 31 }, (_, i) => i + 1).map(d => `<option value="${d}">Day ${d}</option>`).join('');
    document.querySelectorAll('select.day-select').forEach(sel => { sel.innerHTML = opts; });
  }

  // ============ HOME ============
  function renderHero() {
    const income = subtreeActual('inc', month);
    const expense = subtreeActual('exp', month);
    const debt = subtreeActual('debt', month);
    const net = income - expense - debt;
    $('heroNet').textContent = fmt(net);
    $('heroNet').className = 'value' + (net < 0 ? ' neg' : '');
    $('heroIncome').textContent = fmtShort(income);
    $('heroExpense').textContent = fmtShort(expense);
    $('heroDebt').textContent = fmtShort(debt);
  }

  function renderCards() {
    const budgetTotal = subtreeBudget('exp');
    const budgetSpent = subtreeActual('exp', month);
    const budgetLeft = remainingForNode('exp', month);
    $('cardBudgetLeft').textContent = fmt(budgetLeft);
    $('cardBudgetLeft').className = 'value' + (budgetLeft < 0 ? ' warn' : '');
    $('cardBudgetFoot').textContent = budgetTotal ? `Budget ${fmtShort(budgetTotal)} · ${((budgetSpent / budgetTotal) * 100 || 0).toFixed(0)}% used this month` : 'No budget set yet';

    const savBudget = subtreeBudget('sav');
    const savActual = subtreeActual('sav', month);
    $('cardSaving').textContent = fmt(savActual);
    $('cardSavingFoot').textContent = savBudget ? `Goal ${fmtShort(savBudget)} (${((savActual / savBudget) * 100 || 0).toFixed(0)}%)` : 'No goal set yet';
  }

  function catHasActiveRecurring(catId) {
    const ids = new Set(leafDescendants(catId));
    return recurringItems.some(i => ids.has(i.categoryId) && D.amountForMonth(i, month) > 0);
  }

  function catRowHTML(c, level, m) {
    const recurTag = catHasActiveRecurring(c.id) ? ' ' + icon('repeat', { color: 'var(--accent2)', size: 12 }) : '';
    const leaf = isLeaf(c.id);
    if (leaf && c.rollover && c.rolloverStartMonth && m >= c.rolloverStartMonth) {
      const spent = subtreeActual(c.id, m);
      const prevMonth = prevMonthOf(m);
      const carryIn = prevMonth >= c.rolloverStartMonth ? (rolloverCumulativeRemaining(c.id, prevMonth) || 0) : 0;
      const available = (c.budget || 0) + carryIn;
      const remainingAfter = available - spent;
      const pct = available > 0 ? Math.min(100, (spent / available) * 100) : 100;
      const over = remainingAfter < 0;
      const carryNote = carryIn !== 0 ? ` · ${carryIn > 0 ? '+' : ''}${fmtShort(carryIn)} carried in` : '';
      return `<div class="cat-row l${level}">
        <div class="name">${c.name}${recurTag} ${icon('refresh', { color: 'var(--gold)', size: 12 })}</div>
        <div class="bar-bg"><div class="bar-fill ${over ? 'over' : ''}" style="width:${pct}%"></div></div>
        <div class="amt">${fmtShort(spent)}/${fmtShort(available)}${carryNote}</div>
      </div>`;
    }
    const budget = subtreeBudget(c.id);
    const spent = subtreeActual(c.id, m);
    if (budget > 0) {
      const pct = Math.min(100, (spent / budget) * 100);
      const over = spent > budget;
      return `<div class="cat-row l${level}">
        <div class="name">${c.name}${recurTag}</div>
        <div class="bar-bg"><div class="bar-fill ${over ? 'over' : ''}" style="width:${pct}%"></div></div>
        <div class="amt">${fmtShort(spent)}/${fmtShort(budget)}</div>
      </div>`;
    }
    if (spent > 0) {
      return `<div class="cat-row l${level}">
        <div class="name">${c.name}${recurTag}</div>
        <div class="bar-bg" style="opacity:.25;"><div class="bar-fill" style="width:100%"></div></div>
        <div class="amt">${fmtShort(spent)} this month</div>
      </div>`;
    }
    return `<div class="cat-row l${level}">
      <div class="name">${c.name}${recurTag}</div>
      <div class="bar-bg" style="opacity:.15;"><div class="bar-fill" style="width:0%"></div></div>
      <div class="amt">—</div>
    </div>`;
  }

  function renderHomeCatList() {
    let html = '';
    function walk(parentId, level) {
      children(parentId).forEach(c => { html += catRowHTML(c, level, month); walk(c.id, level + 1); });
    }
    walk('exp', 2);
    $('homeCatList').innerHTML = html || '<div class="empty">No expense categories yet</div>';
  }

  function renderHomeIncomeList() {
    let html = '';
    function walk(parentId, level) {
      children(parentId).forEach(c => { html += catRowHTML(c, level, month); walk(c.id, level + 1); });
    }
    walk('inc', 2);
    $('homeIncomeList').innerHTML = html || '<div class="empty">No income categories yet</div>';
  }

  function renderHomeDebtList() {
    let html = '';
    function walk(parentId, level) {
      children(parentId).forEach(c => { html += catRowHTML(c, level, month); walk(c.id, level + 1); });
    }
    walk('debt', 2);
    $('homeDebtList').innerHTML = html || '<div class="empty">No debt categories yet</div>';
  }

  function renderHomeRecurringStatus() {
    const today = D.todayISO();
    const items = recurringItems
      .filter(i => D.amountForMonth(i, month) > 0)
      .map(i => ({ item: i, amt: D.amountForMonth(i, month), occurred: D.hasOccurred(i, month, today) }))
      .sort((a, b) => (a.item.dayOfMonth || 1) - (b.item.dayOfMonth || 1));
    if (!items.length) { $('homeRecurringStatus').innerHTML = '<div class="empty">No active recurring items this month — add one from the "＋" button</div>'; return; }
    $('homeRecurringStatus').innerHTML = items.map(({ item, amt, occurred }) => {
      const cat = byId(item.categoryId);
      const isIncome = cat && rootType(item.categoryId) === 'income';
      return `<div class="tx-item" data-recur="${item.id}">
        <div class="dot ${isIncome ? 'income' : ''}"></div>
        <div class="info">
          <div class="cat">${occurred ? icon('check', { color: 'var(--sage)' }) : icon('clock', { color: 'var(--muted)' })} ${item.name}</div>
          <div class="meta">Day ${item.dayOfMonth || 1} · ${cat ? catPath(item.categoryId) : ''}</div>
        </div>
        <div class="amt ${isIncome ? 'income' : ''}">${isIncome ? '+' : '−'}${fmtShort(amt)}</div>
      </div>`;
    }).join('');
  }

  function renderHomeRecent() {
    const list = transactions.filter(t => D.monthOf(t.date) === month).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, 5);
    $('homeRecentList').innerHTML = list.length ? list.map(txItemHTML).join('') +
      `<div style="text-align:center;margin-top:8px;"><button class="btn secondary" data-goto="tx" style="width:auto;padding:8px 20px;font-size:13px;">View all transactions →</button></div>`
      : '<div class="empty">No transactions yet this month — tap the "＋" button to add one</div>';
  }

  function txItemHTML(t) {
    const cat = byId(t.categoryId);
    const kind = cat ? rootType(t.categoryId) : 'expense';
    const isIncome = kind === 'income';
    const splitNote = (t.people && t.people > 1) ? ` · total $${Math.round(t.totalAmount)} ÷ ${t.people} people` : '';
    return `<div class="tx-item" data-tx="${t.id}">
      <div class="dot ${isIncome ? 'income' : ''}"></div>
      <div class="info">
        <div class="cat">${cat ? catPath(t.categoryId) : '(deleted category)'}</div>
        <div class="meta">${t.date}${t.note ? ' · ' + t.note : ''}${splitNote}</div>
      </div>
      <div class="amt ${isIncome ? 'income' : ''}">${isIncome ? '+' : '−'}${fmtShort(t.amount)}</div>
    </div>`;
  }

  function renderTxPage() {
    const list = transactions.filter(t => D.monthOf(t.date) === month).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    $('txList').innerHTML = list.length ? list.map(txItemHTML).join('') : '<div class="empty">No transactions yet this month</div>';
  }

  // ============ CHARTS ============
  async function renderCharts() {
    const ready = window.chartLibReady ? await window.chartLibReady : (typeof Chart !== 'undefined');
    if (!ready || typeof Chart === 'undefined') {
      ['spendingSummaryChart', 'incomeBreakdownChart', 'pieChart', 'trendChart'].forEach(id => {
        const el = $(id);
        if (el && el.parentElement && !el.parentElement.querySelector('.chart-fallback')) {
          const note = document.createElement('div');
          note.className = 'empty chart-fallback';
          note.textContent = 'Chart library failed to load. Pull to refresh once your connection is back.';
          el.parentElement.appendChild(note);
        }
      });
      return;
    }
    document.querySelectorAll('.chart-fallback').forEach(n => n.remove());

    // Spending Summary — Expenses vs Savings vs Debt, share of the three combined
    const expA = subtreeActual('exp', month), savA = subtreeActual('sav', month), debtA = subtreeActual('debt', month);
    const summarySum = expA + savA + debtA;
    if (spendingSummaryChart) spendingSummaryChart.destroy();
    spendingSummaryChart = new Chart($('spendingSummaryChart').getContext('2d'), {
      type: 'bar',
      data: { labels: ['This Month'], datasets: [
        { label: 'Expenses', data: [expA], backgroundColor: '#E2636F' },
        { label: 'Savings', data: [savA], backgroundColor: '#34A870' },
        { label: 'Debt', data: [debtA], backgroundColor: '#6B7CFF' }
      ] },
      options: {
        indexAxis: 'y',
        plugins: {
          legend: { position: 'bottom', labels: { color: '#1C2A44', font: { family: "'Inter'", size: 11 } } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmt(ctx.raw)} (${summarySum ? ((ctx.raw / summarySum) * 100).toFixed(0) : 0}%)` } }
        },
        scales: {
          x: { stacked: true, ticks: { color: '#7A8699', font: { size: 10 } }, grid: { color: '#E3E7EE' } },
          y: { stacked: true, ticks: { display: false }, grid: { display: false } }
        }
      }
    });

    // Income Breakdown — expected (budget) vs actual, per income category
    const incCats = children('inc');
    if (incomeBreakdownChart) incomeBreakdownChart.destroy();
    incomeBreakdownChart = new Chart($('incomeBreakdownChart').getContext('2d'), {
      type: 'bar',
      data: { labels: incCats.map(c => c.name), datasets: [
        { label: 'Expected', data: incCats.map(c => subtreeBudget(c.id)), backgroundColor: '#7A869988' },
        { label: 'Actual', data: incCats.map(c => subtreeActual(c.id, month)), backgroundColor: '#29A8C4' }
      ] },
      options: {
        plugins: { legend: { position: 'bottom', labels: { color: '#1C2A44', font: { size: 11 } } }, tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmt(ctx.raw)}` } } },
        scales: { y: { ticks: { color: '#7A8699', font: { size: 10 } }, grid: { color: '#E3E7EE' } }, x: { ticks: { color: '#7A8699', font: { size: 10 } }, grid: { display: false } } }
      }
    });

    // Spending Breakdown — expense categories, this month
    const l2 = children('exp');
    const data = l2.map(c => subtreeActual(c.id, month));
    const labels = l2.map(c => c.name);
    const palette = ['#29A8C4', '#6B7CFF', '#34A870', '#E2636F', '#7A8699', '#4DC8DE', '#8B97F2', '#5FCB94', '#F0919C', '#1C2A44', '#9AA5FF', '#2F9E8F'];
    if (pieChart) pieChart.destroy();
    pieChart = new Chart($('pieChart').getContext('2d'), {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: palette, borderColor: '#F1F4F8', borderWidth: 2 }] },
      options: {
        plugins: {
          legend: { position: 'bottom', labels: { color: '#1C2A44', font: { family: "'Inter'", size: 11 } } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${fmt(ctx.raw)}` } }
        }
      }
    });

    // Daily Spending Trend
    const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
    const daily = Array(daysInMonth).fill(0);
    transactions.filter(t => D.monthOf(t.date) === month).forEach(t => {
      if (rootType(t.categoryId) === 'expense') daily[Number(t.date.slice(8, 10)) - 1] += t.amount;
    });
    if (trendChart) trendChart.destroy();
    trendChart = new Chart($('trendChart').getContext('2d'), {
      type: 'bar',
      data: { labels: daily.map((_, i) => String(i + 1)), datasets: [{ label: 'Daily spending', data: daily, backgroundColor: '#29A8C488', borderRadius: 3 }] },
      options: {
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => fmt(ctx.raw) } } },
        scales: { y: { ticks: { color: '#7A8699', font: { size: 10 } }, grid: { color: '#E3E7EE' } }, x: { ticks: { color: '#7A8699', font: { size: 9 } }, grid: { display: false } } }
      }
    });
  }

  // ============ YEARLY CHARTS ============
  async function renderYearlyCharts() {
    const ready = window.chartLibReady ? await window.chartLibReady : (typeof Chart !== 'undefined');
    const months = monthsBetweenInclusive(`${year}-01`, `${year}-12`);
    const sumRoot = (root) => months.reduce((s, m) => s + subtreeActual(root, m), 0);

    const yInc = sumRoot('inc'), yExp = sumRoot('exp'), ySav = sumRoot('sav'), yDebt = sumRoot('debt');
    $('yearIncome').textContent = fmtShort(yInc);
    $('yearExpense').textContent = fmtShort(yExp);
    $('yearSaving').textContent = fmtShort(ySav);
    $('yearDebt').textContent = fmtShort(yDebt);

    // Category-level gaps list (works even if Chart.js failed to load)
    const gapRows = [];
    ['exp', 'sav', 'debt', 'inc'].forEach(root => {
      categories.filter(c => isLeaf(c.id) && D.ancestors(categories, c.id)[0].id === root && c.budget).forEach(c => {
        const budgeted = (c.budget || 0) * 12;
        const actual = months.reduce((s, m) => s + subtreeActual(c.id, m), 0);
        gapRows.push({ name: catPath(c.id), budgeted, actual, variance: actual - budgeted });
      });
    });
    gapRows.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
    $('yearlyGapsList').innerHTML = gapRows.slice(0, 8).map(r => `
      <div class="cat-row l2">
        <div class="name">${r.name}</div>
        <div class="amt">${fmtShort(r.actual)} / ${fmtShort(r.budgeted)}</div>
        <div class="amt" style="color:${r.variance > 0 ? 'var(--coral)' : 'var(--sage)'}; font-weight:700;">${r.variance > 0 ? '+' : ''}${fmtShort(r.variance)}</div>
      </div>`).join('') || '<div class="empty">No annual budgets set yet</div>';

    if (!ready || typeof Chart === 'undefined') {
      ['yearlyBudgetChart', 'yearlyTrendChart'].forEach(id => {
        const el = $(id);
        if (el && el.parentElement && !el.parentElement.querySelector('.chart-fallback')) {
          const note = document.createElement('div');
          note.className = 'empty chart-fallback';
          note.textContent = 'Chart library failed to load. Pull to refresh once your connection is back.';
          el.parentElement.appendChild(note);
        }
      });
      return;
    }
    document.querySelectorAll('#chartYearly .chart-fallback').forEach(n => n.remove());

    // Budgeted vs Actual — full-year target per top-level category
    const rootLabels = ['Income', 'Expenses', 'Savings', 'Debt'];
    const rootIds = ['inc', 'exp', 'sav', 'debt'];
    const budgeted = rootIds.map(r => subtreeBudget(r) * 12);
    const actual = [yInc, yExp, ySav, yDebt];
    if (yearlyBudgetChart) yearlyBudgetChart.destroy();
    yearlyBudgetChart = new Chart($('yearlyBudgetChart').getContext('2d'), {
      type: 'bar',
      data: { labels: rootLabels, datasets: [
        { label: 'Budgeted', data: budgeted, backgroundColor: '#7A869988' },
        { label: 'Actual', data: actual, backgroundColor: '#29A8C4' }
      ] },
      options: {
        plugins: { legend: { position: 'bottom', labels: { color: '#1C2A44', font: { size: 11 } } }, tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmt(ctx.raw)}` } } },
        scales: { y: { ticks: { color: '#7A8699', font: { size: 10 } }, grid: { color: '#E3E7EE' } }, x: { ticks: { color: '#7A8699', font: { size: 10 } }, grid: { display: false } } }
      }
    });

    // 12-month trend line — all four categories
    const monthLabels = months.map(m => m.slice(5, 7));
    if (yearlyTrendChart) yearlyTrendChart.destroy();
    yearlyTrendChart = new Chart($('yearlyTrendChart').getContext('2d'), {
      type: 'line',
      data: { labels: monthLabels, datasets: [
        { label: 'Income', data: months.map(m => subtreeActual('inc', m)), borderColor: '#29A8C4', backgroundColor: '#29A8C433', tension: 0.25 },
        { label: 'Expenses', data: months.map(m => subtreeActual('exp', m)), borderColor: '#E2636F', backgroundColor: '#E2636F33', tension: 0.25 },
        { label: 'Savings', data: months.map(m => subtreeActual('sav', m)), borderColor: '#34A870', backgroundColor: '#34A87033', tension: 0.25 },
        { label: 'Debt', data: months.map(m => subtreeActual('debt', m)), borderColor: '#6B7CFF', backgroundColor: '#6B7CFF33', tension: 0.25 }
      ] },
      options: {
        plugins: { legend: { position: 'bottom', labels: { color: '#1C2A44', font: { size: 11 } } }, tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmt(ctx.raw)}` } } },
        scales: { y: { ticks: { color: '#7A8699', font: { size: 10 } }, grid: { color: '#E3E7EE' } }, x: { ticks: { color: '#7A8699', font: { size: 10 } }, grid: { display: false } } }
      }
    });
  }

  // ============ CATEGORY MANAGEMENT ============
  // Categories are now plain organizational nodes — name + (for expense/saving) a budget.
  // Whether a given dollar is one-time or recurring is chosen per-entry in the Add Entry form,
  // not baked into the category.
  function catManageRowHTML(c, level) {
    const root = rootType(c.id);
    const tag = level === 1 ? `<span class="tag">${root === 'expense' ? 'Expense' : root === 'saving' ? 'Saving' : root === 'debt' ? 'Debt' : 'Income'}</span>` : '';
    let control = '';
    if (isLeaf(c.id)) {
      control = `<input type="number" class="mini-budget" data-budget-cat="${c.id}" value="${c.budget || ''}" placeholder="Budget" style="width:70px;padding:5px 6px;border:1px solid var(--line);border-radius:6px;font-size:12px;">
        <label style="display:flex;align-items:center;gap:3px;font-size:10.5px;color:var(--muted);white-space:nowrap;">
          <input type="checkbox" data-rollover-cat="${c.id}" ${c.rollover ? 'checked' : ''}> ${icon('refresh', { color: 'var(--muted)', size: 12 })}
        </label>`;
    }
    return `<div class="cat-manage-row l${level}">
      <div class="name">${c.name}${tag}</div>
      ${control}
      <button data-del-cat="${c.id}">✕</button>
    </div>`;
  }

  function renderCatManage() {
    let html = '';
    function walk(parentId, level) {
      children(parentId).forEach(c => { html += catManageRowHTML(c, level); walk(c.id, level + 1); });
    }
    walk(null, 1);
    $('catManageTree').innerHTML = html;

    const parentOpts = categories.filter(c => c.level < 3)
      .map(c => `<option value="${c.id}">${'　'.repeat(c.level - 1)}${catPath(c.id)}</option>`).join('');
    $('newCatParent').innerHTML = parentOpts;
  }

  // ============ overlays ============
  function openOverlay(id) { $(id).classList.add('active'); }
  function closeOverlay(id) { $(id).classList.remove('active'); }

  // ============ page switching ============
  function switchPage(name) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    $('page-' + name).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === name));
  }

  // ============ master render ============
  function renderAll() {
    syncMonthSelects();
    syncYearSelect();
    renderHero();
    renderCards();
    renderHomeCatList();
    renderHomeIncomeList();
    renderHomeDebtList();
    renderHomeRecurringStatus();
    renderHomeRecent();
    renderTxPage();
    renderCatManage();
    renderCharts();
    if (chartRange === 'yearly') renderYearlyCharts();
  }

  // ============ Add Entry form (handles one-time transactions AND recurring items) ============
  function populateTxCategorySelect(type) {
    const rootId = { expense: 'exp', income: 'inc', saving: 'sav', debt: 'debt' }[type] || 'exp';
    const leaves = categories.filter(c => isLeaf(c.id) && D.ancestors(categories, c.id)[0].id === rootId);
    $('txCategory').innerHTML = leaves.map(c => `<option value="${c.id}">${catPath(c.id)}</option>`).join('') || '<option value="">No categories available for this type</option>';
  }

  function updateShareHint() {
    const total = parseFloat($('txAmount').value);
    const people = Math.max(1, parseInt($('txPeople').value, 10) || 1);
    const hint = $('txShareHint');
    if (!isNaN(total) && people > 1) {
      hint.style.display = 'block';
      hint.textContent = `Your share: ${fmt(total / people)} (total ÷ ${people} people)`;
    } else {
      hint.style.display = 'none';
    }
  }

  // Show/hide the fields that differ between a one-time entry and a recurring item.
  function updateFormFieldsForFreq(freq) {
    const recurring = freq === 'recurring';
    const type = $('txTypeSeg').querySelector('button.active').dataset.val;
    $('txDateRow').style.display = recurring ? 'none' : 'flex';
    $('txDate').required = !recurring;
    $('txRecurNameRow').style.display = recurring ? 'flex' : 'none';
    $('txRecurDayRow').style.display = recurring ? 'flex' : 'none';
    $('txAmountLabel').textContent = recurring ? 'Amount ($/month)' : 'Total Amount ($)';
    $('txPeopleRow').style.display = (!recurring && type === 'expense') ? 'flex' : 'none';
    if (!recurring) updateShareHint();
    const editingRecurId = $('txRecurItemId').value;
    const showOverride = recurring && !!editingRecurId && type === 'income';
    $('txRecurOverrideRow').style.display = showOverride ? 'block' : 'none';
  }

  // record: a transaction object, a recurringItem object, or null for a brand-new entry.
  // kind: 'tx' | 'recur' | null
  function openTxForm(record, kind) {
    $('txForm').reset();
    const isEditingTx = kind === 'tx' && !!record;
    const isEditingRecur = kind === 'recur' && !!record;
    $('txId').value = isEditingTx ? record.id : '';
    $('txRecurItemId').value = isEditingRecur ? record.id : '';
    $('btnDeleteTx').style.display = isEditingTx ? 'block' : 'none';
    $('btnStopRecurTx').style.display = isEditingRecur ? 'block' : 'none';
    $('txFormTitle').textContent = isEditingTx ? 'Edit Entry' : isEditingRecur ? 'Edit Recurring Item' : 'Add Entry';

    const type = record ? rootType(record.categoryId) : 'expense';
    $('txTypeSeg').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.val === type));

    const freq = isEditingRecur ? 'recurring' : 'once';
    $('txFreqSeg').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.val === freq));
    const freqLocked = isEditingTx || isEditingRecur;
    $('txFreqSeg').querySelectorAll('button').forEach(b => {
      b.disabled = freqLocked;
      b.style.opacity = freqLocked ? '0.45' : '1';
      b.style.cursor = freqLocked ? 'default' : 'pointer';
    });

    populateTxCategorySelect(type);
    if (record) $('txCategory').value = record.categoryId;
    updateFormFieldsForFreq(freq);

    if (isEditingTx) {
      $('txDate').value = record.date;
      $('txAmount').value = record.totalAmount != null ? record.totalAmount : record.amount;
      $('txPeople').value = record.people || 1;
      $('txNote').value = record.note || '';
    } else if (isEditingRecur) {
      $('txRecurName').value = record.name;
      $('txAmount').value = D.amountForMonth(record, month);
      $('txRecurDay').value = record.dayOfMonth || 1;
      const isOverrideThisMonth = record.overrides && record.overrides[month] !== undefined;
      $('txRecurModeSeg').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.val === (isOverrideThisMonth ? 'override' : 'template')));
    } else {
      $('txDate').value = D.todayISO();
      $('txAmount').value = '';
      $('txPeople').value = 1;
      $('txRecurName').value = '';
      $('txRecurDay').value = 1;
    }
    updateShareHint();
    openOverlay('overlayTx');
  }

  // ============ event binding ============
  function bindEvents() {
    document.querySelectorAll('.nav-item').forEach(b => b.addEventListener('click', () => switchPage(b.dataset.page)));
    $('btnAddTx').addEventListener('click', () => openTxForm(null, null));

    ['monthSelect', 'monthSelectChart', 'monthSelectTx'].forEach(id => {
      $(id).addEventListener('change', (e) => { month = e.target.value; renderAll(); });
    });

    $('yearSelect').addEventListener('change', (e) => { year = e.target.value; renderYearlyCharts(); });

    $('chartRangeSeg').addEventListener('click', (e) => {
      const btn = e.target.closest('button'); if (!btn) return;
      $('chartRangeSeg').querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      chartRange = btn.dataset.val;
      $('chartMonthly').style.display = chartRange === 'monthly' ? 'block' : 'none';
      $('chartYearly').style.display = chartRange === 'yearly' ? 'block' : 'none';
      if (chartRange === 'yearly') renderYearlyCharts();
    });

    document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeOverlay(b.dataset.close)));
    document.querySelectorAll('.overlay').forEach(ov => ov.addEventListener('click', (e) => { if (e.target === ov) ov.classList.remove('active'); }));

    // Categories page renders as part of renderAll() now — no separate open handler needed.

    $('txTypeSeg').addEventListener('click', (e) => {
      const btn = e.target.closest('button'); if (!btn) return;
      $('txTypeSeg').querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      populateTxCategorySelect(btn.dataset.val);
      const freq = $('txFreqSeg').querySelector('button.active').dataset.val;
      updateFormFieldsForFreq(freq);
    });

    $('txFreqSeg').addEventListener('click', (e) => {
      const btn = e.target.closest('button'); if (!btn || btn.disabled) return;
      $('txFreqSeg').querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateFormFieldsForFreq(btn.dataset.val);
    });

    $('txRecurModeSeg').addEventListener('click', (e) => {
      const btn = e.target.closest('button'); if (!btn) return;
      $('txRecurModeSeg').querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });

    $('txAmount').addEventListener('input', updateShareHint);
    $('txPeople').addEventListener('input', updateShareHint);

    $('txForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const categoryId = $('txCategory').value;
      const freq = $('txFreqSeg').querySelector('button.active').dataset.val;
      const editingTxId = $('txId').value;
      const editingRecurId = $('txRecurItemId').value;
      if (!categoryId) { toast('Please choose a category'); return; }

      if (freq === 'once') {
        const totalAmount = parseFloat($('txAmount').value);
        const people = Math.max(1, parseInt($('txPeople').value, 10) || 1);
        if (!totalAmount) { toast('Please fill in all required fields'); return; }
        const amount = Math.round((totalAmount / people + Number.EPSILON) * 100) / 100;
        const record = { id: editingTxId || D.uid('t'), date: $('txDate').value || D.todayISO(), categoryId, amount, totalAmount, people, note: $('txNote').value.trim() };
        await D.put('transactions', record);
        toast('Saved');
      } else {
        const amount = parseFloat($('txAmount').value);
        if (!amount) { toast('Please fill in all required fields'); return; }
        const dayOfMonth = Math.min(Math.max(parseInt($('txRecurDay').value, 10) || 1, 1), 31);
        const name = $('txRecurName').value.trim() || (byId(categoryId) ? byId(categoryId).name : 'Recurring item');
        const isIncome = rootType(categoryId) === 'income';
        if (editingRecurId) {
          const item = recurringItems.find(i => i.id === editingRecurId);
          if (item) {
            item.name = name;
            item.categoryId = categoryId;
            item.dayOfMonth = dayOfMonth;
            const mode = isIncome ? $('txRecurModeSeg').querySelector('button.active').dataset.val : 'template';
            if (mode === 'override') {
              item.overrides = item.overrides || {};
              item.overrides[month] = amount;
            } else {
              item.history = item.history || [];
              const existing = item.history.find(h => h.month === month);
              if (existing) existing.amount = amount; else item.history.push({ month, amount });
            }
            await D.put('recurringItems', item);
            toast('Updated');
          }
        } else {
          const item = { id: D.uid('r'), categoryId, name, dayOfMonth, history: [{ month, amount }], overrides: {}, endMonth: null, isIncome };
          await D.put('recurringItems', item);
          toast('Recurring item added');
        }
      }
      await reloadData();
      closeOverlay('overlayTx');
      renderAll();
    });

    $('btnDeleteTx').addEventListener('click', async () => {
      const id = $('txId').value; if (!id) return;
      if (!confirm('Delete this transaction?')) return;
      await D.del('transactions', id);
      await reloadData();
      closeOverlay('overlayTx');
      renderAll();
      toast('Deleted');
    });

    $('btnStopRecurTx').addEventListener('click', async () => {
      const id = $('txRecurItemId').value;
      const item = recurringItems.find(i => i.id === id);
      if (!item) return;
      if (!confirm(`Stop "${item.name}"? It will no longer count starting ${month}; history before that is kept.`)) return;
      item.endMonth = month;
      await D.put('recurringItems', item);
      await reloadData();
      closeOverlay('overlayTx');
      renderAll();
      toast('Stopped');
    });

    // tap a transaction row or a recurring item row to edit; "view all" link
    document.addEventListener('click', (e) => {
      const txEl = e.target.closest('[data-tx]');
      if (txEl) { const t = transactions.find(x => x.id === txEl.dataset.tx); if (t) openTxForm(t, 'tx'); return; }
      const recurEl = e.target.closest('[data-recur]');
      if (recurEl) { const item = recurringItems.find(x => x.id === recurEl.dataset.recur); if (item) openTxForm(item, 'recur'); return; }
      const gotoBtn = e.target.closest('[data-goto]');
      if (gotoBtn) switchPage(gotoBtn.dataset.goto);
    });

    // add category (plain — no frequency choice; that's decided per-entry now)
    $('addCatForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const parentId = $('newCatParent').value;
      const name = $('newCatName').value.trim();
      if (!parentId || !name) return;
      const parent = byId(parentId);
      const level = parent.level + 1;
      if (level > 3) { toast('Categories can be at most 3 levels deep'); return; }
      const budget = parseFloat($('newCatBudget').value) || 0;
      const rollover = $('newCatRollover').checked;
      await D.put('categories', { id: D.uid('c'), name, level, parentId, type: parent.type, budget, rollover, rolloverStartMonth: rollover ? month : null });
      await reloadData();
      $('addCatForm').reset();
      renderCatManage();
      renderAll();
      toast('Category added');
    });

    $('catManageTree').addEventListener('click', async (e) => {
      const delBtn = e.target.closest('[data-del-cat]');
      if (!delBtn) return;
      const id = delBtn.dataset.delCat;
      const cat = byId(id);
      const subtree = new Set(); (function collect(cid) { subtree.add(cid); children(cid).forEach(k => collect(k.id)); })(id);
      const hasTx = transactions.some(t => subtree.has(t.categoryId));
      const hasRecur = recurringItems.some(i => subtree.has(i.categoryId));
      const hasSubcats = subtree.size > 1;
      let msg = `Delete category "${cat ? cat.name : ''}"?`;
      if (hasSubcats) msg += `\nIts subcategories will be deleted too.`;
      if (hasTx || hasRecur) msg += `\nThis category has existing records — they'll be kept, but the category name will no longer resolve.`;
      if (!confirm(msg)) return;
      for (const cid of subtree) await D.del('categories', cid);
      await reloadData();
      renderCatManage();
      renderAll();
      toast('Category deleted');
    });

    $('catManageTree').addEventListener('change', async (e) => {
      const budgetInput = e.target.closest('[data-budget-cat]');
      if (budgetInput) {
        const id = budgetInput.dataset.budgetCat;
        const val = parseFloat(budgetInput.value) || 0;
        const cat = byId(id);
        await D.put('categories', { ...cat, budget: val });
        await reloadData();
        renderAll();
        toast('Budget updated');
        return;
      }
      const rolloverInput = e.target.closest('[data-rollover-cat]');
      if (rolloverInput) {
        const id = rolloverInput.dataset.rolloverCat;
        const cat = byId(id);
        const enabling = rolloverInput.checked;
        const updated = enabling
          ? { ...cat, rollover: true, rolloverStartMonth: cat.rolloverStartMonth || month }
          : { ...cat, rollover: false, rolloverStartMonth: null };
        await D.put('categories', updated);
        await reloadData();
        renderAll();
        toast(enabling ? `Rollover enabled from ${month}` : 'Rollover disabled');
      }
    });
  }

  async function init() {
    populateDaySelects();
    // Bind all interactive events first, so a data-loading or chart-rendering error
    // downstream can never leave buttons unresponsive.
    bindEvents();

    try {
      await D.ensureSeeded();
      await D.ensureDebtRoot();
      await reloadData();
      renderAll();
    } catch (err) {
      console.error('Failed to load data', err);
      alert('Failed to load data: ' + (err && err.message ? err.message : err) + '\n\nTry opening this in a recent version of Safari/Chrome with an active internet connection (needed the first time, to load the chart library and fonts).');
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  init();
})();
