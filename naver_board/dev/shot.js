const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const dir = process.argv[2];
  const errs = [];
  for (const who of ['lead','a']) {
    for (const vp of [{w:1280,h:900,n:'d'},{w:390,h:844,n:'m'}]) {
      const p = await b.newPage({ viewport: { width: vp.w, height: vp.h } });
      p.on('console', m => { if (m.type()==='error' || m.text().match(/^(doPost|rules|member)/)||m.type()==='warning'||m.text().startsWith('bad')||m.text().startsWith('resend')) errs.push(`[${who}${vp.n}] ${m.text()}`); });
      p.on('pageerror', e => errs.push(`[${who}${vp.n}] PAGEERR ${e.message}`));
      await p.goto('file://' + require('path').resolve(dir) + `/board_${who}.html`);
      await p.waitForTimeout(800);
      await p.screenshot({ path: `${dir}/${who}_${vp.n}_popup.png` });
      await p.evaluate(()=>closeModal());
      const tabs = await p.$$eval('.tab', t => t.map(x => x.textContent));
      if (vp.n==='d') errs.push(`[${who}] tabs: ${tabs.join(' | ')}`);
      for (const id of ['perf','ad','plan','notice','solution','guide','calendar','admin']) {
        const has = await p.evaluate(id => B.tabs.some(t=>t.id===id), id);
        if (!has) continue;
        await p.evaluate(id => go(id), id);
        await p.waitForTimeout(400);
        if (id==='calendar') { await p.evaluate(()=>{ST.calDay=B.today;viewCalendar();}); await p.waitForTimeout(300); }
        await p.screenshot({ path: `${dir}/${who}_${vp.n}_${id}.png`, fullPage: true });
        const ov = await p.evaluate(()=>document.documentElement.scrollWidth - window.innerWidth);
        if (ov>0) errs.push(`[${who}${vp.n}] ${id} 가로 넘침 ${ov}px`);
      }
      await p.close();
    }
  }
  console.log(errs.join('\n'));
  await b.close();
})();
