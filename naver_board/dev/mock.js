// 앱스 스크립트 흉내 (테스트 전용)
(function(){
  const store = (window.__SHEETS = window.__SHEETS || {});
  function Range(sh, r, c, nr, nc){ this.sh=sh; this.r=r; this.c=c; this.nr=nr; this.nc=nc; }
  Range.prototype.getValues=function(){ window.__CALLS=(window.__CALLS||0)+1; const out=[]; for(let i=0;i<this.nr;i++){ const row=[]; for(let j=0;j<this.nc;j++){ const v=(this.sh.d[this.r-1+i]||[])[this.c-1+j]; row.push(v===undefined?'':v);} out.push(row);} return out; };
  Range.prototype.setValues=function(v){ window.__CALLS=(window.__CALLS||0)+1; for(let i=0;i<v.length;i++){ this.sh.d[this.r-1+i]=this.sh.d[this.r-1+i]||[]; for(let j=0;j<v[i].length;j++) this.sh.d[this.r-1+i][this.c-1+j]=v[i][j]; } return this; };
  Range.prototype.setValue=function(v){ return this.setValues([[typeof v==='string'&&v[0]==="'"?v.slice(1):v]]); };
  Range.prototype.setFontWeight=function(){return this}; Range.prototype.setNumberFormat=function(){return this};
  Range.prototype.clearContent=function(){ for(let i=0;i<this.nr;i++){ const row=this.sh.d[this.r-1+i]; if(row) for(let j=0;j<this.nc;j++) row[this.c-1+j]=''; } this.sh.trim(); return this; };
  function Sheet(name){ this.name=name; this.d=[]; }
  Sheet.prototype.trim=function(){ while(this.d.length && !this.d[this.d.length-1].some(x=>x!==''&&x!==undefined)) this.d.pop(); };
  Sheet.prototype.getLastRow=function(){ this.trim(); return this.d.length; };
  Sheet.prototype.getLastColumn=function(){ return this.d.reduce((m,r)=>Math.max(m,r.length),0); };
  Sheet.prototype.getRange=function(r,c,nr,nc){ if(typeof r==='string') return new Range(this,1,1,0,0); return new Range(this,r,c,nr||1,nc||1); };
  Sheet.prototype.getDataRange=function(){ return new Range(this,1,1,this.getLastRow(),this.getLastColumn()); };
  Sheet.prototype.appendRow=function(row){ window.__CALLS=(window.__CALLS||0)+1; this.trim(); this.d.push(row.map(v=>typeof v==='string'&&v[0]==="'"?v.slice(1):v)); };
  Sheet.prototype.deleteRow=function(i){ window.__CALLS=(window.__CALLS||0)+1; this.d.splice(i-1,1); };
  Sheet.prototype.setFrozenRows=function(){};
  window.SpreadsheetApp={ getActive:()=>({ getSheetByName:n=>store[n]||null, insertSheet:n=>(store[n]=new Sheet(n)) }),
    // 다른 스프레드시트(영업노트_DB): 'NOTE:시트이름' 으로 보관
    openById:id=>({ getSheetByName:n=>store['NOTE:'+n]||null, getSheets:()=>[store['GUIDESRC']] }), __Sheet:Sheet };
  const CACHE=(window.__CACHE=window.__CACHE||{});
  window.CacheService={ getScriptCache:()=>({ get:k=>CACHE[k]===undefined?null:CACHE[k], put:(k,v)=>{CACHE[k]=v;}, remove:k=>{delete CACHE[k];} }) };
  function kst(d){ return new Date(d.getTime()+9*3600e3); }
  const p2=n=>('0'+n).slice(-2);
  window.Utilities={ formatDate:(d,tz,f)=>{ const k=kst(window.__NOW?new Date(window.__NOW):d===undefined?new Date():d); const k2=kst(d); const x=k2; return f.replace('yyyy',x.getUTCFullYear()).replace('MM',p2(x.getUTCMonth()+1)).replace('dd',p2(x.getUTCDate())).replace('HH',p2(x.getUTCHours())).replace('mm',p2(x.getUTCMinutes())).replace(/^H$/,String(x.getUTCHours())); },
    getUuid:()=>([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,c=>(c^Math.random()*16>>c/4).toString(16)) };
  window.Session={ getActiveUser:()=>({ getEmail:()=>window.__USER }) };
  window.LockService={ getScriptLock:()=>({ waitLock(){}, tryLock(){ return true; }, releaseLock(){} }) };
  const PROPS = (window.__PROPS = window.__PROPS || {});
  window.PropertiesService={ getScriptProperties:()=>({ getProperty:k=>PROPS[k]===undefined?null:PROPS[k], setProperty:(k,v)=>{PROPS[k]=String(v);},
    deleteProperty:k=>{delete PROPS[k];}, getProperties:()=>Object.assign({},PROPS) }) };
  window.__TRIG=window.__TRIG||[]; window.__FETCH=window.__FETCH||[];
  window.ScriptApp={ getService:()=>({ getUrl:()=>'https://script.google.com/macros/s/TEST/exec' }),
    getProjectTriggers:()=>window.__TRIG.map(f=>({ getHandlerFunction:()=>f })),
    newTrigger:(f)=>({ timeBased:()=>({ everyMinutes:()=>({ create:()=>{ window.__TRIG.push(f); } }) }) }) };
  window.UrlFetchApp={ fetch:(url,o)=>{ window.__FETCH.push({url,o}); const code=window.__FETCH_CODE||(url.indexOf('/dispatches')>0?204:200);
    return { getResponseCode:()=>code, getContentText:()=>JSON.stringify({default_branch:'main-test'}) }; } };
  window.ContentService={ MimeType:{JSON:'json'}, createTextOutput:t=>({ text:t, setMimeType(){ return this; } }) };
  function F(name,days,size){ const d=new Date(Date.now()-days*864e5); return { getId:()=>name.replace(/\W/g,''), getName:()=>name, getLastUpdated:()=>d, getSize:()=>size, getUrl:()=>'https://drive.google.com/file/d/'+name, getDescription:()=>'' }; }
  function it(a){ let i=0; return { hasNext:()=>i<a.length, next:()=>a[i++] }; }
  const FILES = (window.__FILES = window.__FILES || {}); let fid = 0;
  const mkFile = (id) => ({ getId: () => id, setContent: (t) => { FILES[id] = t; }, getBlob: () => ({ getDataAsString: () => FILES[id] }) });
  window.DriveApp_files = { createFile: (n, t) => { const id = 'f' + (++fid); FILES[id] = t; return mkFile(id); },
    getFileById: (id) => { if (!(id in FILES)) throw new Error('no file'); return mkFile(id); } };
  window.DriveApp={ getFilesByName:(n)=>it(n==='원보드_매체가이드'&&store['GUIDESRC']?[{ getId:()=>'GUIDESRC', getLastUpdated:()=>new Date(0) }]:n==='영업노트_DB'?[{ getId:()=>'NOTEDB', getMimeType:()=>'application/vnd.google-apps.spreadsheet', getLastUpdated:()=>new Date() }]:[]), createFile: (...a) => window.DriveApp_files.createFile(...a), getFileById: (id) => window.DriveApp_files.getFileById(id), getFolderById:()=>({ getUrl:()=>'https://drive.google.com/drive/folders/X',
    getFiles:()=>it([F('키워드추출기_v1.2.zip',30,120000),F('키워드추출기_v1.3.zip',2,130000),F('6팀 일일점검 가이드.pdf',10,800000)]),
    getFolders:()=>it([{ getName:()=>'스마트스토어 진단 확장', getFiles:()=>it([F('smartstore-audit-1.0.zip',40,50000),F('smartstore-audit-1.1.zip',5,52000)]) }]) }) };
  // google.script.run 흉내: 실제 Code.gs 의 함수를 비동기로 호출
  function runner(ok,fail){ return new Proxy({}, { get(_,k){ if(k==='withSuccessHandler') return f=>runner(f,fail); if(k==='withFailureHandler') return f=>runner(ok,f);
    return (...a)=>{ if(window.__NET&&k==='api') window.__NET.push(a[0]); setTimeout(()=>{ try{ const r=window[k](...a); ok&&ok(r);}catch(e){ console.error(e); fail&&fail(e);} },window.__DELAY||5); }; } }); }
  window.google={ script:{ run:runner(), url:{ getLocation:cb=>cb({parameter:{tab:window.__TAB||''},hash:''}) } } };
})();
;(function(){ window.__CALLS=0; const R=Object.getPrototypeOf(SpreadsheetApp.getActive().insertSheet('__x')); })();
