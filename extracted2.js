
let tempMasterRemitData = null;

function openMasterAllocationModal(remitQty, date2Str, reqQty, date1Str) {
  const modal = document.getElementById('master-allocation-modal');
  const inner = modal.querySelector('div');
  
  tempMasterRemitData = { remitQty, date2Str, reqQty, date1Str };
  
  document.getElementById('master-alloc-target').textContent = formatNum(remitQty);
  document.getElementById('master-alloc-total').textContent = formatNum(remitQty);
  
  const unallocatedList = store.getUnallocatedRemittances();
  const tbody = document.getElementById('master-alloc-tbody');
  tbody.innerHTML = '';
  
  if (unallocatedList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--text-light); padding: 1rem;">ไม่มีพนักงานที่มียอดค้างจัดสรร</td></tr>';
  } else {
    // Auto-fill logic
    let remainingToFill = remitQty;
    
    unallocatedList.forEach((item, index) => {
      let autoFill = 0;
      if (remainingToFill > 0) {
        autoFill = Math.min(remainingToFill, item.unallocatedQty);
        remainingToFill -= autoFill;
      }
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding: 0.5rem; white-space: nowrap;">${item.name}</td>
        <td style="padding: 0.5rem; text-align: center; font-weight: bold; color: var(--primary);">${formatNum(item.unallocatedQty)}</td>
        <td style="padding: 0.5rem; text-align: center;">
          <input type="number" class="alloc-input form-control" data-emp-id="${item.empId}" data-max="${item.unallocatedQty}" value="${autoFill > 0 ? autoFill : ''}" min="0" max="${item.unallocatedQty}" oninput="updateMasterAllocTotal()" style="width: 80px; text-align: center; margin: 0 auto; padding: 4px;">
        </td>
      `;
      tbody.appendChild(tr);
    });
  }
  
  updateMasterAllocTotal();
  
  modal.style.display = 'flex';
  // Trigger reflow
  modal.offsetWidth;
  modal.style.opacity = '1';
  inner.style.transform = 'scale(1)';
}

function closeMasterAllocationModal() {
  const modal = document.getElementById('master-allocation-modal');
  const inner = modal.querySelector('div');
  modal.style.opacity = '0';
  inner.style.transform = 'scale(0.9)';
  setTimeout(() => {
    modal.style.display = 'none';
    tempMasterRemitData = null;
  }, 200);
}

function updateMasterAllocTotal() {
  const inputs = document.querySelectorAll('.alloc-input');
  let currentTotal = 0;
  inputs.forEach(input => {
    let val = parseInt(input.value) || 0;
    const max = parseInt(input.getAttribute('data-max')) || 0;
    if (val > max) {
      val = max;
      input.value = max;
    }
    if (val < 0) {
      val = 0;
      input.value = '';
    }
    currentTotal += val;
  });
  
  const currentEl = document.getElementById('master-alloc-current');
  currentEl.textContent = formatNum(currentTotal);
  
  const targetQty = tempMasterRemitData ? tempMasterRemitData.remitQty : 0;
  const btn = document.getElementById('btn-save-master-allocation');
  
  if (currentTotal === targetQty) {
    currentEl.style.color = '#15803d'; // Green
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
  } else {
    currentEl.style.color = '#dc2626'; // Red
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.style.cursor = 'not-allowed';
  }
}

function confirmMasterAllocation() {
  if (!tempMasterRemitData) return;
  
  const inputs = document.querySelectorAll('.alloc-input');
  let currentTotal = 0;
  const allocations = [];
  
  inputs.forEach(input => {
    const val = parseInt(input.value) || 0;
    if (val > 0) {
      currentTotal += val;
      allocations.push({
        empId: input.getAttribute('data-emp-id'),
        qty: val
      });
    }
  });
  
  if (currentTotal !== tempMasterRemitData.remitQty) {
    showToast('ยอดจัดสรรไม่ตรงกับยอดที่ต้องการนำส่ง', 'error');
    return;
  }
  
  try {
    store.addMasterTx('remit', tempMasterRemitData.remitQty, tempMasterRemitData.date2Str, allocations);
    showToast('บันทึกรายการนำส่งเรียบร้อยแล้ว', 'success');
    renderAll();
    initPrintForm();
    closeMasterAllocationModal();
  } catch(e) {
    showToast(e.message, 'error');
  }
}
