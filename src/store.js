// src/store.js

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
    // Commission is based on REMITTED sales, or REQUESTED? "จากรายได้ ที่แต่ละคนขายได้" -> usually based on remitted money.
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
  addTransaction(type, empId, qty, dateStr) {
    const amount = qty * this.data.pricePerTicket;
    this.data.transactions.push({
      id: Date.now().toString(),
      type,
      empId,
      qty,
      amount,
      date: dateStr || new Date().toISOString()
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

export const store = new Store();
