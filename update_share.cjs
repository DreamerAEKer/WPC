const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

const regex = /\/\/ Make the snapshot layout lighter[\s\S]*?snapEl\.innerHTML = `[\s\S]*?`;/m;

const newCode = `// Make the snapshot layout lighter and more vibrant
  snapEl.style.background = 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)';
  snapEl.style.color = '#1e2937';
  snapEl.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)';
  snapEl.style.border = '1px solid #cbd5e1';
  snapEl.style.width = '720px'; // Wide aspect ratio
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
    
    let outstandingHtml = emp.outstanding > 0 ? \\\`<div style="font-size: 0.95rem; color: #ef4444; margin-top: 0.4rem; background: rgba(255,255,255,0.8); padding: 2px 8px; border-radius: 6px; font-weight: bold;">รอส่ง: \\\${formatNum(emp.outstanding)}</div>\\\` : '';
    
    podiumCardsHtml += \\\`
      <div style="
        background: \\\${sz.bg};
        border: 2px solid \\\${sz.border};
        border-radius: 24px;
        padding: 1.5rem 1rem 1.2rem;
        text-align: center;
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-end;
        min-height: \\\${sz.height};
        position: relative;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
      ">
        <div style="font-size: 2.2rem; margin-bottom: 0.4rem;">\\\${rankMedals[idx]}</div>
        <div style="font-size: 1.6rem; font-weight: 800; color: \\\${sz.nameColor}; margin-bottom: 0.5rem; line-height: 1.2;">\\\${emp.name}</div>
        <div style="font-size: \\\${sz.numSize}; font-weight: 900; color: \\\${sz.numColor}; line-height: 1; letter-spacing: -2px;">\\\${formatNum(emp.requested)}</div>
        <div style="font-size: 1rem; color: \\\${sz.labelColor}; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; margin-top: 0.3rem;">ใบ</div>
        <div style="font-size: 0.95rem; color: \\\${sz.labelColor}; margin-top: 0.8rem; background: rgba(255,255,255,0.5); padding: 2px 8px; border-radius: 6px; font-weight: bold;">ส่งเงิน: \\\${formatNum(emp.remitted)}</div>
        \\\${outstandingHtml}
      </div>\\\`;
  });

  let restHtml = '';
  rest.forEach((emp, i) => {
    let outstandingHtml = emp.outstanding > 0 ? \\\`<span style="color: #ef4444; margin-left: 0.5rem;">รอส่ง: \\\${formatNum(emp.outstanding)}</span>\\\` : '';
    
    restHtml += \\\`
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
        <div style="font-size: 1.6rem; font-weight: 800; width: 40px; text-align: center; color: #94a3b8;">\\\${i+4}</div>
        <div style="flex: 1;">
          <div style="font-weight: 800; font-size: 1.7rem; color: #1e2937;">\\\${emp.name}</div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 2.2rem; font-weight: 900; line-height: 1; color: #4f46e5;">\\\${formatNum(emp.requested)}</div>
          <div style="font-size: 0.8rem; opacity: 0.6; text-transform: uppercase; color: #64748b;">ใบ</div>
          <div style="font-size: 1.05rem; color: #10b981; font-weight: 700; margin-top: 0.4rem;">ส่งเงิน: \\\${formatNum(emp.remitted)} \\\${outstandingHtml}</div>
        </div>
      </div>\\\`;
  });

  // Render managers at the bottom of snapshot list
  let snapshotManagerHtml = '';
  if (managers.length > 0) {
    managers.forEach(mgr => {
      let outstandingHtml = mgr.outstanding > 0 ? \\\`<span style="color: #ef4444; margin-left: 0.5rem;">รอส่ง: \\\${formatNum(mgr.outstanding)}</span>\\\` : '';
      snapshotManagerHtml += \\\`
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
            <div style="font-weight: 800; font-size: 1.7rem; color: #1e2937;">\\\${mgr.name}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 2.2rem; font-weight: 900; line-height: 1; color: #64748b;">\\\${formatNum(mgr.requested)}</div>
            <div style="font-size: 0.8rem; opacity: 0.6; text-transform: uppercase; color: #64748b;">ใบ</div>
            <div style="font-size: 1.05rem; color: #10b981; font-weight: 700; margin-top: 0.4rem;">ส่งเงิน: \\\${formatNum(mgr.remitted)} \\\${outstandingHtml}</div>
          </div>
        </div>\\\`;
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

    return \\\`
      <div style="
        display: flex;
        gap: 0.6rem;
        margin-top: 1rem;
        flex-wrap: wrap;
      ">
        <div style="background: rgba(255, 255, 255, 0.2); padding: 0.6rem 1rem; border-radius: 12px; font-weight: bold; font-size: 1.3rem;">📦 \\\${boxes} กล่อง</div>
        <div style="background: rgba(255, 255, 255, 0.2); padding: 0.6rem 1rem; border-radius: 12px; font-weight: bold; font-size: 1.3rem;">✉️ \\\${packs} ก้อน (ก้อนละ 100 ใบ)</div>
        \\\${singleSheets > 0 ? \\\`<div style="background: rgba(255, 255, 255, 0.2); padding: 0.6rem 1rem; border-radius: 12px; font-weight: bold; font-size: 1.3rem;">📄 \\\${singleSheets} ใบ</div>\\\` : ''}
      </div>
    \\\`;
  };

  // Calculate total money remitted
  const totalRemittedMoney = overview.totalRemitted * store.data.pricePerTicket;

  // Render stock motivator in snapshot image (Clean green look)
  let snapshotMotivatorHtml = \\\`
    <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 24px; padding: 1.8rem 1.8rem; margin-bottom: 1.8rem; display: flex; flex-direction: column; color: white; box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.1);">
      <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
        <div>
          <div style="font-size: 1.3rem; font-weight: bold; opacity: 0.9;">🔥 ไปรษณียบัตรคงเหลือในแผนก:</div>
          <div style="font-size: 3.4rem; font-weight: 900; margin-top: 0.2rem; line-height: 1;">\\\${formatNum(totalStockRemaining)} <span style="font-size: 1.6rem; font-weight: normal;">ใบ</span></div>
        </div>
        <div style="font-size: 3.2rem; opacity: 0.8;">📦</div>
      </div>
      \\\${getStockStatsHtml(totalStockRemaining)}
      
      <div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px dashed rgba(255,255,255,0.3); display: flex; justify-content: space-between;">
        <div>
          <div style="font-size: 1.25rem; opacity: 0.9;">ยอดรวมพนักงานเบิก:</div>
          <div style="font-size: 2rem; font-weight: 800;">\\\${formatNum(overview.totalRequested)} <span style="font-size: 1.25rem; font-weight: normal;">ใบ</span></div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 1.25rem; opacity: 0.9;">ส่งเงินแล้ว:</div>
          <div style="font-size: 2rem; font-weight: 800; color: #fde68a;">\\\${formatNum(overview.totalRemitted)} <span style="font-size: 1.25rem; font-weight: normal; color: white;">ใบ</span> <span style="font-size: 1.6rem;">(\\\${formatNum(totalRemittedMoney)} บาท)</span></div>
        </div>
      </div>
    </div>
  \\\`;

  snapEl.innerHTML = \\\`
    <div style="text-align:center; margin-bottom: 1.8rem;">
      <div style="font-size: 2.2rem; font-weight: 900; letter-spacing: -0.5px; color: #1e2937;">🏆 อันดับยอดเบิกสะสม</div>
      <div style="font-size: 1.15rem; font-weight: 500; opacity: 0.75; margin-top: 0.4rem; color: #475569;">ฟุตบอลระดับโลก 2026 — \\\${now}</div>
    </div>
    \\\${snapshotMotivatorHtml}
    <div style="display: flex; gap: 1rem; align-items: flex-end; margin-bottom: 1.8rem;">\\\${podiumCardsHtml}</div>
    \\\${restHtml}
    \\\${snapshotManagerHtml}
    <div style="text-align:center; margin-top: 2rem; font-size: 1rem; opacity: 0.6; color: #475569;">แผนกลูกค้าธุรกิจ ปณฝ.กลาง 10501</div>
  \\\`;`;

if (regex.test(content)) {
  content = content.replace(regex, newCode);
  fs.writeFileSync('index.html', content);
  console.log('Update successful');
} else {
  console.log('Regex did not match');
}
