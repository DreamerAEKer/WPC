import './style.css';
import { store } from './store.js';

// --- Utility for formatting ---
const formatNum = (num) => new Intl.NumberFormat('th-TH').format(num);
const formatMoney = (num) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(num);

// --- Navigation ---
const navButtons = document.querySelectorAll('.nav-btn');
const views = document.querySelectorAll('.view-section');
const pageTitle = document.getElementById('page-title');

navButtons.forEach(btn => {
  btn.addEventListener('click', (e) => {
    // Active class toggle
    navButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // View toggle
    const targetView = btn.getAttribute('data-view');
    views.forEach(v => v.classList.remove('active'));
    document.getElementById(`view-${targetView}`).classList.add('active');
    
    // Update title
    pageTitle.textContent = btn.textContent.trim();
  });
});

// --- Renders ---
function renderDashboard() {
  const data = store.getOverview();
  
  document.getElementById('dashboard-kpi').innerHTML = `
    <div class="kpi-card" style="border-left-color: #3b82f6;">
      <h4>โควต้ารวม (ฉบับ)</h4>
      <div class="value">${formatNum(data.quota)}</div>
    </div>
    <div class="kpi-card" style="border-left-color: #10b981;">
      <h4>คงเหลือในคลัง (ฉบับ)</h4>
      <div class="value text-success">${formatNum(data.remainingQuota)}</div>
    </div>
    <div class="kpi-card" style="border-left-color: #8b5cf6;">
      <h4>ยอดนำส่งรวม (บาท)</h4>
      <div class="value text-primary">${formatNum(data.totalRevenue)}</div>
    </div>
    <div class="kpi-card" style="border-left-color: #ef4444;">
      <h4>ค้างนำส่ง (ฉบับ)</h4>
      <div class="value text-danger">${formatNum(data.outstandingRemittance)}</div>
    </div>
    <div class="kpi-card" style="border-left-color: #f59e0b;">
      <h4>คอมมิชชันรวม (บาท)</h4>
      <div class="value">${formatNum(data.totalCommission)}</div>
    </div>
  `;

  const emps = store.getEmployeesData().sort((a, b) => b.remitted - a.remitted);
  const tbody = document.querySelector('#dashboard-emp-table tbody');
  tbody.innerHTML = '';
  
  if (emps.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-light);">ยังไม่มีข้อมูลพนักงาน</td></tr>';
  }

  emps.forEach(emp => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${emp.name}</td>
      <td>${formatNum(emp.requested)}</td>
      <td>${formatNum(emp.remitted)}</td>
      <td>${formatNum(emp.outstanding)}</td>
      <td style="color: var(--secondary); font-weight: 600;">${formatNum(emp.commission)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderSummary() {
  const emps = store.getEmployeesData();
  const tbody = document.querySelector('#summary-emp-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  if (emps.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-light);">ยังไม่มีข้อมูลพนักงาน</td></tr>';
    return;
  }

  emps.forEach(emp => {
    const empGifts = {};
    store.data.giftAllocations
      .filter(alloc => alloc.empId === emp.id)
      .forEach(alloc => {
        const gift = store.data.gifts.find(g => g.id === alloc.giftId);
        if (gift) {
          empGifts[gift.name] = (empGifts[gift.name] || 0) + alloc.qty;
        }
      });

    const giftStr = Object.entries(empGifts)
      .map(([name, qty]) => `${name} (${qty})`)
      .join(', ') || '-';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight: 600; color: var(--text-dark);">${emp.name}</td>
      <td>
        <span style="font-weight: 500;">${formatNum(emp.requested)}</span>
        <span style="font-size: 0.8rem; color: var(--text-light); display: block;">(${formatNum(emp.requested * store.data.pricePerTicket)} ฿)</span>
      </td>
      <td style="color: var(--secondary); font-weight: 600;">
        <span>${formatNum(emp.remitted * store.data.pricePerTicket)}</span>
        <span style="font-size: 0.8rem; color: var(--text-light); display: block; font-weight: normal;">(${formatNum(emp.remitted)} ฉบับ)</span>
      </td>
      <td style="${emp.outstanding > 0 ? 'color: var(--danger); font-weight:600;' : ''}">
        <span>${formatNum(emp.outstanding)}</span>
        <span style="font-size: 0.8rem; color: ${emp.outstanding > 0 ? 'var(--danger)' : 'var(--text-light)'}; display: block; font-weight: normal;">(${formatNum(emp.outstanding * store.data.pricePerTicket)} ฿)</span>
      </td>
      <td style="font-size: 0.9rem; color: #4b5563;">${giftStr}</td>
      <td style="color: var(--primary); font-weight: 600;">
        <span>${formatNum(emp.commission)}</span>
        <span style="font-size: 0.8rem; color: var(--text-light); display: block; font-weight: normal;">(${(store.data.commissionRate * 100)}%)</span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderEmployees() {
  const emps = store.getEmployeesData();
  const tbody = document.querySelector('#emp-manage-table tbody');
  tbody.innerHTML = '';
  
  if (emps.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-light);">ยังไม่มีข้อมูลพนักงาน</td></tr>';
  }

  emps.forEach(emp => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${emp.id.slice(-4)}</td>
      <td>${emp.name}</td>
      <td>${formatNum(emp.requested)}</td>
      <td>${formatNum(emp.remitted)}</td>
      <td style="${emp.outstanding > 0 ? 'color: var(--danger); font-weight:600;' : ''}">${formatNum(emp.outstanding)}</td>
      <td>${formatNum(emp.revenue)}</td>
      <td style="color: var(--secondary); font-weight: 600;">${formatNum(emp.commission)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderTransactions() {
  // Update Dropdowns
  const emps = store.getEmployeesData();
  const txEmpSelect = document.getElementById('tx-emp');
  txEmpSelect.innerHTML = '<option value="">-- เลือกพนักงาน --</option>';
  emps.forEach(emp => {
    txEmpSelect.innerHTML += `<option value="${emp.id}">${emp.name} (ค้างส่ง: ${emp.outstanding})</option>`;
  });

  const allocEmpSelect = document.getElementById('alloc-emp');
  allocEmpSelect.innerHTML = '<option value="">-- เลือกพนักงาน --</option>';
  emps.forEach(emp => {
    allocEmpSelect.innerHTML += `<option value="${emp.id}">${emp.name}</option>`;
  });

  // History Table
  const tbody = document.querySelector('#tx-history-table tbody');
  tbody.innerHTML = '';
  const txs = [...store.data.transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
  
  if (txs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-light);">ยังไม่มีรายการ</td></tr>';
  }

  txs.forEach(tx => {
    const empName = emps.find(e => e.id === tx.empId)?.name || 'ไม่ทราบชื่อ';
    const tr = document.createElement('tr');
    const isReq = tx.type === 'req';
    tr.innerHTML = `
      <td>${new Date(tx.date).toLocaleDateString('th-TH')}</td>
      <td>${empName}</td>
      <td><span style="color: ${isReq ? 'var(--text-dark)' : 'var(--secondary)'}; font-weight: 600;">${isReq ? 'เบิกไปรษณียบัตร' : 'นำส่งเงิน'}</span></td>
      <td>${formatNum(tx.qty)}</td>
      <td>${formatNum(tx.amount)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderGifts() {
  // Update dropdown
  const gifts = store.getGiftsData();
  const allocGiftSelect = document.getElementById('alloc-gift');
  allocGiftSelect.innerHTML = '<option value="">-- เลือกของสมมนาคุณ --</option>';
  gifts.forEach(gift => {
    allocGiftSelect.innerHTML += `<option value="${gift.id}">${gift.name} (เหลือ: ${gift.remaining})</option>`;
  });

  // Table
  const tbody = document.querySelector('#gifts-table tbody');
  tbody.innerHTML = '';
  if (gifts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-light);">ยังไม่มีของสมมนาคุณในระบบ</td></tr>';
  }
  gifts.forEach(gift => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${gift.name}</td>
      <td>${formatNum(gift.totalStock)}</td>
      <td>${formatNum(gift.allocated)}</td>
      <td style="font-weight: 600; color: ${gift.remaining <= 0 ? 'var(--danger)' : 'var(--secondary)'}">${formatNum(gift.remaining)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderAll() {
  renderDashboard();
  renderSummary();
  renderEmployees();
  renderTransactions();
  renderGifts();
}

// --- Event Listeners ---
window.addEventListener('storeUpdated', renderAll);

// Calculate value dynamically
document.getElementById('tx-qty').addEventListener('input', (e) => {
  const val = parseInt(e.target.value) || 0;
  document.getElementById('tx-value-calc').textContent = formatNum(val * store.data.pricePerTicket);
});

// Add Employee
document.getElementById('form-add-emp').addEventListener('submit', (e) => {
  e.preventDefault();
  const nameInput = document.getElementById('input-emp-name');
  if (nameInput.value.trim()) {
    store.addEmployee(nameInput.value.trim());
    nameInput.value = '';
  }
});

// Add Transaction
document.getElementById('form-add-tx').addEventListener('submit', (e) => {
  e.preventDefault();
  const empId = document.getElementById('tx-emp').value;
  const type = document.getElementById('tx-type').value;
  const qty = parseInt(document.getElementById('tx-qty').value);
  const date = document.getElementById('tx-date').value;

  if (empId && qty > 0) {
    store.addTransaction(type, empId, qty, date);
    document.getElementById('form-add-tx').reset();
    document.getElementById('tx-value-calc').textContent = '0';
  }
});

// Add Gift
document.getElementById('form-add-gift').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = document.getElementById('gift-name').value.trim();
  const stock = parseInt(document.getElementById('gift-stock').value);

  if (name && stock > 0) {
    store.addGift(name, stock);
    document.getElementById('form-add-gift').reset();
  }
});

// Allocate Gift
document.getElementById('form-allocate-gift').addEventListener('submit', (e) => {
  e.preventDefault();
  const empId = document.getElementById('alloc-emp').value;
  const giftId = document.getElementById('alloc-gift').value;
  const qty = parseInt(document.getElementById('alloc-qty').value);

  if (empId && giftId && qty > 0) {
    store.allocateGift(empId, giftId, qty);
    document.getElementById('form-allocate-gift').reset();
  }
});

// Initialize Date Pickers to today
document.getElementById('tx-date').valueAsDate = new Date();

// Initial Render
renderAll();
