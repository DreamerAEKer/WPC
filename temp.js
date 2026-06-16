
// --- STORE LOGIC ---
const STORE_KEY = 'world_cup_tracker_data';

const defaultData = {
  quota: 32500,
  pricePerTicket: 3,
  commissionRate: 0.1,
  employees: [],
  transactions: [], // { id, type: 'req'|'remit', empId, date, qty, amount }
  gifts: [], // { id, name, totalStock }
  giftAllocations: [] // { id, empId, giftId, qty, date }
};

class Store {
  constructor() {
    this.data = this.loadData();
  }

  loadData() {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      try {
        return { ...defaultData, ...JSON.parse(raw) };
      } catch (e) {
        console.error('Failed to parse store', e);
        return defaultData;
      }
    }
    return defaultData;
  }

  saveData() {
    localStorage.setItem(STORE_KEY, JSON.stringify(this.data));
    // Trigger custom event so UI can re-render
    window.dispatchEvent(new Event('storeUpdated'));
  }

  // --- Department Overview ---
  getOverview() {
    let totalRequested = 0;
    let totalRemitted = 0;

    this.data.transactions.forEach(t => {
      if (t.type === 'req') totalRequested += t.qty;
      if (t.type === 'remit') totalRemitted += t.qty; // qty of tickets remitted for
    });

    const remainingQuota = this.data.quota - totalRequested;
    const outstandingRemittance = totalRequested - totalRemitted;
    
    // Revenue = remitted tickets * price
    const totalRevenue = totalRemitted * this.data.pricePerTicket;
    // Commission is based on REMITTED sales
    const totalCommission = totalRevenue * this.data.commissionRate;

    return {
      quota: this.data.quota,
      totalRequested,
      remainingQuota,
      totalRemitted,
      outstandingRemittance,
      totalRevenue,
      totalCommission
    };
  }

  // --- Employees ---
  addEmployee(name) {
    const id = Date.now().toString();
    this.data.employees.push({ id, name });
    this.saveData();
    return id;
  }

  getEmployeesData() {
    return this.data.employees.map(emp => {
      let requested = 0;
      let remitted = 0;

      this.data.transactions.filter(t => t.empId === emp.id).forEach(t => {
        if (t.type === 'req') requested += t.qty;
        if (t.type === 'remit') remitted += t.qty;
      });

      const outstanding = requested - remitted;
      const revenue = remitted * this.data.pricePerTicket;
      const commission = revenue * this.data.commissionRate;

      return {
        ...emp,
        requested,
        remitted,
        outstanding,
        revenue,
        commission
      };
    });
  }

  // --- Transactions ---
  addTransaction(type, empId, qty, dateStr, evidenceUrl, requireSign) {
    const amount = qty * this.data.pricePerTicket;
    this.data.transactions.push({
      id: Date.now().toString(),
      type,
      empId,
      qty,
      amount,
      date: dateStr || new Date().toISOString(),
      evidenceUrl: evidenceUrl || null,
      requireSign: requireSign || false
    });
    this.saveData();
  }

  // --- Gifts ---
  addGift(name, totalStock) {
    const id = Date.now().toString();
    this.data.gifts.push({ id, name, totalStock });
    this.saveData();
  }

  allocateGift(empId, giftId, qty, dateStr) {
    this.data.giftAllocations.push({
      id: Date.now().toString(),
      empId,
      giftId,
      qty,
      date: dateStr || new Date().toISOString()
    });
    this.saveData();
  }

  getGiftsData() {
    return this.data.gifts.map(gift => {
      let allocated = 0;
      this.data.giftAllocations.filter(a => a.giftId === gift.id).forEach(a => {
        allocated += a.qty;
      });
      return {
        ...gift,
        allocated,
        remaining: gift.totalStock - allocated
      };
    });
  }
}

const store = new Store();


// --- MAIN LOGIC ---
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
  if(!tbody) return;
  tbody.innerHTML = '';
  const txs = [...store.data.transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
  
  if (txs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-light);">ยังไม่มีรายการ</td></tr>';
  }

  txs.forEach(tx => {
    const empId = tx.employeeId || tx.empId;
    const emp = store.data.employees.find(e => e.id === empId);
    const dateStr = new Date(tx.date).toLocaleDateString('th-TH');
    let typeBadge = '';
    let valStr = '';
    
    const qty = tx.quantity || tx.qty;
    const isReq = tx.type === 'req' || tx.type === 'request';
    
    if (isReq) {
      typeBadge = '<span style="color: var(--text-dark); font-weight: 600;">เบิกไปรษณียบัตร</span>';
      valStr = `<span style="color: var(--text-dark)">${formatNum(qty)}</span>`;
    } else {
      typeBadge = '<span style="color: var(--secondary); font-weight: 600;">นำส่งเงิน</span>';
      valStr = `<span style="color: var(--secondary)">${formatNum(qty)}</span>`;
    }
    
    const amountStr = formatNum(qty * store.data.pricePerTicket);
    
    let evidenceHtml = '';
    if (tx.evidenceUrl) {
      evidenceHtml += `<a href="${tx.evidenceUrl}" target="_blank" style="color: var(--primary); text-decoration: underline; font-size: 0.85rem; display: block; margin-bottom: 4px;">📎 ดูหลักฐาน</a>`;
    }
    if (tx.requireSign) {
      evidenceHtml += `<span style="color: #ea580c; font-size: 0.8rem; background: #ffedd5; padding: 2px 6px; border-radius: 4px; display: inline-block;">⚠️ รอ พนง. ลงชื่อ</span>`;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${dateStr}</td>
      <td>${emp ? emp.name : 'ไม่ทราบชื่อ'}</td>
      <td>${typeBadge}</td>
      <td>${valStr}</td>
      <td>${amountStr}</td>
      <td>${evidenceHtml || '-'}</td>
      <td>
        <button class="btn btn-primary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; margin-right: 4px;" onclick="editTx('${tx.id}')">แก้ไข</button>
        <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5;" onclick="deleteTx('${tx.id}')">ลบ</button>
      </td>
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
  renderEmployees();
  renderTransactions();
  renderGifts();
}

function calcForm() {
  const price = store.data.pricePerTicket;
  
  const parseCell = (id) => parseInt(document.getElementById(id).textContent.replace(/,/g, '')) || 0;
  
  const reqQty = parseCell('c-req-qty');
  const prevQty = parseCell('c-prev-qty');
  const remitQty = parseCell('c-remit-qty');
  
  const reqAmt = reqQty * price;
  const prevAmt = prevQty * price;
  
  const totalQty = reqQty + prevQty;
  const totalAmt = totalQty * price;
  
  const remitAmt = remitQty * price;
  
  const outQty = totalQty - remitQty;
  const outAmt = outQty * price;
  
  document.getElementById('c-req-amt').textContent = reqAmt ? formatNum(reqAmt) : '';
  document.getElementById('c-prev-amt').textContent = prevAmt ? formatNum(prevAmt) : '';
  
  document.getElementById('c-total-qty').textContent = totalQty ? formatNum(totalQty) : '';
  document.getElementById('c-total-amt').textContent = totalAmt ? formatNum(totalAmt) : '';
  
  document.getElementById('c-remit-amt').textContent = remitAmt ? formatNum(remitAmt) : '';
  
  document.getElementById('c-out-qty').textContent = outQty ? formatNum(outQty) : '';
  document.getElementById('c-out-amt').textContent = outAmt ? formatNum(outAmt) : '';
  
  // Update Remaining
  const baseRemain = store.getOverview().remainingQuota;
  document.getElementById('c-remain').textContent = formatNum(baseRemain - reqQty);
}

function initPrintFormEmps() {
  const emps = store.getEmployeesData();
  const select = document.getElementById('p-form-emp');
  const currentVal = select.value;
  select.innerHTML = '<option value="">-- พิมพ์อิสระ (ไม่บันทึกประวัติ) --</option>';
  emps.forEach(emp => {
    select.innerHTML += `<option value="${emp.id}">${emp.name}</option>`;
  });
  if(currentVal) select.value = currentVal;
  
  document.getElementById('c-remain').textContent = formatNum(store.getOverview().remainingQuota);
}

function loadEmpToForm() {
  const empId = document.getElementById('p-form-emp').value;
  const dateStr = new Date().toLocaleDateString('th-TH'); // พ.ศ. format
  
  document.getElementById('c-date1').textContent = dateStr;
  document.getElementById('c-date2').textContent = dateStr;
  
  if (!empId) {
    document.getElementById('c-prev-qty').textContent = '';
    document.getElementById('c-remit-qty').textContent = '';
    document.getElementById('p-sign-name').innerHTML = '(...........................................................)';
    document.getElementById('p-sign-date').textContent = dateStr;
  } else {
    const emps = store.getEmployeesData();
    const emp = emps.find(e => e.id === empId);
    if(emp) {
      document.getElementById('c-prev-qty').textContent = formatNum(emp.requested);
      document.getElementById('c-remit-qty').textContent = formatNum(emp.remitted);
      document.getElementById('p-sign-name').innerHTML = '(...........................................................)';
      document.getElementById('p-sign-date').textContent = dateStr;
    }
  }
  document.getElementById('c-req-qty').textContent = '';
  calcForm();
}

function syncDates(sourceId) {
  const sourceVal = document.getElementById(sourceId).textContent;
  if (sourceId !== 'c-date1') document.getElementById('c-date1').textContent = sourceVal;
  if (sourceId !== 'c-date2') document.getElementById('c-date2').textContent = sourceVal;
  if (sourceId !== 'p-sign-date') document.getElementById('p-sign-date').textContent = sourceVal;
}

function saveFormToHistory() {
  let empId = document.getElementById('p-form-emp').value;
  
  // If no employee selected, try to read the name from the signature block
  if(!empId) {
    let signName = document.getElementById('p-sign-name').textContent;
    // Clean up dots and parentheses
    signName = signName.replace(/[().]/g, '').trim();
    
    if (!signName || signName === 'ผู้เบิก') {
      alert('กรุณาเลือกพนักงาน หรือ พิมพ์ชื่อตรงช่อง "ลายมือชื่อผู้เบิก" ด้านล่างก่อนบันทึกครับ');
      return;
    }
    
    // Find or create employee
    let emps = store.getEmployeesData();
    let emp = emps.find(e => e.name === signName);
    if (!emp) {
      store.addEmployee(signName);
      empId = store.data.employees[store.data.employees.length - 1].id;
    } else {
      empId = emp.id;
    }
  }
  
  const reqQty = parseInt(document.getElementById('c-req-qty').textContent.replace(/,/g, '')) || 0;
  if(reqQty <= 0) {
    alert('กรุณากรอก "จำนวนที่ขอเบิก" ให้มากกว่า 0 ครับ');
    return;
  }
  
  // Parse date from form (format D/M/YYYY in BE)
  let isoDate = new Date().toISOString().split('T')[0];
  const dateStr = document.getElementById('c-date1').textContent.trim();
  const dateParts = dateStr.split('/');
  if(dateParts.length === 3) {
    const d = dateParts[0].padStart(2, '0');
    const m = dateParts[1].padStart(2, '0');
    const y = parseInt(dateParts[2]) - 543; // Convert BE to CE
    isoDate = `${y}-${m}-${d}`;
  }
  
  store.addTransaction('request', empId, reqQty, isoDate);
  alert('บันทึกประวัติการเบิกสำเร็จแล้ว!');
  
  document.getElementById('c-req-qty').textContent = '';
  
  // Reload with the selected/created employee
  initPrintFormEmps();
  document.getElementById('p-form-emp').value = empId;
  loadEmpToForm(); 
  
  renderAll(); // update other views
}

function renderA4Logbook() {
  const tbody = document.getElementById('p-a4-tbody');
  tbody.innerHTML = '';
  
  // Get all 'req' and 'request' transactions
  const requests = store.data.transactions.filter(t => t.type === 'req' || t.type === 'request');
  requests.sort((a,b) => new Date(a.date) - new Date(b.date)); // Chronological
  
  const minRows = 20;
  const rowCount = Math.max(requests.length, minRows);
  
  for(let i=0; i<rowCount; i++) {
    const tx = requests[i];
    if(tx) {
      // Handle both tx.empId and tx.employeeId for backward compatibility
      const empId = tx.empId || tx.employeeId;
      const emp = store.data.employees.find(e => e.id === empId);
      const dStr = new Date(tx.date).toLocaleDateString('th-TH');
      
      // Add note if required sign is true
      const qty = tx.qty || tx.quantity;
      const remark = tx.requireSign ? 'รอให้ พนง. ลงชื่อ' : '';
      
      tbody.innerHTML += `
        <tr style="height: 40px;">
          <td style="border: 1px solid black;">${i+1}</td>
          <td style="border: 1px solid black;">${dStr}</td>
          <td style="border: 1px solid black; text-align: left; padding-left: 10px;">${emp ? emp.name : ''}</td>
          <td style="border: 1px solid black;">${formatNum(qty)}</td>
          <td style="border: 1px solid black;"></td>
          <td style="border: 1px solid black; font-size: 0.85rem; color: #555;">${remark}</td>
        </tr>
      `;
    } else {
      tbody.innerHTML += `
        <tr style="height: 40px;">
          <td style="border: 1px solid black;">${i+1}</td>
          <td style="border: 1px solid black;"></td>
          <td style="border: 1px solid black;"></td>
          <td style="border: 1px solid black;"></td>
          <td style="border: 1px solid black;"></td>
          <td style="border: 1px solid black;"></td>
        </tr>
      `;
    }
  }
}

// Transaction Deletion
function deleteTx(txId) {
  if(confirm('คุณแน่ใจหรือไม่ที่จะลบรายการนี้? (การลบจะดึงยอดกลับคืนอัตโนมัติ)')) {
    store.data.transactions = store.data.transactions.filter(t => t.id !== txId);
    store.saveData();
    renderAll();
  }
}



// Event Listeners
window.addEventListener('storeUpdated', renderAll);
window.addEventListener('storeUpdated', initPrintFormEmps);
window.addEventListener('storeUpdated', renderA4Logbook);

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

let editingTxId = null;

function editTx(txId) {
  const tx = store.data.transactions.find(t => t.id === txId);
  if (!tx) return;
  
  editingTxId = tx.id;
  document.getElementById('tx-emp').value = tx.empId || tx.employeeId;
  document.getElementById('tx-type').value = tx.type === 'request' ? 'req' : tx.type;
  document.getElementById('tx-qty').value = tx.qty || tx.quantity;
  
  const d = new Date(tx.date);
  document.getElementById('tx-date').value = d.toISOString().split('T')[0];
  document.getElementById('tx-require-sign').checked = !!tx.requireSign;
  document.getElementById('tx-value-calc').textContent = formatNum((tx.qty || tx.quantity) * store.data.pricePerTicket);
  
  const submitBtn = document.querySelector('#form-add-tx button[type="submit"]');
  submitBtn.textContent = 'บันทึกการแก้ไข';
  submitBtn.classList.remove('btn-primary');
  submitBtn.classList.add('btn-secondary');
  
  if (!document.getElementById('btn-cancel-edit')) {
    const cancelBtn = document.createElement('button');
    cancelBtn.id = 'btn-cancel-edit';
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn';
    cancelBtn.style = 'margin-left: 10px; border: 1px solid #ccc; background: white; color: black;';
    cancelBtn.textContent = 'ยกเลิก';
    cancelBtn.onclick = cancelEdit;
    submitBtn.parentNode.insertBefore(cancelBtn, submitBtn.nextSibling);
  }
  
  window.scrollTo({top: 0, behavior: 'smooth'});
}

function cancelEdit() {
  editingTxId = null;
  document.getElementById('form-add-tx').reset();
  document.getElementById('tx-value-calc').textContent = '0';
  
  const submitBtn = document.querySelector('#form-add-tx button[type="submit"]');
  submitBtn.textContent = 'บันทึกรายการ';
  submitBtn.classList.remove('btn-secondary');
  submitBtn.classList.add('btn-primary');
  
  const cancelBtn = document.getElementById('btn-cancel-edit');
  if (cancelBtn) cancelBtn.remove();
}

// Add Transaction
document.getElementById('form-add-tx').addEventListener('submit', (e) => {
  e.preventDefault();
  const empId = document.getElementById('tx-emp').value;
  const type = document.getElementById('tx-type').value;
  const qty = parseInt(document.getElementById('tx-qty').value);
  const date = document.getElementById('tx-date').value;
  const fileInput = document.getElementById('tx-evidence');
  const requireSign = document.getElementById('tx-require-sign').checked;

  if (empId && qty > 0) {
    const processSave = (evidenceUrl) => {
      if (editingTxId) {
        const tx = store.data.transactions.find(t => t.id === editingTxId);
        if (tx) {
          tx.empId = empId;
          tx.type = type;
          tx.qty = qty;
          tx.amount = qty * store.data.pricePerTicket;
          tx.date = date;
          tx.requireSign = requireSign;
          if (evidenceUrl !== undefined) {
            tx.evidenceUrl = evidenceUrl;
          }
          store.saveData();
        }
        cancelEdit();
      } else {
        store.addTransaction(type, empId, qty, date, evidenceUrl || null, requireSign);
        document.getElementById('form-add-tx').reset();
        document.getElementById('tx-value-calc').textContent = '0';
      }
    };

    if (fileInput.files && fileInput.files[0]) {
      const reader = new FileReader();
      reader.onload = function(evt) {
        processSave(evt.target.result);
      };
      reader.readAsDataURL(fileInput.files[0]);
    } else {
      processSave(editingTxId ? undefined : null);
    }
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
initPrintFormEmps();
renderA4Logbook();

// Print Function
function switchPrintTab(type) {
  // Hide all layouts
  document.querySelectorAll('.print-layout').forEach(el => el.style.display = 'none');
  // Show selected layout
  document.getElementById('print-type-' + type).style.display = 'block';
  
  // Update active state on tab buttons
  const btn1 = document.getElementById('btn-tab-type1');
  const btn2 = document.getElementById('btn-tab-type2');
  
  if (type === '1') {
    btn1.className = 'btn btn-primary';
    btn1.style = '';
    btn2.className = 'btn btn-secondary';
    btn2.style = 'background: white; color: var(--text-dark); border: 1px solid var(--border);';
  } else {
    btn2.className = 'btn btn-primary';
    btn2.style = '';
    btn1.className = 'btn btn-secondary';
    btn1.style = 'background: white; color: var(--text-dark); border: 1px solid var(--border);';
  }
}
  