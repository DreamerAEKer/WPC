// src/store.js

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
    this.data = this.loadData();
  }

  loadData() {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (!parsed.masterTransactions) parsed.masterTransactions = [];
        return { ...defaultData, ...parsed };
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
      if (t.type === 'remit') totalRemitted += t.qty;
    });
    
    let masterRequested = 0;
    let masterRemitted = 0;
    this.data.masterTransactions.forEach(t => {
      if (t.type === 'req') masterRequested += t.qty;
      if (t.type === 'remit') masterRemitted += t.qty;
    });

    const masterRemainingQuota = this.data.quota - masterRequested;
    const masterOutstanding = masterRequested - masterRemitted;
    
    // Remaining quota for employees is what the Head requested minus what employees requested
    const remainingQuota = masterRequested - totalRequested;

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
      totalCommission,
      masterRequested,
      masterRemitted,
      masterRemainingQuota,
      masterOutstanding
    };
  }

  // --- Master Transactions ---
  addMasterTx(type, qty, dateStr, allocations = []) {
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
      date: dateStr || new Date().toISOString(),
      allocations: type === 'remit' ? (allocations || []) : []
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

  getUnallocatedRemittances() {
    const employeesData = this.getEmployeesData();
    const allocationsByEmp = {};
    
    // Sum all allocations inside master transactions
    this.data.masterTransactions.forEach(mt => {
      if (mt.type === 'remit' && Array.isArray(mt.allocations)) {
        mt.allocations.forEach(alloc => {
          if (!allocationsByEmp[alloc.empId]) allocationsByEmp[alloc.empId] = 0;
          allocationsByEmp[alloc.empId] += alloc.qty;
        });
      }
    });

    const unallocated = [];
    employeesData.forEach(emp => {
      const allocatedQty = allocationsByEmp[emp.id] || 0;
      const unallocatedQty = emp.paidQty - allocatedQty;
      
      if (unallocatedQty > 0) {
        unallocated.push({
          empId: emp.id,
          name: emp.name,
          unallocatedQty
        });
      }
    });
    
    return unallocated;
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
        const requested = this.data.transactions
          .filter(t => t.empId === empId && t.type === 'req')
          .reduce((sum, t) => sum + t.qty, 0);
        emp.paidAmount = paid ? (requested * this.data.pricePerTicket) : 0;
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
      let tickedReqQty = 0;

      this.data.transactions.filter(t => (t.empId || t.employeeId) === emp.id).forEach(t => {
        const qty = t.qty || t.quantity;
        if (t.type === 'req' || t.type === 'request') {
          requested += qty;
          if (t.isPaidDirectly) {
            tickedReqQty += qty;
          }
        }
        if (t.type === 'remit') remitted += qty;
        if (t.type === 'return') returned += qty;
      });

      // Total cards that are considered paid (either by remit form or by ticking the req)
      const totalPaidQty = remitted + tickedReqQty;
      const outstanding = requested - totalPaidQty - returned;
      
      const revenue = totalPaidQty * this.data.pricePerTicket;
      const commission = revenue * this.data.commissionRate;
      
      const paidAmount = typeof emp.paidAmount === 'number' ? emp.paidAmount : (emp.paid ? revenue : 0);
      const isPaid = paidAmount >= revenue && revenue > 0;

      return {
        ...emp,
        requested,
        remitted,
        paidQty: totalPaidQty,
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
    } else if (type === 'remit') {
      const empData = this.getEmployeesData().find(e => e.id === empId);
      const outstanding = empData ? empData.outstanding : 0;
      if (qty > outstanding) {
        throw new Error(`จำนวนนำส่ง (${qty} ฉบับ) เกินกว่ายอดค้างส่งของพนักงานคนนี้ (ค้างส่งอยู่ ${outstanding} ฉบับ)`);
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
      const oldReqQty = tx.type === 'req' ? tx.qty : 0;
      const remainingQuotaEx = overview.remainingQuota + oldReqQty;
      if (qty > remainingQuotaEx) {
        throw new Error(`ยอดไปรษณียบัตรในมือหัวหน้าแผนกไม่เพียงพอ (คงเหลือในมือหัวหน้าแผนก ${remainingQuotaEx} ฉบับ)`);
      }
    } else if (type === 'remit') {
      let empReq = 0;
      let empRemit = 0;
      this.data.transactions.forEach(t => {
        if (t.empId === empId && t.id !== txId) {
          if (t.type === 'req') empReq += t.qty;
          if (t.type === 'remit') empRemit += t.qty;
        }
      });
      const outstandingEx = empReq - empRemit;
      if (qty > outstandingEx) {
        throw new Error(`จำนวนที่นำส่ง (${qty} ฉบับ) เกินกว่ายอดค้างส่งของพนักงานคนนี้ (ค้างส่งอยู่ ${outstandingEx} ฉบับ)`);
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

export const store = new Store();
