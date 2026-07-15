
// --- FIREBASE CONFIGURATION ---
// กรุณาใส่ config จาก Firebase Console ของคุณที่นี่
const firebaseConfig = {
  apiKey: "AIzaSyCvnS2Rquy3hpmPNy1ODZ79zMubUH5OiZU",
  authDomain: "wpcgpo.firebaseapp.com",
  projectId: "wpcgpo",
  storageBucket: "wpcgpo.firebasestorage.app",
  messagingSenderId: "204628927792",
  appId: "1:204628927792:web:6861cfe5a925f323ae14f5",
  measurementId: "G-B1S0E98L0E",
  // หากฐานข้อมูลอยู่สิงคโปร์ URL จะเป็นตามด้านล่างนี้ หากอยู่สหรัฐอเมริกา ลบบรรทัดนี้ออกหรือเปลี่ยนเป็น https://wpcgpo-default-rtdb.firebaseio.com
  databaseURL: "https://wpcgpo-default-rtdb.asia-southeast1.firebasedatabase.app"
};

let firebaseApp, firebaseDb;
const isFirebaseEnabled = !!firebaseConfig.apiKey;

if (isFirebaseEnabled) {
  firebaseApp = firebase.initializeApp(firebaseConfig);
  firebaseDb = firebase.database();
}

// --- STORE LOGIC ---
const STORE_KEY = 'world_cup_tracker_data';

const defaultData = {
  quota: 32500,
  pricePerTicket: 3,
  commissionRate: 0.1,
  employees: [],
  transactions: [], // { id, type: 'req'|'remit', empId, date, qty, amount }
  masterTransactions: [], // { id, type: 'req'|'remit', date, qty, amount }
  gifts: [], // { id, name, totalStock }
  giftAllocations: [] // { id, empId, giftId, qty, date }
};

class Store {
  constructor() {
    this.data = this.loadLocalData();
    if (isFirebaseEnabled) {
      this.initFirebase();
    }
  }

  loadLocalData() {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if(!parsed.masterTransactions) parsed.masterTransactions = [];
        return { ...defaultData, ...parsed };
      } catch (e) {
        console.error('Failed to parse store', e);
        return defaultData;
      }
    }
    return defaultData;
  }

  initFirebase() {
    const dataRef = firebaseDb.ref('tracker_data');
    dataRef.on('value', (snapshot) => {
      const val = snapshot.val();
      if (val) {
        this.data = { ...defaultData, ...val };
        // Ensure arrays exist even if empty in Firebase
        if (!this.data.masterTransactions) this.data.masterTransactions = [];
        if (!this.data.employees) this.data.employees = [];
        if (!this.data.transactions) this.data.transactions = [];
        if (!this.data.gifts) this.data.gifts = [];
        if (!this.data.giftAllocations) this.data.giftAllocations = [];
        
        // Backup to local storage
        localStorage.setItem(STORE_KEY, JSON.stringify(this.data));
        
        // Re-render UI with new data from Firebase
        if (typeof renderAll === 'function') {
          renderAll();
          initPrintForm();
          renderA4Logbook();
        }
      } else {
        // If Firebase is empty (first run), upload local data to initialize it
        this.saveData();
      }
    });

    // Also sync logbook images
    const imagesRef = firebaseDb.ref('tracker_images');
    imagesRef.on('value', (snapshot) => {
      const val = snapshot.val();
      if (val !== null) {
        localStorage.setItem('world_cup_tracker_logbook_img', JSON.stringify(val));
        if (typeof loadLogbookImage === 'function') {
          loadLogbookImage();
        }
      }
    });
  }

  saveData() {
    if (isFirebaseEnabled) {
      firebaseDb.ref('tracker_data').set(this.data).catch(error => {
        console.error("Firebase write failed:", error);
        if (typeof showToast === 'function') {
          showToast('❌ บันทึกข้อมูลขึ้น Firebase ไม่สำเร็จ', 'error');
        }
      });
    } else {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.data));
    }
    // Trigger custom event so UI can re-render
    window.dispatchEvent(new Event('storeUpdated'));
  }

  // --- Department Overview ---
  getOverview() {
    let totalRequested = 0;
    let totalRemitted = 0;
    let totalReturned = 0;

    this.data.transactions.forEach(t => {
      if (t.type === 'req') totalRequested += t.qty;
      if (t.type === 'remit') totalRemitted += t.qty;
      if (t.type === 'return') totalReturned += t.qty;
    });
    
    let masterRequested = 0;
    let masterRemitted = 0;
    this.data.masterTransactions.forEach(t => {
      if (t.type === 'req') masterRequested += t.qty;
      if (t.type === 'remit') masterRemitted += t.qty;
    });

    const masterRemainingQuota = this.data.quota - masterRequested;
    const masterOutstanding = masterRequested - masterRemitted;
    
    // Remaining quota for employees is what the Head requested minus what employees requested, PLUS what they returned
    const remainingQuota = masterRequested - totalRequested + totalReturned;

    const outstandingRemittance = totalRequested - totalRemitted - totalReturned;
    
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
      totalCommission,
      masterRequested,
      masterRemitted,
      masterRemainingQuota,
      masterOutstanding
    };
  }

  // --- Master Transactions ---
  addMasterTx(type, qty, dateStr) {
    const amount = qty * this.data.pricePerTicket;
    
    // Validation
    if (type === 'req') {
      const overview = this.getOverview();
      const newMasterRequested = overview.masterRequested + qty;
      if (newMasterRequested > overview.quota) {
        throw new Error(`ยอดเบิกสะสมรวม (${newMasterRequested} ฉบับ) เกินโควต้ารวมที่ได้รับจาก ปณ.กลาง (โควต้า ${overview.quota} ฉบับ)`);
      }
    } else if (type === 'remit') {
      const overview = this.getOverview();
      const newMasterRemitted = overview.masterRemitted + qty;
      if (newMasterRemitted > overview.masterRequested) {
        throw new Error(`ยอดนำส่งเงินสะสมรวม (${newMasterRemitted} ฉบับ) เกินกว่ายอดเบิกสะสมของแผนก (${overview.masterRequested} ฉบับ)`);
      }
    }

    this.data.masterTransactions.push({
      id: Date.now().toString(),
      type,
      qty,
      amount,
      date: dateStr || new Date().toISOString()
    });
    this.saveData();
  }
  
  deleteMasterTx(txId) {
    const tx = this.data.masterTransactions.find(t => t.id === txId);
    if (!tx) return;
    
    if (tx.type === 'req') {
      const overview = this.getOverview();
      const newMasterRequested = overview.masterRequested - tx.qty;
      if (newMasterRequested < overview.totalRequested) {
        throw new Error(`ไม่สามารถลบรายการนี้ได้ เนื่องจากจะทำให้ยอดเบิกสะสมของแผนก (${newMasterRequested} ฉบับ) น้อยกว่ายอดที่พนักงานเบิกไปแล้วทั้งหมด (${overview.totalRequested} ฉบับ) ซึ่งจะส่งผลให้ข้อมูลไม่สอดคล้องกัน`);
      }
    }
    
    this.data.masterTransactions = this.data.masterTransactions.filter(t => t.id !== txId);
    this.saveData();
  }

  // --- Employees ---
  addEmployee(name, isManager = false) {
    const lowerName = name.trim().toLowerCase();
    const exists = this.data.employees.some(e => e.name.trim().toLowerCase() === lowerName);
    if (exists) {
      throw new Error(`พนักงานชื่อ "${name}" มีอยู่ในระบบแล้ว`);
    }

    const id = Date.now().toString();
    this.data.employees.push({ id, name: name.trim(), paidAmount: 0, note: '', isManager });
    this.saveData();
    return id;
  }

  setEmployeePaid(empId, paid) {
    const emp = this.data.employees.find(e => e.id === empId);
    if (emp) {
      if (typeof paid === 'boolean') {
        let remitted = 0;
        this.data.transactions.forEach(t => {
          if (t.empId === empId && t.type === 'remit') {
            remitted += t.qty;
          }
        });
        const revenue = remitted * this.data.pricePerTicket;
        const commission = revenue * this.data.commissionRate;
        emp.paidAmount = paid ? commission : 0;
      } else {
        emp.paidAmount = parseFloat(paid) || 0;
      }
      this.saveData();
    }
  }

  setEmployeePaidAmount(empId, paidAmount) {
    const emp = this.data.employees.find(e => e.id === empId);
    if (emp) {
      emp.paidAmount = parseFloat(paidAmount) || 0;
      this.saveData();
    }
  }

  setEmployeeNote(empId, note) {
    const emp = this.data.employees.find(e => e.id === empId);
    if (emp) { emp.note = note; this.saveData(); }
  }

  setEmployeeManager(empId, isManager) {
    const emp = this.data.employees.find(e => e.id === empId);
    if (emp) { emp.isManager = isManager; this.saveData(); }
  }

  deleteEmployee(empId) {
    this.data.employees = this.data.employees.filter(e => e.id !== empId);
    this.data.transactions = this.data.transactions.filter(t => t.empId !== empId);
    this.data.giftAllocations = this.data.giftAllocations.filter(a => a.empId !== empId);
    this.saveData();
  }

  getEmployeesData() {
    return this.data.employees.map(emp => {
      let requested = 0;
      let remitted = 0;
      let returned = 0;

      this.data.transactions.filter(t => t.empId === emp.id).forEach(t => {
        if (t.type === 'req') requested += t.qty;
        if (t.type === 'remit') remitted += t.qty;
        if (t.type === 'return') returned += t.qty;
      });

      const outstanding = requested - remitted - returned;
      const revenue = remitted * this.data.pricePerTicket;
      const commission = revenue * this.data.commissionRate;
      
      const paidAmount = typeof emp.paidAmount === 'number' ? emp.paidAmount : (emp.paid ? commission : 0);
      const isPaid = paidAmount >= commission && commission > 0;

      return {
        ...emp,
        requested,
        remitted,
        outstanding,
        revenue,
        commission,
        paidAmount,
        paid: isPaid,
        note: emp.note || '',
        isManager: emp.isManager || false
      };
    });
  }

  // --- Transactions ---
  addTransaction(type, empId, qty, dateStr, evidenceUrl, requireSign) {
    // Validation
    const overview = this.getOverview();
    if (type === 'req') {
      if (qty > overview.remainingQuota) {
        throw new Error(`ยอดไปรษณียบัตรในมือหัวหน้าแผนกไม่เพียงพอ (เบิกได้อีกไม่เกิน ${overview.remainingQuota} ฉบับ) กรุณาบันทึกรายการรับเข้าของระดับหัวหน้าก่อน`);
      }
    } else if (type === 'remit' || type === 'return') {
      const empData = this.getEmployeesData().find(e => e.id === empId);
      const outstanding = empData ? empData.outstanding : 0;
      if (qty > outstanding) {
        const typeName = type === 'remit' ? 'นำส่งเงิน' : 'คืนเข้าสต็อก';
        throw new Error(`จำนวน${typeName} (${qty} ฉบับ) เกินกว่ายอดค้างส่งของพนักงานคนนี้ (ค้างส่งอยู่ ${outstanding} ฉบับ)`);
      }
    }

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

  updateTransaction(txId, type, empId, qty, dateStr, evidenceUrl, requireSign) {
    const tx = this.data.transactions.find(t => t.id === txId);
    if (!tx) throw new Error('ไม่พบรายการที่ต้องการแก้ไข');

    // Validation excluding this transaction
    const overview = this.getOverview();
    
    if (type === 'req') {
      // Exclude this transaction's request qty if it was a request
      const oldReqQty = tx.type === 'req' ? tx.qty : 0;
      const remainingQuotaEx = overview.remainingQuota + oldReqQty;
      if (qty > remainingQuotaEx) {
        throw new Error(`ยอดไปรษณียบัตรในมือหัวหน้าแผนกไม่เพียงพอ (คงเหลือในมือหัวหน้าแผนก ${remainingQuotaEx} ฉบับ)`);
      }
    } else if (type === 'remit' || type === 'return') {
      // Get target employee's outstanding excluding this transaction's qty
      let empReq = 0;
      let empRemit = 0;
      let empReturn = 0;
      this.data.transactions.forEach(t => {
        if (t.empId === empId && t.id !== txId) {
          if (t.type === 'req') empReq += t.qty;
          if (t.type === 'remit') empRemit += t.qty;
          if (t.type === 'return') empReturn += t.qty;
        }
      });
      const outstandingEx = empReq - empRemit - empReturn;
      if (qty > outstandingEx) {
        const typeName = type === 'remit' ? 'นำส่งเงิน' : 'คืนเข้าสต็อก';
        throw new Error(`จำนวน${typeName} (${qty} ฉบับ) เกินกว่ายอดค้างส่งของพนักงานคนนี้ (ค้างส่งอยู่ ${outstandingEx} ฉบับ)`);
      }
    }

    tx.empId = empId;
    tx.type = type;
    tx.qty = qty;
    tx.amount = qty * this.data.pricePerTicket;
    tx.date = dateStr;
    tx.requireSign = requireSign;
    if (evidenceUrl !== undefined) {
      tx.evidenceUrl = evidenceUrl;
    }
    this.saveData();
  }

  deleteTransaction(txId) {
    const tx = this.data.transactions.find(t => t.id === txId);
    if (!tx) return;

    if (tx.type === 'req') {
      // Check employee outstanding after delete
      const empId = tx.empId;
      const empData = this.getEmployeesData().find(e => e.id === empId);
      if (empData) {
        const newOutstanding = empData.outstanding - tx.qty;
        if (newOutstanding < 0) {
          throw new Error(`ไม่สามารถลบรายการนี้ได้ เนื่องจากยอดค้างส่งของพนักงานจะติดลบ (พนักงานได้นำส่งเงินไปแล้วรวม ${empData.remitted} ฉบับ)`);
        }
      }
    }

    this.data.transactions = this.data.transactions.filter(t => t.id !== txId);
    this.saveData();
  }

  // --- Gifts ---
  addGift(name, totalStock) {
    const lowerName = name.trim().toLowerCase();
    const exists = this.data.gifts.some(g => g.name.trim().toLowerCase() === lowerName);
    if (exists) {
      throw new Error(`ของสมมนาคุณชื่อ "${name}" มีอยู่ในระบบแล้ว`);
    }

    const id = Date.now().toString();
    this.data.gifts.push({ id, name: name.trim(), totalStock });
    this.saveData();
  }

  allocateGift(empId, giftId, qty, dateStr) {
    const gift = this.getGiftsData().find(g => g.id === giftId);
    if (!gift) throw new Error('ไม่พบของสมมนาคุณที่ระบุ');
    if (qty > gift.remaining) {
      throw new Error(`จำนวนที่จัดสรร (${qty} ชิ้น) เกินกว่าของสมมนาคุณคงเหลือในคลัง (คงเหลือ ${gift.remaining} ชิ้น)`);
    }

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


// --- TOAST NOTIFICATIONS ---
function showToast(message, type = 'error') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = '❌';
  if (type === 'success') icon = '✅';
  if (type === 'warning') icon = '⚠️';
  
  toast.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px;">
      <span style="font-size: 1.25rem;">${icon}</span>
      <span>${message}</span>
    </div>
    <span style="cursor: pointer; font-weight: bold; font-size: 1.2rem; opacity: 0.7; transition: opacity 0.2s;" onclick="this.parentElement.remove()" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.7">&times;</span>
  `;
  
  container.appendChild(toast);
  
  // Trigger animation
  setTimeout(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  }, 10);
  
  // Auto remove
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-20px)';
    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, 300);
  }, 4000);
}


// --- CONFIRMATION DIALOGS ---
function showConfirm(message, title = 'ยืนยันการทำรายการ') {
  return new Promise((resolve) => {
    let modal = document.getElementById('confirm-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'confirm-modal';
      modal.className = 'share-modal';
      modal.style = `
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.4);
        z-index: 10000;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.2s ease;
      `;
      modal.innerHTML = `
        <div class="share-modal-inner" style="max-width: 400px; text-align: center; border-radius: 16px; padding: 2rem; transform: scale(0.9); transition: transform 0.2s ease; background: white;">
          <h3 id="confirm-modal-title" style="margin-top: 0; margin-bottom: 1rem; font-size: 1.3rem; font-weight: 700; color: var(--text-dark);"></h3>
          <p id="confirm-modal-msg" style="margin-bottom: 2rem; color: var(--text-light); font-size: 0.95rem; line-height: 1.6; white-space: pre-line; text-align: center;"></p>
          <div style="display: flex; gap: 0.75rem; justify-content: center; width: 100%;">
            <button id="confirm-modal-cancel" class="btn" style="background: #f1f5f9; color: var(--text-dark); flex: 1; border: 1px solid var(--border); transition: background 0.15s; font-family: inherit;">ยกเลิก</button>
            <button id="confirm-modal-ok" class="btn" style="color: white; flex: 1; transition: background 0.15s; font-family: inherit; font-weight: 600;"></button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    const titleEl = document.getElementById('confirm-modal-title');
    const msgEl = document.getElementById('confirm-modal-msg');
    const cancelBtn = document.getElementById('confirm-modal-cancel');
    const okBtn = document.getElementById('confirm-modal-ok');
    const inner = modal.querySelector('.share-modal-inner');

    titleEl.textContent = title;
    msgEl.textContent = message;

    // Styling based on action type
    if (title.includes('ลบ')) {
      okBtn.style.background = 'var(--danger)';
      okBtn.textContent = 'ลบข้อมูล';
      okBtn.onmouseover = () => okBtn.style.background = '#dc2626';
      okBtn.onmouseout = () => okBtn.style.background = 'var(--danger)';
    } else {
      okBtn.style.background = 'var(--primary)';
      okBtn.textContent = 'ยืนยัน';
      okBtn.onmouseover = () => okBtn.style.background = 'var(--primary-hover)';
      okBtn.onmouseout = () => okBtn.style.background = 'var(--primary)';
    }

    const closeModal = (result) => {
      inner.style.transform = 'scale(0.9)';
      modal.style.opacity = '0';
      setTimeout(() => {
        modal.style.display = 'none';
        resolve(result);
      }, 200);
    };

    cancelBtn.onclick = () => closeModal(false);
    okBtn.onclick = () => closeModal(true);
    modal.onclick = (e) => {
      if (e.target === modal) closeModal(false);
    };

    // Open Modal
    modal.style.display = 'flex';
    setTimeout(() => {
      modal.style.opacity = '1';
      inner.style.transform = 'scale(1)';
    }, 10);
  });
}


// --- MAIN LOGIC ---
let txDatePicker;

function formatNum(num) {
  if (isNaN(num)) return '0';
  return num.toLocaleString('en-US');
}

function formatThaiDate(dateInput) {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return dateInput;
  const day = d.getDate();
  const month = d.getMonth() + 1;
  let year = d.getFullYear();
  if (year < 2500) year += 543;
  return `${day}/${month}/${year}`;
}
const formatMoney = (num) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(num);


// --- Navigation ---
const navButtons = document.querySelectorAll('.nav-btn');
const views = document.querySelectorAll('.view-section');
const pageTitle = document.getElementById('page-title');
const mobilePageTitle = document.getElementById('mobile-page-title');

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
    const cleanText = btn.textContent.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD00-\uDFFF]/g, '').trim();
    pageTitle.textContent = btn.textContent.trim();
    if (mobilePageTitle) {
      mobilePageTitle.textContent = cleanText;
    }
  });
});

// Initialize Flatpickr for tx-date
txDatePicker = flatpickr("#tx-date", {
  locale: "th",
  dateFormat: "Y-m-d",
  altInput: true,
  altFormat: "TH",
  disableMobile: "true",
  formatDate: (date, format, locale) => {
    if (format === "TH") {
      const d = String(date.getDate()).padStart(2, '0');
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const y = date.getFullYear() + 543;
      return `${d}/${m}/${y}`;
    }
    return flatpickr.formatDate(date, format, locale);
  }
});

// --- Renders ---
function renderDashboard() {
  const data = store.getOverview();
  
  document.getElementById('dashboard-kpi').innerHTML = `
    <div style="grid-column: 1 / -1; margin-bottom: -0.5rem; margin-top: 0.5rem;">
      <h3 style="color: var(--text-dark); font-size: 1.1rem; border-bottom: 2px solid var(--border); padding-bottom: 0.5rem;">ข้อมูลโควต้าแผนก (ระดับหัวหน้า)</h3>
    </div>
    <div class="kpi-card" style="border-left-color: #3b82f6;">
      <h4>โควต้ารวม ปณ.กลาง (ฉบับ)</h4>
      <div class="value">${formatNum(data.quota)}</div>
    </div>
    <div class="kpi-card" style="border-left-color: #8b5cf6;">
      <h4>เบิกมาแล้ว (ฉบับ)</h4>
      <div class="value text-primary">${formatNum(data.masterRequested)}</div>
    </div>
    <div class="kpi-card" style="border-left-color: #10b981;">
      <h4>คงเหลือที่ ปณ.กลาง (ฉบับ)</h4>
      <div class="value text-success">${formatNum(data.masterRemainingQuota)}</div>
    </div>
    <div class="kpi-card" style="border-left-color: #f59e0b;">
      <h4>นำส่ง ปณ.กลางแล้ว (ฉบับ)</h4>
      <div class="value">${formatNum(data.masterRemitted)}</div>
    </div>
    <div class="kpi-card" style="border-left-color: #ef4444;">
      <h4>ค้างนำส่ง ปณ.กลาง (ฉบับ)</h4>
      <div class="value text-danger">${formatNum(data.masterOutstanding)}</div>
    </div>

    <div style="grid-column: 1 / -1; margin-bottom: -0.5rem; margin-top: 1rem;">
      <h3 style="color: var(--text-dark); font-size: 1.1rem; border-bottom: 2px solid var(--border); padding-bottom: 0.5rem;">ข้อมูลพนักงาน (ระดับบุคคล)</h3>
    </div>
    <div class="kpi-card" style="border-left-color: #3b82f6;">
      <h4>พนักงานเบิกไป (ใบ)</h4>
      <div class="value">${formatNum(data.totalRequested)}</div>
    </div>
    <div class="kpi-card" style="border-left-color: #10b981;">
      <h4>คงเหลือในมือ หน.แผนก (ใบ)</h4>
      <div class="value text-success">${formatNum(data.remainingQuota)}</div>
    </div>
    <div class="kpi-card" style="border-left-color: #8b5cf6;">
      <h4>ยอดขายรวม (บาท)</h4>
      <div class="value text-primary">${formatNum(data.totalRevenue)}</div>
    </div>
    <div class="kpi-card" style="border-left-color: #ef4444;">
      <h4>พนักงานค้างนำส่ง (ใบ)</h4>
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
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-light);">ยังไม่มีข้อมูลพนักงาน</td></tr>';
    return;
  }

  emps.forEach(emp => {
    // Get allocated gifts for this employee
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
    tr.style.background = emp.paid ? 'linear-gradient(90deg, #f0fdf4, #ffffff)' : '';
    tr.innerHTML = `
      <td style="font-weight: 600; color: var(--text-dark);">${emp.name}</td>
      <td>
        <span style="font-weight: 500;">${formatNum(emp.requested)}</span>
        <span style="font-size: 0.8rem; color: var(--text-light); display: block;">(${formatNum(emp.requested * store.data.pricePerTicket)} บาท)</span>
      </td>
      <td style="color: var(--secondary); font-weight: 600;">
        <span>${formatNum(emp.remitted * store.data.pricePerTicket)}</span>
        <span style="font-size: 0.8rem; color: var(--text-light); display: block; font-weight: normal;">(${formatNum(emp.remitted)} ฉบับ)</span>
      </td>
      <td style="${emp.outstanding > 0 ? 'color: var(--danger); font-weight:600;' : ''}">
        <span>${formatNum(emp.outstanding)}</span>
        <span style="font-size: 0.8rem; color: ${emp.outstanding > 0 ? 'var(--danger)' : 'var(--text-light)'}; display: block; font-weight: normal;">(${formatNum(emp.outstanding * store.data.pricePerTicket)} บาท)</span>
      </td>
      <td style="font-size: 0.9rem; color: #4b5563;">${giftStr}</td>
      <td style="color: var(--primary); font-weight: 600;">
        <span>${formatNum(emp.commission)}</span>
        <span style="font-size: 0.8rem; color: var(--text-light); display: block; font-weight: normal;">(${(store.data.commissionRate * 100)}%)</span>
      </td>
      <td>
        <div style="font-weight: 600; color: ${emp.paidAmount >= emp.commission && emp.commission > 0 ? 'var(--success)' : (emp.paidAmount > 0 ? 'var(--warning)' : 'var(--text-light)')}; display: flex; flex-direction: column; align-items: flex-end; gap: 0.25rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem; justify-content: flex-end; width: 100%;">
            <input type="number" style="width: 70px; padding: 0.25rem; font-size: 0.85rem; border: 1px solid var(--border); border-radius: 4px;" value="${emp.paidAmount}" onchange="store.setEmployeePaidAmount('${emp.id}', this.value); renderAll();" /> บาท
            ${emp.paidAmount >= emp.commission && emp.commission > 0 ? '✅' : ''}
          </div>
          ${emp.commission > emp.paidAmount && emp.commission > 0 ? `<div style="font-size:0.75rem; color: var(--danger); font-weight:normal;">(ค้างจ่าย ${formatNum(emp.commission - emp.paidAmount)})</div>` : ''}
          <div>
            <label style="font-size: 0.75rem; display: flex; align-items: center; gap: 4px; cursor: pointer; color: var(--text-dark);">
              <input type="checkbox" ${emp.paidAmount >= emp.commission && emp.commission > 0 ? 'checked' : ''} onchange="store.setEmployeePaid('${emp.id}', this.checked); renderAll();" style="accent-color: var(--primary); width: 14px; height: 14px;" /> จ่ายครบแล้ว
            </label>
          </div>
        </div>
      </td>
      <td>
        <input type="text" style="width: 100px; padding: 0.25rem; font-size: 0.85rem; border: 1px solid var(--border); border-radius: 4px;" value="${emp.note || ''}" placeholder="ระบุหมายเหตุ" onchange="store.setEmployeeNote('${emp.id}', this.value); renderAll();" />
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderEmployees() {
  const emps = store.getEmployeesData().sort((a, b) => a.name.localeCompare(b.name, 'th'));
  const tbody = document.querySelector('#emp-manage-table tbody');
  tbody.innerHTML = '';
  
  if (emps.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-light);">ยังไม่มีข้อมูลพนักงาน</td></tr>';
  }

  emps.forEach(emp => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:600;">
        ${emp.name}
      </td>
      <td style="text-align: center;">
        <input type="checkbox" ${emp.isManager ? 'checked' : ''} onchange="toggleManager('${emp.id}', this.checked)" style="width: 18px; height: 18px; cursor: pointer;" />
      </td>
      <td>${formatNum(emp.requested)} <span style="font-size:0.8rem; color:var(--text-light); font-weight:normal;">/ ${formatNum(emp.requested * store.data.pricePerTicket)} บาท</span></td>
      <td>${formatNum(emp.remitted)} <span style="font-size:0.8rem; color:var(--text-light); font-weight:normal;">/ ${formatNum(emp.remitted * store.data.pricePerTicket)} บาท</span></td>
      <td style="${emp.outstanding > 0 ? 'color: var(--danger); font-weight:600;' : ''}">${formatNum(emp.outstanding)} <span style="font-size:0.8rem; opacity:0.8; font-weight:normal;">/ ${formatNum(emp.outstanding * store.data.pricePerTicket)} บาท</span></td>
      <td style="color: var(--secondary); font-weight: 600;">${formatNum(emp.commission)}</td>
      <td>
        <button class="btn btn-primary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; margin-right: 4px;" onclick="openEmployeeDetails('${emp.id}')">🔍 ประวัติ</button>
        <button class="btn-delete-emp" onclick="deleteEmployee('${emp.id}', '${emp.name}')" title="ลบพนักงาน">
          🗑️ ลบ
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.openEmployeeDetails = function(empId) {
  const emp = store.getEmployeesData().find(e => e.id === empId);
  if (!emp) return;
  
  document.getElementById('emp-details-title').textContent = `ประวัติรายการ: ${emp.name}`;
  document.getElementById('emp-details-req').textContent = formatNum(emp.requested);
  document.getElementById('emp-details-remit').textContent = formatNum(emp.remitted);
  document.getElementById('emp-details-outstanding').textContent = formatNum(emp.outstanding);
  
  const tbody = document.querySelector('#emp-details-tx-table tbody');
  tbody.innerHTML = '';
  
  const txs = store.data.transactions.filter(t => t.empId === emp.id).sort((a, b) => new Date(b.date) - new Date(a.date));
  
  if (txs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-light);">ยังไม่มีรายการ</td></tr>';
  } else {
    txs.forEach(tx => {
      const dateStr = formatThaiDate(tx.date);
      let typeBadge = '';
      const qty = tx.qty;
      const isReq = tx.type === 'req' || tx.type === 'request';
      
      if (isReq) {
        typeBadge = '<span style="color: var(--text-dark); font-weight: 600;">เบิก</span>';
      } else if (tx.type === 'remit') {
        typeBadge = '<span style="color: var(--secondary); font-weight: 600;">นำส่งเงิน</span>';
      } else if (tx.type === 'return') {
        typeBadge = '<span style="color: #ea580c; font-weight: 600;">คืนเข้าสต็อก</span>';
      }
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${dateStr}</td>
        <td>${typeBadge}</td>
        <td>${formatNum(qty)}</td>
        <td>
          <button class="btn btn-primary" style="padding: 0.2rem 0.4rem; font-size: 0.75rem; margin-right: 4px;" onclick="editTx('${tx.id}')">แก้ไข</button>
          <button class="btn btn-secondary" style="padding: 0.2rem 0.4rem; font-size: 0.75rem; background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5;" onclick="deleteEmpTx('${tx.id}', '${emp.id}')">ลบ</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }
  
  document.getElementById('emp-details-modal').style.display = 'flex';
};

window.deleteEmpTx = async function(txId, empId) {
  if (await showConfirm('ต้องการลบรายการนี้ใช่หรือไม่?', 'ยืนยันการลบ')) {
    try {
      store.deleteTransaction(txId);
      renderAll();
      openEmployeeDetails(empId); // Refresh modal
    } catch (e) {
      alert(e.message);
    }
  }
};

function toggleManager(empId, isChecked) {
  store.setEmployeeManager(empId, isChecked);
}

async function deleteEmployee(empId, empName) {
  if (await showConfirm(`ลบพนักงาน "${empName}" ออกจากระบบ?\n(รายการทั้งหมดของพนักงานคนนี้จะถูกลบด้วย)`, 'ยืนยันการลบพนักงาน')) {
    store.deleteEmployee(empId);
    renderAll();
  }
}

function renderTransactions() {
  // Update Dropdowns
  const emps = store.getEmployeesData().sort((a, b) => a.name.localeCompare(b.name, 'th'));
  const txEmpSelect = document.getElementById('tx-emp');
  if (txEmpSelect) {
    txEmpSelect.innerHTML = '<option value="">-- เลือกพนักงาน --</option>';
    emps.forEach(emp => {
      txEmpSelect.innerHTML += `<option value="${emp.id}">${emp.name} (ค้างส่ง: ${emp.outstanding})</option>`;
    });
  }

  const allocEmpSelect = document.getElementById('alloc-emp');
  if (allocEmpSelect) {
    allocEmpSelect.innerHTML = '<option value="">-- เลือกพนักงาน --</option>';
    emps.forEach(emp => {
      allocEmpSelect.innerHTML += `<option value="${emp.id}">${emp.name}</option>`;
    });
  }

  // History Table
  const tbody = document.querySelector('#tx-history-table tbody');
  if(!tbody) return;
  tbody.innerHTML = '';
  const allTxs = [...store.data.transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
  
  let txs = [...allTxs];
  if (typeof currentHistoryFilter !== 'undefined' && currentHistoryFilter !== 'all') {
    txs = txs.filter(t => {
      const isReq = t.type === 'req' || t.type === 'request';
      if (currentHistoryFilter === 'req') return isReq;
      if (currentHistoryFilter === 'remit') return t.type === 'remit';
      if (currentHistoryFilter === 'return') return t.type === 'return';
      return true;
    });
  }
  
  // Pre-calculate paid status for req transactions based on employee remittances
  const reqPaidStatus = {};
  if (store.data.employees && store.data.transactions) {
    store.data.employees.forEach(emp => {
      const empTxs = store.data.transactions
        .filter(t => (t.employeeId || t.empId) === emp.id)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      
      let totalCredit = 0;
      empTxs.forEach(t => {
        if (t.type === 'remit' || t.type === 'return') {
          totalCredit += (t.quantity || t.qty);
        }
      });
  
      empTxs.forEach(t => {
        if (t.type === 'req' || t.type === 'request') {
          const reqQty = t.quantity || t.qty;
          if (totalCredit >= reqQty) {
            reqPaidStatus[t.id] = { isPaid: true, remaining: 0 };
            totalCredit -= reqQty;
          } else if (totalCredit > 0) {
            reqPaidStatus[t.id] = { isPaid: false, remaining: reqQty - totalCredit };
            totalCredit = 0;
          } else {
            reqPaidStatus[t.id] = { isPaid: false, remaining: reqQty };
          }
        }
      });
    });
  }

  if (txs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-light);">ยังไม่มีรายการ</td></tr>';
  }

  let sumQty = 0;
  let sumAmt = 0;

  txs.forEach((tx, i) => {
    const empId = tx.employeeId || tx.empId;
    const emp = store.data.employees.find(e => e.id === empId);
    const dateStr = formatThaiDate(tx.date);
    let typeBadge = '';
    let valStr = '';
    
    const qty = tx.quantity || tx.qty;
    const isReq = tx.type === 'req' || tx.type === 'request';
    
    if (isReq) {
      typeBadge = '<span style="color: #3b82f6; font-weight: 600;">เบิกไปรษณียบัตร</span>';
      valStr = `<span style="color: #3b82f6">${formatNum(qty)}</span>`;
    } else if (tx.type === 'remit') {
      typeBadge = '<span style="color: #10b981; font-weight: 600;">นำส่งเงิน</span>';
      valStr = `<span style="color: #10b981">${formatNum(qty)}</span>`;
    } else if (tx.type === 'return') {
      typeBadge = '<span style="color: #6b7280; font-weight: 600;">คืนเข้าสต็อก</span>';
      valStr = `<span style="color: #6b7280">${formatNum(qty)}</span>`;
    } else {
      typeBadge = tx.type;
      valStr = formatNum(qty);
    }
    
    const amountStr = formatNum(qty * store.data.pricePerTicket);

    let paidIndicatorHtml = '';
    if (isReq) {
      const status = reqPaidStatus[tx.id];
      if (status && status.isPaid) {
        paidIndicatorHtml = '<span title="จ่ายครบแล้ว" style="color: #16a34a; display: flex; align-items: center;"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span>';
      } else if (status && status.remaining > 0 && status.remaining < qty) {
        const paidQty = qty - status.remaining;
        paidIndicatorHtml = `<span title="จ่ายแล้ว ${formatNum(paidQty)} รอจ่าย ${formatNum(status.remaining)} ฉบับ" style="color: #ea580c; font-size: 0.75rem; background: #ffedd5; padding: 2px 6px; border-radius: 4px; white-space: nowrap;">จ่าย ${formatNum(paidQty)} รอจ่าย ${formatNum(status.remaining)}</span>`;
      }
    }
    
    let evidenceHtml = '';
    if (tx.evidenceUrl) {
      evidenceHtml += `<a href="${tx.evidenceUrl}" target="_blank" style="color: var(--primary); text-decoration: underline; font-size: 0.85rem; display: block; margin-bottom: 4px;">📎 ดูหลักฐาน</a>`;
    }
    if (tx.requireSign) {
      evidenceHtml += `<span style="color: #ea580c; font-size: 0.8rem; background: #ffedd5; padding: 2px 6px; border-radius: 4px; display: inline-block;">⚠️ รอ พนง. ลงชื่อ</span>`;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="color: var(--text-light); font-size: 0.9em; text-align: center;">${txs.length - i}</td>
      <td>${dateStr}</td>
      <td>${emp ? emp.name : 'ไม่ทราบชื่อ'}</td>
      <td>${typeBadge}</td>
      <td>
        <div style="display: flex; align-items: center; gap: 6px;">
          <input type="checkbox" ${tx.verified ? 'checked' : ''} onchange="toggleTxVerified('${tx.id}', this.checked)" style="width: 16px; height: 16px; cursor: pointer; accent-color: #2563eb;" title="ตรวจสอบแล้ว">
          ${valStr}
          ${paidIndicatorHtml}
        </div>
      </td>
      <td>
        <div style="display: flex; align-items: center; justify-content: flex-start; gap: 8px;">
          <span>${amountStr}</span>
        </div>
      </td>
      <td>${evidenceHtml || '-'}</td>
      <td>
        <button class="btn btn-primary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; margin-right: 4px;" onclick="editTx('${tx.id}')">แก้ไข</button>
        <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5;" onclick="deleteTx('${tx.id}')">ลบ</button>
      </td>
    `;
    tbody.appendChild(tr);
    
    sumQty += qty;
    sumAmt += (qty * store.data.pricePerTicket);
  });
  
  const sumRow = document.getElementById('tx-history-summary');
  if (sumRow && txs.length > 0 && typeof currentHistoryFilter !== 'undefined' && currentHistoryFilter !== 'all') {
    sumRow.style.display = 'table-row';
    document.getElementById('tx-history-sum-qty').textContent = formatNum(sumQty);
    document.getElementById('tx-history-sum-amt').textContent = formatNum(sumAmt);
  } else if (sumRow) {
    sumRow.style.display = 'none';
  }
}

function renderGifts() {
  // Update dropdown
  const gifts = store.getGiftsData();
  const allocGiftSelect = document.getElementById('alloc-gift');
  if (allocGiftSelect) {
    allocGiftSelect.innerHTML = '<option value="">-- เลือกของสมมนาคุณ --</option>';
    gifts.forEach(gift => {
      allocGiftSelect.innerHTML += `<option value="${gift.id}">${gift.name} (เหลือ: ${gift.remaining})</option>`;
    });
  }

  // Table
  const tbody = document.querySelector('#gifts-table tbody');
  if (tbody) {
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
}

function renderMasterHistory() {
  const tbody = document.querySelector('#master-history-table tbody');
  if(!tbody) return;
  tbody.innerHTML = '';
  
  const txs = [...store.data.masterTransactions].sort((a, b) => new Date(b.date) - new Date(a.date));
  
  if (txs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-light); padding: 2rem;">ยังไม่มีประวัติการรับโควต้าหรือนำส่งเงิน</td></tr>';
    return;
  }
  
  txs.forEach(tx => {
    const dateStr = formatThaiDate(tx.date);
    let typeBadge = '';
    let valStr = '';
    
    if (tx.type === 'req') {
      typeBadge = '<span style="color: var(--text-dark); font-weight: 600;">เบิกจาก โควต้า</span>';
      valStr = `<span style="color: var(--text-dark)">${formatNum(tx.qty)}</span>`;
    } else {
      typeBadge = '<span style="color: var(--secondary); font-weight: 600;">นำส่งเงิน</span>';
      valStr = `<span style="color: var(--secondary)">${formatNum(tx.qty)}</span>`;
    }
    
    const amountStr = formatNum(tx.amount);
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${dateStr}</td>
      <td>${typeBadge}</td>
      <td>${valStr}</td>
      <td>${amountStr}</td>
      <td>
        <button class="btn btn-primary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; margin-right: 0.5rem;" onclick="printMasterTx('${tx.id}')">🖨️ พิมพ์</button>
        <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5;" onclick="deleteMasterTx('${tx.id}')">ลบ</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.toggleTxVerified = function(txId, verified) {
  const tx = store.data.transactions.find(t => t.id === txId);
  if (tx) {
    tx.verified = verified;
    store.saveData();
    renderTransactions(); // Refresh only the transactions table
  }
};



function renderCommissionTable() {
  const tbody = document.querySelector('#commission-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  // Get all employees
  const allEmps = store.getEmployeesData().sort((a, b) => b.remitted - a.remitted);
  const emps = allEmps.filter(e => !e.isManager);
  const managers = allEmps.filter(e => e.isManager);
  
  if (allEmps.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-light);">ยังไม่มีข้อมูลพนักงาน</td></tr>';
    return;
  }
  
  let totalRemitted = 0;
  let totalRevenue = 0;
  let totalCommission = 0;
  
  const renderRow = (emp) => {
    if (emp.remitted > 0) {
      totalRemitted += emp.remitted;
      totalRevenue += emp.revenue;
      totalCommission += emp.commission;
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight: 600;">${emp.name} ${emp.isManager ? '<span class="badge" style="background:#e2e8f0;color:#475569;font-size:0.7rem;margin-left:4px;">หัวหน้า</span>' : ''}</td>
        <td style="text-align: right;">${formatNum(emp.remitted)}</td>
        <td style="text-align: right; color: var(--secondary);">${formatNum(emp.revenue)}</td>
        <td style="text-align: right; font-weight: 700; color: #16a34a;">${formatNum(emp.commission)}</td>
        <td style="text-align: center;">
          <input type="checkbox" style="width: 20px; height: 20px; cursor: pointer;" 
                 ${emp.paid ? 'checked' : ''} 
                 onchange="toggleCommissionPaid('${emp.id}', this.checked)">
        </td>
      `;
      tbody.appendChild(tr);
    }
  };

  // Render Subordinates
  emps.forEach(renderRow);
  
  // Add Subordinate Total Row if there are managers too
  if (managers.some(m => m.remitted > 0) && emps.some(e => e.remitted > 0)) {
     const subTr = document.createElement('tr');
     subTr.style.background = '#f8fafc';
     subTr.innerHTML = `
      <td style="color:var(--text-light);">รวมเฉพาะทีมงาน</td>
      <td style="text-align: right; color:var(--text-light);">${formatNum(emps.reduce((s, e) => s + e.remitted, 0))}</td>
      <td style="text-align: right; color:var(--text-light);">${formatNum(emps.reduce((s, e) => s + e.revenue, 0))}</td>
      <td style="text-align: right; color:var(--text-light);">${formatNum(emps.reduce((s, e) => s + e.commission, 0))}</td>
      <td></td>
     `;
     tbody.appendChild(subTr);
  }

  // Render Managers
  if (managers.some(m => m.remitted > 0)) {
    const mgrHeader = document.createElement('tr');
    mgrHeader.innerHTML = `<td colspan="5" style="background:#f1f5f9; font-size:0.85rem; font-weight:bold; color:var(--text-dark);">ส่วนของระดับหัวหน้า</td>`;
    tbody.appendChild(mgrHeader);
    managers.forEach(renderRow);
  }
  
  // Add total row
  const totalTr = document.createElement('tr');
  totalTr.style.background = '#e0f2fe';
  totalTr.style.fontWeight = '700';
  totalTr.innerHTML = `
    <td>ยอดรวมทั้งหมด</td>
    <td style="text-align: right;">${formatNum(totalRemitted)}</td>
    <td style="text-align: right; color: var(--secondary);">${formatNum(totalRevenue)}</td>
    <td style="text-align: right; color: #16a34a; font-size: 1.1rem;">${formatNum(totalCommission)}</td>
    <td></td>
  `;
  tbody.appendChild(totalTr);
}

window.toggleCommissionPaid = function(empId, isPaid) {
  store.setEmployeePaid(empId, isPaid);
  renderCommissionTable();
};

function renderAll() {
  renderDashboard();
  renderEmployees();
  renderTransactions();
  renderRanking();
  renderMasterHistory();
  renderA4Logbook();
  renderA4Commission();
  renderCommissionTable();
  initPrintForm();
}

// ===== RANKING RENDER =====
function getRankingData() {
  return store.getEmployeesData()
    .filter(e => !e.isManager)
    .sort((a, b) => b.requested - a.requested || b.remitted - a.remitted);
}

function getManagersData() {
  return store.getEmployeesData()
    .filter(e => e.isManager)
    .sort((a, b) => b.requested - a.requested || b.remitted - a.remitted);
}

const rankMedals = ['🥇', '🥈', '🥉'];
const rankLabels = ['อันดับ 1', 'อันดับ 2', 'อันดับ 3'];

function renderRanking() {
  const emps = getRankingData();
  const managers = getManagersData();
  const maxRequested = emps.length > 0 ? (emps[0].requested || 1) : 1;
  const cardsContainer = document.getElementById('ranking-cards');
  if (!cardsContainer) return;

  // Let's calculate remaining stock of postcards
  const overview = store.getOverview();
  // Remaining stock at Head = what Head requested - what employees (including manager) requested
  // However, the remaining postcards for motivation = remaining quota in hand + what employees still have to sell?
  // Let's show: Remaining at Head of Department (คงเหลือในมือ หน.แผนก) + Remaining at Postal Center (คงเหลือที่ ปณ.กลาง)
  // Let's show remaining postcards in team's hands that is not yet remitted, or total remaining quota.
  // The user requested: "ขอ จำนวน ไปรษณียบัตร ที่เหลือ แสดงไว้เป็น แรงกระตุ้น ทุกคนในแผนกด้วย"
  // Let's show: ยอดไปรษณียบัตรคงเหลือในโควต้ารวม (โควต้ารวม - เบิกไปแล้ว) และ คงเหลือในมือ หน.แผนก
  const totalStockRemaining = overview.quota - overview.totalRequested;

  // Helper to generate text statistics for remaining stock
  const getStockStatsHtml = (totalQty) => {
    const boxCapacity = 4000;
    const packCapacity = 100;
    
    let boxes = Math.floor(totalQty / boxCapacity);
    let remainder = totalQty % boxCapacity;
    let packs = Math.floor(remainder / packCapacity);
    let singleSheets = remainder % packCapacity;

    return `
      <div style="
        display: flex;
        gap: 0.75rem;
        margin-top: 1rem;
        flex-wrap: wrap;
      ">
        <div style="background: rgba(255, 255, 255, 0.2); padding: 0.5rem 1rem; border-radius: 12px; font-weight: bold; font-size: 0.95rem;">📦 ${boxes} กล่อง</div>
        <div style="background: rgba(255, 255, 255, 0.2); padding: 0.5rem 1rem; border-radius: 12px; font-weight: bold; font-size: 0.95rem;">✉️ ${packs} ก้อน (ก้อนละ 100 ใบ)</div>
        ${singleSheets > 0 ? `<div style="background: rgba(255, 255, 255, 0.2); padding: 0.5rem 1rem; border-radius: 12px; font-weight: bold; font-size: 0.95rem;">📄 ${singleSheets} ใบ</div>` : ''}
      </div>
    `;
  };

  // Build motivator HTML
  let motivatorHtml = `
    <div class="card" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 1.5rem; margin-bottom: 1.5rem; border-radius: 16px; border: none; box-shadow: 0 4px 20px rgba(16, 185, 129, 0.3);">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem;">
        <div style="flex: 1; min-width: 250px;">
          <h3 style="margin: 0; font-size: 1.1rem; opacity: 0.9; color: white;">🔥 พลังขับเคลื่อนแผนก (ไปรษณียบัตรคงเหลือทั้งหมด)</h3>
          <div style="font-size: 2.2rem; font-weight: 900; margin-top: 0.5rem; line-height: 1;">${formatNum(totalStockRemaining)} <span style="font-size: 1.1rem; font-weight: normal; opacity: 0.85;">ใบ</span></div>
          <p style="margin: 0.5rem 0 0; font-size: 0.85rem; opacity: 0.85;">(จากโควต้าทั้งหมด ${formatNum(overview.quota)} ใบ | หัวหน้าแผนกมีในมืออีก ${formatNum(overview.remainingQuota)} ใบ)</p>
        </div>
        <div style="font-size: 3rem; opacity: 0.9; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.15)); align-self: center;">📦</div>
      </div>
      ${getStockStatsHtml(totalStockRemaining)}
    </div>
  `;

  // Build manager stats HTML (placed at the bottom)
  let managerHtml = '';
  if (managers.length > 0) {
    managerHtml = `
      <div class="card" style="background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); color: var(--text-dark); padding: 1.25rem 1.5rem; margin-top: 2rem; border-radius: 16px; border: 1px solid var(--border); box-shadow: var(--shadow-md);">
        <h4 style="margin: 0 0 0.75rem; font-size: 0.95rem; font-weight: 700; color: var(--text-dark); display: flex; align-items: center; gap: 0.5rem;">
          <span>👤 ยอดหัวหน้าแผนก (ไม่เข้าร่วมการจัดอันดับ)</span>
        </h4>
        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
    `;
    managers.forEach(mgr => {
      const expectedInc = mgr.requested * store.data.pricePerTicket * store.data.commissionRate;
      const guaranteedInc = mgr.remitted * store.data.pricePerTicket * store.data.commissionRate;
      const remittedPct = Math.min(100, Math.round((mgr.remitted / (mgr.requested || 1)) * 100));
      const pctText = remittedPct === 100 ? `ส่งครบแล้ว` : ``;

      let incHtml = '';
      if (mgr.remitted === 0) {
        incHtml = `ในมือ: <span style="color:#f59e0b; font-weight:600;">${formatNum(expectedInc)} บาท</span>`;
      } else if (remittedPct === 100) {
        incHtml = `ได้ชัวร์: <span style="color:#10b981; font-weight:600;">${formatNum(guaranteedInc)} บาท</span>`;
      } else {
        incHtml = `ในมือ: <span style="color:#f59e0b; font-weight:600;">${formatNum(expectedInc)} บาท</span><br>
                   ได้ชัวร์: <span style="color:#10b981; font-weight:600;">${formatNum(guaranteedInc)} บาท</span>`;
      }

      managerHtml += `
        <div style="display: flex; justify-content: space-between; align-items: center; background: white; padding: 0.75rem 1rem; border-radius: 10px; border: 1px solid var(--border);">
          <div style="display: flex; flex-direction: column;">
            <span style="font-weight: 700; font-size: 1rem; color: var(--text-dark);">${mgr.name}</span>
            <div style="font-size: 0.75rem; color: var(--text-light); margin-top: 2px;">
              ${incHtml}
            </div>
          </div>
          <div style="text-align: right;">
            <div>
              <span style="font-size: 1.4rem; font-weight: 900; color: var(--primary);">${formatNum(mgr.requested)}</span>
              <span style="font-size: 0.8rem; opacity: 0.8; color: var(--text-light);"> ใบ</span>
            </div>
            <div style="width: 110px; margin-left: auto; margin-top: 4px;">
              ${pctText ? `<div style="display: flex; justify-content: flex-end; font-size: 0.7rem; color: var(--text-light); margin-bottom: 2px; line-height: 1;">${pctText}</div>` : 
               `<div style="display: flex; justify-content: flex-end; font-size: 0.65rem; line-height: 1; margin-bottom: 3px; gap: 4px;">
                  <span style="color: #10b981;">ส่ง ${formatNum(mgr.remitted)}</span>
                  ${mgr.outstanding > 0 ? `<span style="color: #f59e0b;">รอส่ง ${formatNum(mgr.outstanding)}</span>` : ''}
                </div>`
              }
              <div style="width: 100%; background: #e2e8f0; border-radius: 99px; height: 5px; overflow: hidden; display: flex; justify-content: flex-end;">
                 <div style="width: ${remittedPct}%; height: 100%; background: #10b981; border-radius: 99px;"></div>
              </div>
            </div>
          </div>
        </div>
      `;
    });
    managerHtml += `</div></div>`;
  }

  // Build podium (top 3) + list (4+)
  let podiumHtml = '';
  let listHtml = '';
  if (emps.length === 0) {
    podiumHtml = '<div style="text-align:center; padding: 3rem; color: var(--text-light); font-size: 1.1rem;">⚠️ ยังไม่มีข้อมูลพนักงาน</div>';
  } else {
    const top3 = emps.slice(0, 3);
    podiumHtml = `<div class="rank-podium-row">`;
    
    const displayIndices = top3.length === 3 ? [1, 0, 2] : top3.map((_, i) => i);
    displayIndices.filter(idx => idx < top3.length).forEach(idx => {
      const emp = top3[idx];
      // idx 0 -> rank-1 (Gold), idx 1 -> rank-2 (Silver), idx 2 -> rank-3 (Bronze)
      const rankClassNum = idx + 1; 
      
      const expectedInc = emp.requested * store.data.pricePerTicket * store.data.commissionRate;
      const guaranteedInc = emp.remitted * store.data.pricePerTicket * store.data.commissionRate;
      const remittedPct = Math.min(100, Math.round((emp.remitted / (emp.requested || 1)) * 100));
      const pctText = remittedPct === 100 ? `ส่งครบแล้ว` : ``;

      let incHtml = '';
      if (emp.remitted === 0) {
        incHtml = `<div style="color: #b45309; font-weight: 700;">ในมือ: ${formatNum(expectedInc)} บาท</div>`;
      } else if (remittedPct === 100) {
        incHtml = `<div style="color: #059669; font-weight: 700;">ได้ชัวร์: ${formatNum(guaranteedInc)} บาท</div>`;
      } else {
        incHtml = `<div style="color: #b45309; font-weight: 700;">ในมือ: ${formatNum(expectedInc)} บาท</div>
                   <div style="color: #059669; font-weight: 700;">ได้ชัวร์: ${formatNum(guaranteedInc)} บาท</div>`;
      }

      podiumHtml += `
        <div class="rank-podium-card rank-${rankClassNum}">
          <div class="rank-badge">${rankLabels[idx]}</div>
          <span class="rank-medal">${rankMedals[idx]}</span>
          <div class="rank-podium-name">${emp.name}</div>
          <div class="rank-podium-score">${formatNum(emp.requested)}</div>
          <div class="rank-podium-label">ใบ</div>
          
          <div style="background: rgba(255,255,255,0.6); padding: 4px 6px; border-radius: 8px; margin-top: 6px; font-size: 0.65rem; line-height: 1.2; width: 100%;">
            ${incHtml}
          </div>

          <div style="width: 95%; max-width: 110px; margin: 6px auto 0;">
            ${pctText ? `<div style="font-size: 0.65rem; color: var(--text-light); margin-bottom: 2px; line-height: 1; text-align: center;">${pctText}</div>` : 
             `<div style="font-size: 0.65rem; line-height: 1; margin-bottom: 3px; display: flex; justify-content: center; gap: 4px;">
                <span style="color: #10b981;">ส่ง ${formatNum(emp.remitted)}</span>
                ${emp.outstanding > 0 ? `<span style="color: #f59e0b;">รอส่ง ${formatNum(emp.outstanding)}</span>` : ''}
              </div>`
            }
            <div style="width: 100%; background: #cbd5e1; border-radius: 99px; height: 5px; overflow: hidden;">
               <div style="width: ${remittedPct}%; height: 100%; background: #10b981; border-radius: 99px;"></div>
            </div>
          </div>
        </div>`;
    });
    podiumHtml += '</div>';

    const rest = emps.slice(3);
    rest.forEach((emp, i) => {
      const rank = i + 4;
      const pct = maxRequested > 0 ? Math.round((emp.requested / maxRequested) * 100) : 0;
      
      const expectedInc = emp.requested * store.data.pricePerTicket * store.data.commissionRate;
      const guaranteedInc = emp.remitted * store.data.pricePerTicket * store.data.commissionRate;
      const remittedPct = Math.min(100, Math.round((emp.remitted / (emp.requested || 1)) * 100));
      const pctText = remittedPct === 100 ? `ส่งครบแล้ว` : ``;
      
      let incHtml = '';
      if (emp.remitted === 0) {
        incHtml = `<span style="color: #f59e0b; font-weight: 600;">ในมือ: ${formatNum(expectedInc)} บาท</span>`;
      } else if (remittedPct === 100) {
        incHtml = `<span style="color: #10b981; font-weight: 600;">ได้ชัวร์: ${formatNum(guaranteedInc)} บาท</span>`;
      } else {
        incHtml = `<span style="color: #f59e0b; font-weight: 600;">ในมือ: ${formatNum(expectedInc)} บาท</span>
                   <span style="color: #10b981; font-weight: 600;">ได้ชัวร์: ${formatNum(guaranteedInc)} บาท</span>`;
      }
      
      listHtml += `
        <div class="rank-list-item">
          <div class="rank-list-num">${rank}</div>
          <div class="rank-list-info">
            <div class="rank-list-name">${emp.name}</div>
            <div class="progress-bar-outer"><div class="progress-bar-inner" style="width:${pct}%"></div></div>
            <div style="display: flex; gap: 8px; font-size: 0.7rem; margin-top: 3px;">
               ${incHtml}
            </div>
          </div>
          <div class="rank-list-right" style="display: flex; flex-direction: column; align-items: flex-end;">
            <div style="display: flex; align-items: baseline; justify-content: flex-end; gap: 4px;">
              <div class="rank-list-score">${formatNum(emp.requested)}</div>
              <div class="rank-list-score-label">ใบ</div>
            </div>
            <div style="width: 110px; margin-top: 4px;">
              ${pctText ? `<div style="display: flex; justify-content: flex-end; font-size: 0.65rem; color: var(--text-light); margin-bottom: 2px; line-height: 1;">${pctText}</div>` : 
               `<div style="display: flex; justify-content: flex-end; font-size: 0.65rem; line-height: 1; margin-bottom: 3px; gap: 4px;">
                  <span style="color: #10b981;">ส่ง ${formatNum(emp.remitted)}</span>
                  ${emp.outstanding > 0 ? `<span style="color: #f59e0b;">รอส่ง ${formatNum(emp.outstanding)}</span>` : ''}
                </div>`
              }
              <div style="width: 100%; background: #e2e8f0; border-radius: 99px; height: 4px; overflow: hidden; display: flex; justify-content: flex-end;">
                 <div style="width: ${remittedPct}%; height: 100%; background: #10b981; border-radius: 99px;"></div>
              </div>
            </div>
          </div>
        </div>`;
    });
  }

  cardsContainer.innerHTML = motivatorHtml + podiumHtml + listHtml + managerHtml;

  cardsContainer.innerHTML = motivatorHtml + podiumHtml + listHtml + managerHtml;
}

// ===== SHARE LOGIC =====
function shareAsText() {
  const emps = getRankingData();
  const managers = getManagersData();
  const overview = store.getOverview();
  const totalStockRemaining = overview.quota - overview.totalRequested;
  const now = new Date().toLocaleDateString('th-TH', {day:'numeric', month:'long', year:'numeric'});
  
  let text = `🏆 อันดับยอดเบิกไปรษณียบัตร ฟุตบอลระดับโลก 2026\n`;
  text += `📅 อัพเดทวันที่ ${now}\n`;
  text += `${'─'.repeat(30)}\n`;
  
  text += `👥 อันดับพนักงาน:\n`;
  emps.forEach((emp, i) => {
    const medal = rankMedals[i] || `${i+1}.`;
    text += `${medal} ${emp.name} — ยอดเบิก ${formatNum(emp.requested)} ใบ | ยอดนำส่ง ${formatNum(emp.remitted)} ใบ\n`;
  });
  
  if (managers.length > 0) {
    text += `${'─'.repeat(30)}\n`;
    managers.forEach(mgr => {
      text += `• ${mgr.name} — ยอดเบิก ${formatNum(mgr.requested)} ใบ | ยอดนำส่ง ${formatNum(mgr.remitted)} ใบ\n`;
    });
  }
  
  text += `${'─'.repeat(30)}\n`;
  text += `📦 ไปรษณียบัตรคงเหลือในแผนก: ${formatNum(totalStockRemaining)} ใบ\n`;
  text += `💎 รวมยอดเบิกทั้งหมด: ${formatNum(overview.totalRequested)} ใบ`;

  document.getElementById('share-text-content').value = text;
  const encoded = encodeURIComponent(text);
  document.getElementById('line-share-link').href = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(location.href)}&text=${encoded}`;
  document.getElementById('share-text-modal').style.display = 'flex';
}

function copyShareText() {
  const ta = document.getElementById('share-text-content');
  ta.select();
  try {
    navigator.clipboard.writeText(ta.value).then(() => {
      const btn = document.getElementById('btn-copy-text');
      btn.textContent = '✅ คัดลอกแล้ว!';
      setTimeout(() => { btn.textContent = '📋 คัดลอก'; }, 2000);
    });
  } catch(e) {
    document.execCommand('copy');
    const btn = document.getElementById('btn-copy-text');
    btn.textContent = '✅ คัดลอกแล้ว!';
    setTimeout(() => { btn.textContent = '📋 คัดลอก'; }, 2000);
  }
}

async function shareAsImage() {
  const emps = getRankingData();
  const managers = getManagersData();
  const overview = store.getOverview();
  const totalStockRemaining = overview.quota - overview.totalRequested;
  const now = new Date().toLocaleDateString('th-TH', {day:'numeric', month:'long', year:'numeric'});

  // Build snapshot DOM with TRUE PODIUM HEIGHTS
  // Order shown: Silver (left) | Gold (center, tallest) | Bronze (right)
  let snapEl = document.getElementById('ranking-snapshot');
  if (!snapEl) {
    snapEl = document.createElement('div');
    snapEl.id = 'ranking-snapshot';
    document.body.appendChild(snapEl);
  }

  // Make the snapshot layout lighter and more vibrant
  snapEl.style.background = 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)';
  snapEl.style.color = '#1e2937';
  snapEl.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)';
  snapEl.style.border = '1px solid #cbd5e1';
  snapEl.style.width = '720px';
  snapEl.style.padding = '40px';
  snapEl.style.boxSizing = 'border-box';
  snapEl.style.fontFamily = 'Inter, "Kanit", sans-serif';

  // Podium backgrounds and sizing for premium look
  const podiumSizes = [
    { height: '280px', numSize: '5.5rem', bg: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)', border: '#f59e0b', nameColor: '#78350f', numColor: '#92400e', labelColor: '#b45309' }, // gold (1st)
    { height: '210px', numSize: '3.8rem', bg: 'linear-gradient(135deg, #f1f5f9 0%, #cbd5e1 100%)', border: '#94a3b8', nameColor: '#334155', numColor: '#1e2937', labelColor: '#64748b' }, // silver (2nd)
    { height: '170px', numSize: '3.2rem', bg: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)', border: '#fdba74', nameColor: '#9a3412', numColor: '#c2410c', labelColor: '#ea580c' }, // bronze (3rd)
  ];

  const top3 = emps.slice(0, 3);
  const rest = emps.slice(3);

  // Build ordered display: Silver (1), Gold (0), Bronze (2)  
  let podiumCardsHtml = '';
  const displayOrder = top3.length === 3 ? [1, 0, 2] : top3.map((_, i) => i);
  displayOrder.filter(i => i < top3.length).forEach(idx => {
    const emp = top3[idx];
    const sz = podiumSizes[idx];
    
    let outstandingHtml = emp.outstanding > 0 ? `<div style="font-size: 0.95rem; color: #ef4444; margin-top: 0.4rem; background: rgba(255,255,255,0.8); padding: 2px 8px; border-radius: 6px; font-weight: bold;">รอส่ง: ${formatNum(emp.outstanding)}</div>` : '';
    
    podiumCardsHtml += `
      <div style="
        background: ${sz.bg};
        border: 2px solid ${sz.border};
        border-radius: 24px;
        padding: 1.5rem 1rem 1.2rem;
        text-align: center;
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-end;
        min-height: ${sz.height};
        position: relative;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
      ">
        <div style="font-size: 2.2rem; margin-bottom: 0.4rem;">${rankMedals[idx]}</div>
        <div style="font-size: 1.6rem; font-weight: 800; color: ${sz.nameColor}; margin-bottom: 0.5rem; line-height: 1.2;">${emp.name}</div>
        <div style="font-size: ${sz.numSize}; font-weight: 900; color: ${sz.numColor}; line-height: 1; letter-spacing: -2px;">${formatNum(emp.requested)}</div>
        <div style="font-size: 1rem; color: ${sz.labelColor}; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; margin-top: 0.3rem;">ใบ</div>
        <div style="font-size: 0.95rem; color: ${sz.labelColor}; margin-top: 0.8rem; background: rgba(255,255,255,0.5); padding: 2px 8px; border-radius: 6px; font-weight: bold;">ส่งเงิน: ${formatNum(emp.remitted)}</div>
        ${outstandingHtml}
      </div>`;
  });

  let restHtml = '';
  rest.forEach((emp, i) => {
    let outstandingHtml = emp.outstanding > 0 ? `<span style="color: #ef4444; margin-left: 0.5rem;">รอส่ง: ${formatNum(emp.outstanding)}</span>` : '';
    
    restHtml += `
      <div style="
        display: flex;
        align-items: center;
        gap: 1rem;
        background: white;
        border-radius: 16px;
        padding: 1rem 1.4rem;
        margin-bottom: 0.7rem;
        border: 1px solid #e2e8f0;
        box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.02);
      ">
        <div style="font-size: 1.6rem; font-weight: 800; width: 40px; text-align: center; color: #94a3b8;">${i+4}</div>
        <div style="flex: 1;">
          <div style="font-weight: 800; font-size: 1.7rem; color: #1e2937;">${emp.name}</div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 2.2rem; font-weight: 900; line-height: 1; color: #4f46e5;">${formatNum(emp.requested)}</div>
          <div style="font-size: 0.8rem; opacity: 0.6; text-transform: uppercase; color: #64748b;">ใบ</div>
          <div style="font-size: 1.05rem; color: #10b981; font-weight: 700; margin-top: 0.4rem;">ส่งเงิน: ${formatNum(emp.remitted)} ${outstandingHtml}</div>
        </div>
      </div>`;
  });

  // Render managers at the bottom of snapshot list (just names and scores without Manager header)
  let snapshotManagerHtml = '';
  if (managers.length > 0) {
    managers.forEach(mgr => {
      let outstandingHtml = mgr.outstanding > 0 ? `<span style="color: #ef4444; margin-left: 0.5rem;">รอส่ง: ${formatNum(mgr.outstanding)}</span>` : '';
      snapshotManagerHtml += `
        <div style="
          display: flex;
          align-items: center;
          gap: 1rem;
          background: #f8fafc;
          border-radius: 16px;
          padding: 1rem 1.4rem;
          margin-bottom: 0.7rem;
          border: 1px dashed #cbd5e1;
        ">
          <div style="font-size: 1.6rem; width: 40px; text-align: center;">👤</div>
          <div style="flex: 1;">
            <div style="font-weight: 800; font-size: 1.7rem; color: #1e2937;">${mgr.name}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 2.2rem; font-weight: 900; line-height: 1; color: #64748b;">${formatNum(mgr.requested)}</div>
            <div style="font-size: 0.8rem; opacity: 0.6; text-transform: uppercase; color: #64748b;">ใบ</div>
            <div style="font-size: 1.05rem; color: #10b981; font-weight: 700; margin-top: 0.4rem;">ส่งเงิน: ${formatNum(mgr.remitted)} ${outstandingHtml}</div>
          </div>
        </div>`;
    });
  }

  // Helper to generate text statistics for remaining stock
  const getStockStatsHtml = (totalQty) => {
    const boxCapacity = 4000;
    const packCapacity = 100;
    
    let boxes = Math.floor(totalQty / boxCapacity);
    let remainder = totalQty % boxCapacity;
    let packs = Math.floor(remainder / packCapacity);
    let singleSheets = remainder % packCapacity;

    return `
      <div style="
        display: flex;
        gap: 0.6rem;
        margin-top: 1rem;
        flex-wrap: wrap;
      ">
        <div style="background: rgba(255, 255, 255, 0.2); padding: 0.6rem 1rem; border-radius: 12px; font-weight: bold; font-size: 1.3rem;">📦 ${boxes} กล่อง</div>
        <div style="background: rgba(255, 255, 255, 0.2); padding: 0.6rem 1rem; border-radius: 12px; font-weight: bold; font-size: 1.3rem;">✉️ ${packs} ก้อน (ก้อนละ 100 ใบ)</div>
        ${singleSheets > 0 ? `<div style="background: rgba(255, 255, 255, 0.2); padding: 0.6rem 1rem; border-radius: 12px; font-weight: bold; font-size: 1.3rem;">📄 ${singleSheets} ใบ</div>` : ''}
      </div>
    `;
  };

  // Calculate total money remitted
  const totalRemittedMoney = overview.totalRemitted * store.data.pricePerTicket;

  // Render stock motivator in snapshot image (Clean green look)
  let snapshotMotivatorHtml = `
    <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 24px; padding: 1.8rem 1.8rem; margin-bottom: 1.8rem; display: flex; flex-direction: column; color: white; box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.1);">
      <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
        <div>
          <div style="font-size: 1.3rem; font-weight: bold; opacity: 0.9;">🔥 ไปรษณียบัตรคงเหลือในแผนก:</div>
          <div style="font-size: 3.4rem; font-weight: 900; margin-top: 0.2rem; line-height: 1;">${formatNum(totalStockRemaining)} <span style="font-size: 1.6rem; font-weight: normal;">ใบ</span></div>
        </div>
        <div style="font-size: 3.2rem; opacity: 0.8;">📦</div>
      </div>
      ${getStockStatsHtml(totalStockRemaining)}
      
      <div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px dashed rgba(255,255,255,0.3); display: flex; justify-content: space-between;">
        <div>
          <div style="font-size: 1.25rem; opacity: 0.9;">ยอดรวมพนักงานเบิก:</div>
          <div style="font-size: 2rem; font-weight: 800;">${formatNum(overview.totalRequested)} <span style="font-size: 1.25rem; font-weight: normal;">ใบ</span></div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 1.25rem; opacity: 0.9;">ส่งเงินแล้ว:</div>
          <div style="font-size: 2rem; font-weight: 800; color: #fde68a;">${formatNum(overview.totalRemitted)} <span style="font-size: 1.25rem; font-weight: normal; color: white;">ใบ</span> <span style="font-size: 1.6rem;">(${formatNum(totalRemittedMoney)} บาท)</span></div>
        </div>
      </div>
    </div>
  `;

  snapEl.innerHTML = `
    <div style="text-align:center; margin-bottom: 1.8rem;">
      <div style="font-size: 2.2rem; font-weight: 900; letter-spacing: -0.5px; color: #1e2937;">🏆 อันดับยอดเบิกสะสม</div>
      <div style="font-size: 1.15rem; font-weight: 500; opacity: 0.75; margin-top: 0.4rem; color: #475569;">ฟุตบอลระดับโลก 2026 — ${now}</div>
    </div>
    ${snapshotMotivatorHtml}
    <div style="display: flex; gap: 1rem; align-items: flex-end; margin-bottom: 1.8rem;">${podiumCardsHtml}</div>
    ${restHtml}
    ${snapshotManagerHtml}
    <div style="text-align:center; margin-top: 2rem; font-size: 1rem; opacity: 0.6; color: #475569;">แผนกลูกค้าธุรกิจ ปณฝ.กลาง 10501</div>
  `;

  const btn = document.getElementById('btn-share-img');
  btn.textContent = '⏳ กำลังสร้างรูป...';
  btn.disabled = true;

  // Dynamically load html2canvas if not loaded
  if (!window.html2canvas) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // Move into view for capture
  snapEl.style.left = '-9999px';
  snapEl.style.top = '0';

  try {
    const canvas = await html2canvas(snapEl, {
      scale: 2,
      backgroundColor: null,
      useCORS: true,
      logging: false
    });

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const fileName = `ranking-worldcup-${Date.now()}.png`;
    const file = new File([blob], fileName, { type: 'image/png' });
    
    let shared = false;
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'อันดับยอดเบิกสะสม',
          text: 'ตารางอันดับยอดเบิกสะสม ฟุตบอลระดับโลก 2026'
        });
        shared = true;
        btn.textContent = '✅ แชร์เรียบร้อย!';
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Share API error:', err);
        } else {
          shared = true; // User canceled the share prompt, avoid fallback
        }
      }
    }
    
    if (!shared) {
      // Fallback to direct download
      const link = document.createElement('a');
      link.download = fileName;
      link.href = URL.createObjectURL(blob);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      btn.textContent = '✅ โหลดรูปแล้ว!';
    }

    setTimeout(() => { btn.innerHTML = '<span>🖼️</span> แชร์รูปภาพ'; btn.disabled = false; }, 2500);
  } catch(err) {
    console.error(err);
    alert('เกิดข้อผิดพลาดในการสร้างรูป กรุณาลองใหม่อีกครั้ง');
    btn.innerHTML = '<span>🖼️</span> แชร์รูปภาพ';
    btn.disabled = false;
  }
}

function calcForm() {
  const price = store.data.pricePerTicket;
  
  const parseCell = (id) => {
    const el = document.getElementById(id);
    if(!el) return 0;
    return parseInt(el.textContent.replace(/,/g, '')) || 0;
  };
  
  const reqQty = parseCell('c-req-qty');
  const prevQty = parseCell('c-prev-qty');
  const remitNewQty = parseCell('c-remit-qty');
  const remitAccum = parseCell('c-remit-accum');
  const quota = parseCell('c-quota');
  
  const reqAmt = reqQty * price;
  const prevAmt = prevQty * price;
  
  const totalQty = reqQty + prevQty;
  const totalAmt = totalQty * price;
  
  const remitAmt = remitNewQty * price;
  
  const outQty = totalQty - (remitNewQty + remitAccum);
  const outAmt = outQty * price;
  
  document.getElementById('c-req-amt').textContent = reqAmt ? formatNum(reqAmt) : '';
  document.getElementById('c-prev-amt').textContent = prevAmt ? formatNum(prevAmt) : '';
  
  document.getElementById('c-total-qty').textContent = totalQty ? formatNum(totalQty) : '';
  document.getElementById('c-total-amt').textContent = totalAmt ? formatNum(totalAmt) : '';
  
  document.getElementById('c-remit-amt').textContent = remitAmt ? formatNum(remitAmt) : '';
  
  document.getElementById('c-out-qty').textContent = outQty ? formatNum(outQty) : '';
  document.getElementById('c-out-amt').textContent = outAmt ? formatNum(outAmt) : '';
  
  // Update Remaining
  const remain = quota - (prevQty + reqQty);
  document.getElementById('c-remain').textContent = formatNum(remain);
}


function renderA4Commission() {
  const tbody = document.getElementById('p-commission-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  const allEmps = store.getEmployeesData().sort((a, b) => b.remitted - a.remitted);
  const emps = allEmps.filter(e => !e.isManager);
  const managers = allEmps.filter(e => e.isManager);

  const now = new Date().toLocaleDateString('th-TH', {day:'numeric', month:'long', year:'numeric'});
  const subtitle = document.getElementById('p-commission-subtitle');
  if (subtitle) subtitle.textContent = `แผนกลูกค้าธุรกิจ ปณฝ.กลาง 10501 — อัพเดท ณ วันที่ ${now}`;
  
  if (allEmps.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-light); border: 1px solid black; padding: 2rem;">ยังไม่มีข้อมูลพนักงาน</td></tr>';
    return;
  }
  
  let totalRemitted = 0;
  let totalCommission = 0;
  
  const renderRow = (emp) => {
    if (emp.remitted > 0) {
      totalRemitted += emp.remitted;
      totalCommission += emp.commission;
      
      const tr = document.createElement('tr');
      tr.style.height = '40px';
      tr.innerHTML = `
        <td style="border: 1px solid black; text-align: left; padding-left: 1rem;">${emp.name} ${emp.isManager ? '(หัวหน้า)' : ''}</td>
        <td style="border: 1px solid black; text-align: right; padding-right: 1rem;">${formatNum(emp.remitted)}</td>
        <td style="border: 1px solid black; text-align: right; padding-right: 1rem; font-weight: bold;">${formatNum(emp.commission)}</td>
        <td style="border: 1px solid black; text-align: center;"></td>
      `;
      tbody.appendChild(tr);
    }
  };

  // Render Subordinates
  emps.forEach(renderRow);

  // Add Subordinate Total Row
  if (managers.some(m => m.remitted > 0) && emps.some(e => e.remitted > 0)) {
     const subTr = document.createElement('tr');
     subTr.style.background = '#f3f4f6';
     subTr.style.height = '35px';
     subTr.innerHTML = `
      <td style="border: 1px solid black; text-align: center; color:#4b5563;">รวมเฉพาะทีมงาน</td>
      <td style="border: 1px solid black; text-align: right; padding-right: 1rem; color:#4b5563;">${formatNum(emps.reduce((s, e) => s + e.remitted, 0))}</td>
      <td style="border: 1px solid black; text-align: right; padding-right: 1rem; color:#4b5563;">${formatNum(emps.reduce((s, e) => s + e.commission, 0))}</td>
      <td style="border: 1px solid black; text-align: center;"></td>
     `;
     tbody.appendChild(subTr);
  }

  // Render Managers
  if (managers.some(m => m.remitted > 0)) {
    const mgrHeader = document.createElement('tr');
    mgrHeader.style.background = '#e5e7eb';
    mgrHeader.style.height = '35px';
    mgrHeader.innerHTML = `<td colspan="4" style="border: 1px solid black; text-align: center; font-weight: bold;">ส่วนของระดับหัวหน้า</td>`;
    tbody.appendChild(mgrHeader);
    managers.forEach(renderRow);
  }

  // Add total row
  const totalTr = document.createElement('tr');
  totalTr.style.background = '#dbeafe';
  totalTr.style.fontWeight = 'bold';
  totalTr.style.height = '45px';
  totalTr.innerHTML = `
    <td style="border: 1px solid black; text-align: center;">ยอดรวมทั้งหมด</td>
    <td style="border: 1px solid black; text-align: right; padding-right: 1rem;">${formatNum(totalRemitted)}</td>
    <td style="border: 1px solid black; text-align: right; padding-right: 1rem; font-size: 1.1rem;">${formatNum(totalCommission)}</td>
    <td style="border: 1px solid black; text-align: center;"></td>
  `;
  tbody.appendChild(totalTr);
}

function initPrintForm() {
  const dateStr = formatThaiDate(new Date());
  
  document.getElementById('c-date1').textContent = dateStr;
  document.getElementById('c-date2').textContent = dateStr;
  
  const overview = store.getOverview();
  document.getElementById('c-prev-qty').textContent = overview.masterRequested || '';
  document.getElementById('c-remit-accum').textContent = overview.masterRemitted || '0';
  
  document.getElementById('c-remit-qty').textContent = '';
  document.getElementById('p-sign-name').innerHTML = '(...........................................................)';
  document.getElementById('p-sign-date').textContent = dateStr;
  document.getElementById('c-req-qty').textContent = '';
  
  calcForm();
}

async function saveMasterTx() {
  const reqQty = parseInt(document.getElementById('c-req-qty').textContent.replace(/,/g, '')) || 0;
  const remitQty = parseInt(document.getElementById('c-remit-qty').textContent.replace(/,/g, '')) || 0;
  
  if (reqQty === 0 && remitQty === 0) {
    showToast('กรุณาระบุจำนวนที่ขอเบิก หรือ จำนวนที่นำส่ง อย่างน้อย 1 รายการ', 'warning');
    return;
  }
  
  const parseThaiDateStr = (dateStr) => {
    if (!dateStr) return new Date().toISOString();
    const cleanStr = dateStr.replace(/-/g, '/');
    const parts = cleanStr.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0]);
      const month = parseInt(parts[1]) - 1;
      let year = parseInt(parts[2]);
      if (year < 100) {
        if (year === 69) {
          year = 2569;
        } else if (year === 26) {
          year = 2026;
        } else if (year > 50) {
          year += 2500;
        } else {
          year += 2000;
        }
      }
      if (year >= 2500) year -= 543;
      return new Date(year, month, day).toISOString();
    }
    return new Date().toISOString();
  };
  
  const date1Str = document.getElementById('c-date1').textContent.trim();
  const date2Str = document.getElementById('c-date2').textContent.trim();
  
  if (await showConfirm('ยืนยันการบันทึกประวัติ (แผนก) เข้าสู่ระบบ?', 'ยืนยันการบันทึกข้อมูล')) {
    try {
      // Dry-run / Validation
      const overview = store.getOverview();
      if (reqQty > 0) {
        const newMasterRequested = overview.masterRequested + reqQty;
        if (newMasterRequested > overview.quota) {
          throw new Error(`ยอดเบิกสะสมรวม (${newMasterRequested} ฉบับ) เกินโควต้ารวมที่ได้รับจาก ปณ.กลาง (โควต้า ${overview.quota} ฉบับ)`);
        }
      }
      if (remitQty > 0) {
        const tempMasterRequested = overview.masterRequested + reqQty;
        const newMasterRemitted = overview.masterRemitted + remitQty;
        if (newMasterRemitted > tempMasterRequested) {
          throw new Error(`ยอดนำส่งเงินสะสมรวม (${newMasterRemitted} ฉบับ) เกินกว่ายอดเบิกสะสมของแผนก (${tempMasterRequested} ฉบับ)`);
        }
      }

      // Action
      if (reqQty > 0) store.addMasterTx('req', reqQty, parseThaiDateStr(date1Str));
      if (remitQty > 0) store.addMasterTx('remit', remitQty, parseThaiDateStr(date2Str));
      
      showToast('บันทึกข้อมูลเรียบร้อยแล้ว', 'success');
      renderAll();
      initPrintForm();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
}

function syncDates(sourceId) {
  const sourceVal = document.getElementById(sourceId).textContent;
  if (sourceId !== 'c-date1') document.getElementById('c-date1').textContent = sourceVal;
  if (sourceId !== 'c-date2') document.getElementById('c-date2').textContent = sourceVal;
  if (sourceId !== 'p-sign-date') document.getElementById('p-sign-date').textContent = sourceVal;
}

function renderA4Logbook() {
  const tbody = document.getElementById('p-a4-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  // Render exactly 20 blank rows for manual printing and writing
  const rowCount = 20;
  
  for (let i = 0; i < rowCount; i++) {
    const tr = document.createElement('tr');
    tr.style.height = '40px';

    tr.innerHTML = `
        <td style="border: 1px solid black; text-align: center;">${i + 1}</td>
        <td style="border: 1px solid black; text-align: center;" contenteditable="true"></td>
        <td style="border: 1px solid black; text-align: center; font-weight: 500;" contenteditable="true"></td>
        <td style="border: 1px solid black; text-align: center; font-weight: 600;" contenteditable="true"></td>
        <td style="border: 1px solid black;" contenteditable="true"></td>
        <td style="border: 1px solid black; font-size: 0.85rem; color: #333;" contenteditable="true"></td>
    `;
    tbody.appendChild(tr);
  }
}

// Transaction Deletion
async function deleteTx(txId) {
  if (await showConfirm('คุณแน่ใจหรือไม่ที่จะลบรายการนี้? (การลบจะดึงยอดกลับคืนอัตโนมัติ)', 'ยืนยันการลบรายการ')) {
    try {
      store.deleteTransaction(txId);
      renderAll();
      showToast('ลบรายการเรียบร้อยแล้ว', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
}
function printMasterTx(txId) {
  const txIndex = store.data.masterTransactions.findIndex(t => t.id === txId);
  if (txIndex === -1) return;
  const tx = store.data.masterTransactions[txIndex];
  
  let prevReq = 0;
  let prevRemit = 0;
  for (let i = 0; i < txIndex; i++) {
    const pastTx = store.data.masterTransactions[i];
    if (pastTx.type === 'req') prevReq += pastTx.qty;
    if (pastTx.type === 'remit') prevRemit += pastTx.qty;
  }
  
  // Find and click the "พิมพ์เอกสาร" nav button to switch tab
  const printBtn = document.querySelector('.nav-btn[data-view="print"]');
  if (printBtn) printBtn.click();
  
  switchPrintTab('1');
  
  // Populate the form fields manually
  const dateStr = formatThaiDate(tx.date);
  document.getElementById('c-date1').textContent = dateStr;
  document.getElementById('c-date2').textContent = dateStr;
  document.getElementById('p-sign-date').textContent = dateStr;
  
  document.getElementById('c-prev-qty').textContent = prevReq || '';
  document.getElementById('c-remit-accum').textContent = prevRemit || '0';
  
  if (tx.type === 'req') {
    document.getElementById('c-req-qty').textContent = tx.qty;
    document.getElementById('c-remit-qty').textContent = '';
    document.getElementById('p-sign-role').textContent = '(ผู้เบิก)';
    document.getElementById('p-sign-date-label').textContent = 'วันที่เบิก';
  } else {
    document.getElementById('c-req-qty').textContent = '';
    document.getElementById('c-remit-qty').textContent = tx.qty;
    document.getElementById('p-sign-role').textContent = '(ผู้นำส่ง)';
    document.getElementById('p-sign-date-label').textContent = 'วันที่นำส่ง';
  }
  
  // Trigger calculation
  calcForm();
  
  // Scroll to the form and highlight briefly
  setTimeout(() => {
    const el = document.getElementById('print-type-1');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
    const container = document.querySelector('#print-type-1 .print-container');
    if (container) {
      const oldBg = container.style.background || 'white';
      container.style.transition = 'background 0.5s';
      container.style.background = '#e0f2fe';
      setTimeout(() => { container.style.background = oldBg; }, 1000);
    }
  }, 100);
}

async function deleteMasterTx(txId) {
  if (await showConfirm('คุณแน่ใจหรือไม่ที่จะลบรายการประวัตินี้?', 'ยืนยันการลบประวัติแผนก')) {
    try {
      store.deleteMasterTx(txId);
      renderAll();
      showToast('ลบรายการประวัติแผนกเรียบร้อยแล้ว', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
}


// ===== EXPORT / IMPORT DATA =====
function exportData() {
  const json = JSON.stringify(store.data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
  a.download = `wpc_backup_${dateStr}.json`;
  a.href = url;
  a.click();
  URL.revokeObjectURL(url);

  // Toast notification
  showToast('✅ Export สำเร็จ! ไฟล์ถูกดาวน์โหลดแล้ว', 'success');
}

function importData(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!parsed.employees && !parsed.transactions) {
        throw new Error('ไฟล์ไม่ถูกต้อง');
      }
      if (!(await showConfirm(`นำเข้าข้อมูลจากไฟล์ "${file.name}"?\n\nระบบจะทำการอัพเดทข้อมูลที่มีอยู่ และเพิ่มข้อมูลใหม่\nข้อมูลเดิมที่ไม่มีในไฟล์นำเข้าจะยังคงอยู่`, 'ยืนยันการนำเข้าข้อมูล'))) {
        input.value = '';
        return;
      }
      
      const newData = { ...store.data };
      
      const mergeArray = (existingArr, importedArr) => {
        if (!importedArr) return existingArr || [];
        const newArr = [...(existingArr || [])];
        importedArr.forEach(importedItem => {
          const idx = newArr.findIndex(item => item.id === importedItem.id);
          if (idx >= 0) {
            newArr[idx] = { ...newArr[idx], ...importedItem };
          } else {
            newArr.push(importedItem);
          }
        });
        return newArr;
      };

      newData.employees = mergeArray(newData.employees, parsed.employees);
      newData.transactions = mergeArray(newData.transactions, parsed.transactions);
      newData.masterTransactions = mergeArray(newData.masterTransactions, parsed.masterTransactions);
      newData.gifts = mergeArray(newData.gifts, parsed.gifts);
      newData.giftAllocations = mergeArray(newData.giftAllocations, parsed.giftAllocations);
      
      if (parsed.quota !== undefined) newData.quota = parsed.quota;
      if (parsed.pricePerTicket !== undefined) newData.pricePerTicket = parsed.pricePerTicket;
      if (parsed.commissionRate !== undefined) newData.commissionRate = parsed.commissionRate;

      // Ensure each employee has paid/note fields
      newData.employees = newData.employees.map(emp => ({
        paid: false, note: '', ...emp
      }));
      
      store.data = newData;
      store.saveData();
      renderAll();
      initPrintForm();
      renderA4Logbook();
      showToast(`✅ Import สำเร็จ! อัพเดทข้อมูลเรียบร้อยแล้ว`, 'success');
    } catch(err) {
      showToast('❌ เกิดข้อผิดพลาด: ไฟล์ไม่ถูกต้องหรือเสียหาย', 'error');
      console.error(err);
    }
    input.value = '';
  };
  reader.readAsText(file, 'utf-8');
}

// Toast notification helper
function showToast(message, type = 'success') {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.style.cssText = `
      position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%) translateY(20px);
      padding: 0.75rem 1.5rem; border-radius: 12px; font-size: 0.95rem; font-weight: 600;
      font-family: 'Kanit', sans-serif; z-index: 9999; opacity: 0;
      transition: all 0.3s ease; box-shadow: 0 8px 24px rgba(0,0,0,0.2);
      max-width: 320px; text-align: center; white-space: nowrap;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.background = type === 'success' ? '#10b981' : '#ef4444';
  toast.style.color = 'white';
  toast.style.opacity = '1';
  toast.style.transform = 'translateX(-50%) translateY(0)';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
  }, 3000);
}

// Event Listeners
window.addEventListener('storeUpdated', renderAll);
window.addEventListener('storeUpdated', renderA4Logbook);

let currentHistoryFilter = 'all';

document.querySelectorAll('.history-tab').forEach(tab => {
  tab.addEventListener('click', (e) => {
    document.querySelectorAll('.history-tab').forEach(t => {
      t.classList.remove('active');
      t.style.background = 'transparent';
      t.style.color = 'var(--text-light)';
      t.style.boxShadow = 'none';
    });
    tab.classList.add('active');
    tab.style.background = 'var(--surface)';
    tab.style.color = 'var(--text-dark)';
    tab.style.boxShadow = 'var(--shadow-sm)';
    
    currentHistoryFilter = tab.getAttribute('data-filter');
    renderTransactions();
  });
});

function updateReturnQty() {
  if (editingTxId) return; // Don't auto-fill while editing
  const type = document.getElementById('tx-type').value;
  const empId = document.getElementById('tx-emp').value;
  const hintEl = document.getElementById('return-hint');
  
  if (type === 'return' && empId) {
    const emp = store.data.employees.find(e => e.id === empId);
    if (emp) {
      document.getElementById('tx-qty').value = emp.outstanding;
      document.getElementById('tx-value-calc').textContent = formatNum(emp.outstanding * store.data.pricePerTicket);
      if(hintEl) hintEl.style.display = 'block';
    }
  } else {
    if(hintEl) hintEl.style.display = 'none';
  }
}

document.getElementById('tx-emp').addEventListener('change', updateReturnQty);
document.getElementById('tx-type').addEventListener('change', updateReturnQty);

// Calculate value dynamically
document.getElementById('tx-qty').addEventListener('input', (e) => {
  const val = parseInt(e.target.value) || 0;
  document.getElementById('tx-value-calc').textContent = formatNum(val * store.data.pricePerTicket);
});

document.getElementById('form-add-emp').addEventListener('submit', (e) => {
  e.preventDefault();
  const nameInput = document.getElementById('input-emp-name');
  const nameVal = nameInput.value.trim();
  if (nameVal) {
    try {
      store.addEmployee(nameVal, false);
      nameInput.value = '';
      showToast('เพิ่มพนักงานเรียบร้อยแล้ว', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
});

let editingTxId = null;

function editTx(txId) {
  const tx = store.data.transactions.find(t => t.id === txId);
  if (!tx) return;
  
  editingTxId = tx.id;
  document.getElementById('tx-emp').value = tx.empId || tx.employeeId;
  const txTypeStr = tx.type === 'request' ? 'req' : tx.type;
  document.getElementById('tx-type').value = txTypeStr;
  
  const hintEl = document.getElementById('return-hint');
  if(hintEl) hintEl.style.display = 'none';

  document.getElementById('tx-qty').value = tx.qty || tx.quantity;
  
  const dStr = tx.date || '';
  if (txDatePicker) {
    txDatePicker.setDate(dStr.includes('T') ? dStr.split('T')[0] : dStr);
  } else {
    document.getElementById('tx-date').value = dStr.includes('T') ? dStr.split('T')[0] : dStr;
  }
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
  if (txDatePicker) txDatePicker.setDate(new Date()); else document.getElementById('tx-date').valueAsDate = new Date();
  document.getElementById('tx-value-calc').textContent = '0';
  
  const submitBtn = document.querySelector('#form-add-tx button[type="submit"]');
  submitBtn.textContent = 'บันทึกรายการ';
  submitBtn.classList.remove('btn-secondary');
  submitBtn.classList.add('btn-primary');
  
  const cancelBtn = document.getElementById('btn-cancel-edit');
  if (cancelBtn) cancelBtn.remove();
  
  const hintEl = document.getElementById('return-hint');
  if(hintEl) hintEl.style.display = 'none';
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
      try {
        if (editingTxId) {
          store.updateTransaction(editingTxId, type, empId, qty, date, evidenceUrl, requireSign);
          cancelEdit();
        } else {
          store.addTransaction(type, empId, qty, date, evidenceUrl || null, requireSign);
          document.getElementById('form-add-tx').reset();
          if (txDatePicker) txDatePicker.setDate(new Date()); else document.getElementById('tx-date').valueAsDate = new Date();
          document.getElementById('tx-value-calc').textContent = '0';
        }
        showToast('บันทึกรายการเรียบร้อยแล้ว', 'success');
      } catch (err) {
        showToast(err.message, 'error');
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
  } else {
    showToast('กรุณากรอกข้อมูลให้ครบถ้วน', 'warning');
  }
});

// Add Gift (Optional premium gifts management)
const formAddGift = document.getElementById('form-add-gift');
if (formAddGift) {
  formAddGift.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('gift-name').value.trim();
    const stock = parseInt(document.getElementById('gift-stock').value);

    if (name && stock > 0) {
      try {
        store.addGift(name, stock);
        formAddGift.reset();
        showToast('เพิ่มของสมมนาคุณเรียบร้อยแล้ว', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    } else {
      showToast('กรุณากรอกข้อมูลให้ครบถ้วน', 'warning');
    }
  });
}

// Allocate Gift (Optional premium gifts management)
const formAllocateGift = document.getElementById('form-allocate-gift');
if (formAllocateGift) {
  formAllocateGift.addEventListener('submit', (e) => {
    e.preventDefault();
    const empId = document.getElementById('alloc-emp').value;
    const giftId = document.getElementById('alloc-gift').value;
    const qty = parseInt(document.getElementById('alloc-qty').value);

    if (empId && giftId && qty > 0) {
      try {
        store.allocateGift(empId, giftId, qty);
        formAllocateGift.reset();
        showToast('จัดสรรของสมมนาคุณเรียบร้อยแล้ว', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    } else {
      showToast('กรุณากรอกข้อมูลให้ครบถ้วน', 'warning');
    }
  });
}

// Initialize Date Pickers to today
if (txDatePicker) txDatePicker.setDate(new Date()); else document.getElementById('tx-date').valueAsDate = new Date();

// Close share modal on backdrop click
document.getElementById('share-text-modal').addEventListener('click', function(e) {
  if (e.target === this) this.style.display = 'none';
});

// Initial Render
renderAll();
initPrintForm();
renderA4Logbook();

// Print Function
function switchPrintTab(type) {
  // Hide all layouts
  document.querySelectorAll('.print-layout').forEach(el => el.style.display = 'none');
  // Show selected layout
  document.getElementById('print-type-' + type).style.display = 'block';
  
  // Update active state on tab buttons
  for (let i = 1; i <= 3; i++) {
    const btn = document.getElementById('btn-tab-type' + i);
    if (!btn) continue;
    if (i.toString() === type) {
      btn.className = 'btn btn-primary';
      btn.style = '';
    } else {
      btn.className = 'btn btn-secondary';
      btn.style = 'background: white; color: var(--text-dark); border: 1px solid var(--border);';
    }
  }
}
// --- LOGBOOK IMAGE LOGIC ---
const LOGBOOK_KEY = 'world_cup_tracker_logbook_img';
const logbookInput = document.getElementById('logbook-image-input');
const logbookPreviewCont = document.getElementById('logbook-image-preview-container');
const logbookGallery = document.getElementById('logbook-gallery');

function getLogbookImages() {
  const data = localStorage.getItem(LOGBOOK_KEY);
  if (data) {
    try {
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [data];
    } catch (e) {
      return [data];
    }
  }
  return [];
}

function saveLogbookImages(images) {
  try {
    localStorage.setItem(LOGBOOK_KEY, JSON.stringify(images));
    if (typeof isFirebaseEnabled !== 'undefined' && isFirebaseEnabled && firebaseDb) {
      firebaseDb.ref('tracker_images').set(images).catch(e => console.error(e));
    }
  } catch (err) {
    console.error(err);
    showToast('ไม่สามารถบันทึกรูปภาพได้ (พื้นที่หน่วยความจำอาจเต็ม)', 'error');
  }
}

function loadLogbookImage() {
  if (!logbookGallery) return;
  const images = getLogbookImages();
  if (images.length > 0) {
    logbookGallery.innerHTML = '';
    images.forEach((src, index) => {
      const wrapper = document.createElement('div');
      wrapper.style.position = 'relative';
      const img = document.createElement('img');
      img.src = src;
      img.style.width = '100%';
      img.style.height = '80px';
      img.style.objectFit = 'cover';
      img.style.borderRadius = '4px';
      img.style.cursor = 'pointer';
      img.style.border = '1px solid #ccc';
      img.style.userSelect = 'none';
      img.style.webkitUserSelect = 'none';
      img.style.webkitTouchCallout = 'none'; // Prevent iOS context menu
      
      let pressTimer;
      let isLongPress = false;
      
      const startPress = () => {
        isLongPress = false;
        pressTimer = setTimeout(async () => {
          isLongPress = true;
          if (await showConfirm('ต้องการลบรูปภาพนี้ใช่หรือไม่?', 'ยืนยันการลบรูปภาพ')) {
            removeLogbookImage(index);
          }
        }, 3000);
      };
      
      const cancelPress = () => {
        clearTimeout(pressTimer);
      };
      
      img.addEventListener('mousedown', startPress);
      img.addEventListener('touchstart', startPress, {passive: true});
      img.addEventListener('mouseup', cancelPress);
      img.addEventListener('mouseleave', cancelPress);
      img.addEventListener('touchend', cancelPress);
      img.addEventListener('touchcancel', cancelPress);
      
      // Prevent default context menu
      img.oncontextmenu = (e) => e.preventDefault();

      img.onclick = (e) => {
        if (isLongPress) {
          e.preventDefault();
          return;
        }
        // Simple zoom view
        const w = window.open('');
        w.document.write(`<img src="${src}" style="max-width:100%;"><br><button onclick="window.close()">ปิด</button>`);
      };
      
      wrapper.appendChild(img);
      logbookGallery.appendChild(wrapper);
    });
    logbookPreviewCont.style.display = 'block';
  } else {
    logbookPreviewCont.style.display = 'none';
  }
}

function removeLogbookImage(index) {
  const images = getLogbookImages();
  images.splice(index, 1);
  saveLogbookImages(images);
  loadLogbookImage();
}

function clearAllLogbookImages() {
  localStorage.removeItem(LOGBOOK_KEY);
  if (typeof isFirebaseEnabled !== 'undefined' && isFirebaseEnabled && firebaseDb) {
    firebaseDb.ref('tracker_images').set([]).catch(e => console.error(e));
  }
  if (logbookInput) logbookInput.value = '';
  loadLogbookImage();
  showToast('ลบรูปถ่ายทะเบียนคุมทั้งหมดแล้ว', 'success');
}

// Generate simple hash from base64 string
function hashCode(str) {
  let hash = 0;
  for (let i = 0, len = str.length; i < len; i++) {
      let chr = str.charCodeAt(i);
      hash = (hash << 5) - hash + chr;
      hash |= 0;
  }
  return hash;
}

if (logbookInput) {
  logbookInput.addEventListener('change', function(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    
    let currentImages = getLogbookImages();
    let currentHashes = currentImages.map(src => hashCode(src));
    let processed = 0;
    let duplicateCount = 0;
    
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = function(evt) {
        const img = new Image();
        img.onload = function() {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1000;
          const MAX_HEIGHT = 1400;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
          } else {
            if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
          const newHash = hashCode(dataUrl);
          
          if (currentHashes.includes(newHash)) {
            duplicateCount++;
          } else {
            currentImages.push(dataUrl);
            currentHashes.push(newHash);
          }
          
          processed++;
          if (processed === files.length) {
            saveLogbookImages(currentImages);
            loadLogbookImage();
            if (duplicateCount > 0) {
              showToast(`บันทึกสำเร็จ แต่ข้ามรูปซ้ำ ${duplicateCount} รูป`, 'warning');
            } else {
              showToast('บันทึกรูปถ่ายทะเบียนคุมทั้งหมดแล้ว', 'success');
            }
          }
        };
        img.src = evt.target.result;
      };
      reader.readAsDataURL(file);
    });
  });
  
  loadLogbookImage();
}
  