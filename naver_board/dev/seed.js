(function(){
  const LEAD='lead@mymp.co.kr', A='a@mymp.co.kr', C='c@mymp.co.kr';
  window.__USER=LEAD; setup();
  insert_('팀원',{'이메일':A,'이름':'팀원A','역할':'팀원','담당자명':'팀원A','사용':'Y'});
  insert_('팀원',{'이메일':C,'이름':'팀원C','역할':'팀원','담당자명':'팀원C','사용':'Y'});
  update_('팀원','이메일',LEAD,{'이름':'팀장','담당자명':'팀장'});
  update_('설정','키','솔루션폴더ID',{'값':'https://drive.google.com/drive/folders/abc'});
  const T=today_();
  const run=(u,a,p)=>{ window.__USER=u; const r=JSON.parse(api(a,p)); if(!r.ok) throw new Error(a+': '+r.error); return r.data; };
  run(LEAD,'noticeSave',{type:'팀장 공지',title:'11월 마감 일정 안내',body:'이번 달 매출 마감은 28일입니다.\n세금계산서 요청은 7일까지.',important:true});
  run(LEAD,'noticeSave',{type:'회사 공지',title:'연말 보안 점검',body:'PC 보안 점검이 있습니다. https://example.com'});
  const g1=run(A,'goalSave',{period:'주',base:T,category:'블로그 포스팅',title:'광고주 사례 블로그',target:5,unit:'편',plan:'월·수·금 오전 작성'});
  const g2=run(A,'goalSave',{period:'월',base:T,category:'광고매출',title:'11월 네이버 매출',target:30000000,unit:'원',plan:'신규 3곳 세팅 완료'});
  run(A,'goalSave',{period:'분기',base:T,category:'영상 제작',title:'쇼츠 영상 제작',target:12,unit:'개',plan:'격주 2편'});
  run(LEAD,'goalReview',{id:g1,decision:'승인'}); run(LEAD,'goalReview',{id:g2,decision:'승인'});
  const g4=run(C,'goalSave',{period:'주',base:T,category:'계정 맵핑',title:'신규 계정 맵핑',target:4,unit:'건',plan:'인바운드 문의 당일 처리'});
  run(LEAD,'goalReview',{id:g4,decision:'승인'});
  // 과거 일일 체크를 직접 넣기 (오늘 이전 근무일)
  const goals=rows_('목표');
  goals.filter(g=>g['상태']==='승인').forEach(g=>{
    for(let d=g['시작일']; d<T; d=addDays_(d,1)){ if(!isWorkday_(d)) continue;
      const fail=Math.random()<0.3, daily=num_(g['목표수치'])/workdays_(g['시작일'],g['종료일']);
      insert_('일일체크',{id:uid_(),'목표id':g.id,'이메일':g['이메일'],'날짜':d,'결과':fail?'실패':'달성','실적':fail?0:Math.round(daily),'실패사유':fail?'광고주 긴급 요청 대응':'', '소통완료':fail&&Math.random()<0.5?'Y':'','기록시각':d+' 18:00'}); }
  });
  run(LEAD,'eventSave',{type:'팀',title:'주간 회의',start:T,end:T,time:'10:00'});
  run(LEAD,'eventSave',{type:'프로모션',title:'블프 프로모션',start:addDays_(T,2),end:addDays_(T,6)});
  run(A,'eventSave',{type:'미팅',title:'OO광고주 미팅',start:addDays_(T,1),end:addDays_(T,1),time:'14:00'});
  run(A,'eventSave',{type:'개인',title:'반차',start:addDays_(T,3),end:addDays_(T,3)});
  // 실적 데이터 (doPost 로 넣기)
  const media=['네이버','네이버GFA','쿠팡','지마켓'];
  const advs=[]; for(let i=0;i<40;i++) advs.push({id:'C'+(1000+i),name:'광고주'+i,media:media[i%4],mgr:['팀원A','팀원C','팀장'][i%3],base:20000+Math.random()*300000,start:Math.floor(Math.random()*7),stop:Math.random()<0.15?Math.floor(Math.random()*3):99});
  const months=[]; const cm=monthOf_(T); for(let i=6;i>=0;i--) months.push(addMonths_(cm,-i));
  const mrows=[]; months.forEach((m,mi)=>advs.forEach(a=>{ if(mi<a.start) return; if(a.stop<99 && mi>6-a.stop) return; mrows.push({'월':m,'담당자':a.mgr,'매체':a.media,'광고주ID':a.id,'광고주명':a.name,'매출':Math.round(a.base*30*(0.8+Math.random()*0.4))}); }));
  const drows=[]; const dates=[]; for(let i=1;i<=62;i++){ const d=addDays_(T,-i); dates.push(d); advs.forEach(a=>{ const mi=months.indexOf(monthOf_(d)); if(mi<a.start) return; let v=a.base*(0.7+Math.random()*0.6); if(a.id==='C1003'&&i===1) v=0; if(a.id==='C1006'&&i===1) v*=0.3; drows.push({'날짜':d,'담당자':a.mgr,'매체':a.media,'광고주ID':a.id,'광고주명':a.name,'매출':Math.round(v)}); }); }
  window.__USER=LEAD; const tok=JSON.parse(api('alertCode',{})).data.code; update_('설정','키','제외계정',{'값':'C1001, C1002'}); update_('설정','키','절반반영계정',{'값':'C1004'}); update_('설정','키','VAT포함매체',{'값':'네이버'});
  const res=JSON.parse(doPost({postData:{contents:JSON.stringify({code:tok,daily:{dates,rows:drows},monthly:{months,rows:mrows}})}}).text);
  console.log('doPost', JSON.stringify(res));
  const bad=JSON.parse(doPost({postData:{contents:JSON.stringify({code:'x'})}}).text); console.log('badtoken', JSON.stringify(bad));
  // 같은 날짜 재전송해도 중복 안 되는지
  const res2=JSON.parse(doPost({postData:{contents:JSON.stringify({code:tok,daily:{dates:dates.slice(0,2),rows:drows.filter(r=>dates.slice(0,2).includes(r['날짜']))}})}}).text);
  console.log('resend', JSON.stringify(res2));

  // 인트라넷 보충 테스트
  const itok=settings_()['수집토큰'];
  const im=['11번가','11번가전시입찰','카카오','에이블리','네이버'];
  const irows=[]; dates.forEach((d,di)=>im.forEach((m,j)=>irows.push({'날짜':d,'담당자':'팀원A','매체':m,'광고주ID':'I'+j,'광고주명':'인트라'+j,'매출':100000})));
  const ir=JSON.parse(doPost({postData:{contents:JSON.stringify({token:itok,daily:{dates,rows:irows}})}}).text);
  const cnt=()=>{const r=rows_('실적_일별'); return {intra:r.filter(x=>x['출처']==='인트라넷').length, media:[...new Set(r.filter(x=>x['출처']==='인트라넷').map(x=>x['매체']))].join('/'), mpai:r.filter(x=>x['출처']!=='인트라넷').length};};
  console.log('member intra-post', JSON.stringify(ir), JSON.stringify(cnt()));
  // MP AI 재전송해도 인트라넷 행 유지
  doPost({postData:{contents:JSON.stringify({code:tok,daily:{dates:dates.slice(0,2),rows:drows.filter(r=>dates.slice(0,2).includes(r['날짜']))}})}});
  console.log('member after-mpai-resend', JSON.stringify(cnt()));
  window.__USER='a@mymp.co.kr';
  const before=JSON.parse(api('perf',{})).data;
  const m11=x=>(x.daily.media.find(m=>m.media==='11번가')||{}).last||0;
  // MP AI가 어제 11번가를 주기 시작
  doPost({postData:{contents:JSON.stringify({code:tok,daily:{dates:[dates[0]],rows:drows.filter(r=>r['날짜']===dates[0]).concat([{'날짜':dates[0],'담당자':'팀원A','매체':'11번가','광고주ID':'M11','광고주명':'엠피11','매출':55000}])}})}});
  const after=JSON.parse(api('perf',{})).data;
  console.log('member dedupe', JSON.stringify({before11:m11(before), after11:m11(after), migrated:after.migrated, supplement:after.supplement}));

  // 인트라넷 근태·외근
  const T0=today_();
  const sc={from:addDays_(T0,-31),to:addDays_(T0,62),rows:[
    {'유형':'외근','제목':'팀원A 외근 · OO상사','시작일':T0,'종료일':T0,'시간':'14:00~16:00','대상':'팀원A','메모':'신규 / 강남'},
    {'유형':'근태','제목':'팀원C 연차','시작일':addDays_(T0,1),'종료일':addDays_(T0,2),'시간':'','대상':'팀원C','메모':''},
    {'유형':'개인','제목':'팀원C 지각','시작일':T0,'종료일':T0,'시간':'09:50~10:16','대상':'팀원C','메모':''}]};
  const s1=JSON.parse(doPost({postData:{contents:JSON.stringify({token:itok,schedules:sc})}}).text);
  const s2=JSON.parse(doPost({postData:{contents:JSON.stringify({token:itok,schedules:sc})}}).text);
  const s3=JSON.parse(doPost({postData:{contents:JSON.stringify({code:tok,schedules:sc})}}).text);
  const vis=u=>{ window.__USER=u; return JSON.parse(api('calendar',{month:monthOf_(T0)})).data.events.filter(e=>e.intra).map(e=>e.title).join('|'); };
  console.log('member sched', JSON.stringify({first:s1.schedules, again:s2.schedules, viaLeadCode:s3.schedules||'무시', intraRows:rows_('일정').filter(e=>e['작성자']==='인트라넷').length,
    A:vis('a@mymp.co.kr'), C:vis('c@mymp.co.kr'), lead:vis(LEAD)}));
  window.__USER=LEAD; const ev=rows_('일정').find(e=>e['작성자']==='인트라넷'); api('eventDelete',{id:ev.id});
  console.log('member delete-blocked', rows_('일정').filter(e=>e['작성자']==='인트라넷').length);

  // MP AI 매체 공지
  window.__NOTICES = window.__NOTICES || [];
  window.__CALLS=0; const mn=JSON.parse(doPost({postData:{contents:JSON.stringify({code:tok,mediaNotices:window.__NOTICES})}}).text);
  const c1=window.__CALLS; window.__CALLS=0; const mn2=JSON.parse(doPost({postData:{contents:JSON.stringify({code:tok,mediaNotices:window.__NOTICES})}}).text);
  const c2=window.__CALLS; console.log('member calls', JSON.stringify({first:c1, again:c2}));
  window.__USER='c@mymp.co.kr';
  const ml=JSON.parse(api('mediaNoticeList',{})).data;
  const b0=JSON.parse(api('badges',{})).data.unread;
  const need=ml.filter(n=>n.needAck);
  if(need.length) api('noticeAck',{ids:[need[0].id]});
  const b1=JSON.parse(api('badges',{})).data.unread;
  const cal=JSON.parse(api('calendar',{month:monthOf_(today_())})).data.mediaDeadlines.length;
  const cal12=JSON.parse(api('calendar',{month:addMonths_(monthOf_(today_()),1)})).data.mediaDeadlines.length;
  console.log('member media', JSON.stringify({saved:mn.mediaNotices, again:mn2.mediaNotices, rows:rows_('매체공지').length, shown:ml.length, media:[...new Set(ml.map(n=>n.media))].join('/'), needAck:need.length, unreadBefore:b0, unreadAfter:b1, calThis:cal, calNext:cal12, alerts:alerts_(JSON.parse(api('alertCode',{})).data.code).unread.length}));

  // 영업노트·할일·이용 기록 테스트 데이터
  (function(){
    const A='a@mymp.co.kr', T=today_(), N=now_();
    const R=(u,a,p)=>{ window.__USER=u; const r=JSON.parse(api(a,p)); if(!r.ok) throw new Error(a+': '+r.error); return r.data; };
    const hhmm=(m)=>{ const d=new Date(Date.now()+9*3600e3+m*60000); return d.toISOString().slice(11,16); };
    // 기존 영업노트 앱의 시트(영업노트_DB)를 흉내: 가망건·연락이력
    const mk=(name,rows)=>{ const sh=new SpreadsheetApp.__Sheet('NOTE:'+name); sh.d=rows; window.__SHEETS['NOTE:'+name]=sh; };
    const H=['ID','등록일시','영업자이메일','영업자','업체명','담당자','연락처','이메일','업종','가망도','상태','다음연락일','연락시간','메모','최근연락일','수정일시'];
    const D=(n)=>addDays_(T,n);
    const L=(id,co,g,st,nd,nt,memo,who)=>[id,D(-10)+' 10:00:00',who||A,who?'다른사람':'가나',co,'김대표','010-1111-2222','',  '식품',g,st,nd,nt,memo||'',D(-3),D(-1)+' 12:00:00'];
    mk('가망건',[H,
      L('N1','바른김치','상','연락중',T,hhmm(-30),'SA 직접 운영, 비용 부담 얘기함'),
      L('N2','달빛캔들','상','제안발송',D(-3),'14:00','제안서 회신 대기'),
      L('N3','숲속농원','중','신규',D(2),'10:00'),
      L('N4','푸른수산','중','연락중',D(-1),''),
      L('N5','하늘꽃집','하','미팅',D(5),'15:00'),
      L('N6','해든빵집','하','신규','',''),
      L('N7','계약된곳','상','계약',D(-5),'10:00'),
      L('N8','남의업체','상','연락중',T,'09:00','', 'c@mymp.co.kr')]);
    mk('연락이력',[['ID','가망건ID','업체명','일시','영업자이메일','영업자','방식','내용','다음연락일','연락시간'],
      ['H1','N1','바른김치',D(-3)+' 11:00:00',A,'가나','통화','첫 통화',T,'10:00'],
      ['H2','N2','달빛캔들',T+' 09:10:00',A,'가나','이메일','제안서 발송','','']]);
    // 인트라넷 신규/이관(목표 자동 집계용)
    const an=members_().find(m=>m.email===A).name;
    blobWrite_('newbiz', JSON.stringify({rows:[
      {날짜:addDays_(T,-1),구분:'신규',상태:'완료',마케터:an},{날짜:T,구분:'신규',상태:'완료',마케터:an},
      {날짜:addDays_(T,-1),구분:'신규',상태:'완료',마케터:'다른사람'}]}));
    const l1='N1'; if (window.__CACHE) delete window.__CACHE.noteDb; MEMO_ = {};
    window.__L1=l1;
    R(A,'taskSave',{kind:'관리',title:'비즈머니 잔액 확인',repeat:'매일',time:'09:30'});
    R(A,'taskSave',{kind:'영업',title:'신규 DB 20곳 통화',repeat:'평일'});
    R(A,'taskSave',{kind:'관리',title:'제외키워드 점검',repeat:'매주',repeatValue:['일','월','화','수','목','금','토'][dt_(T).getUTCDay()]});
    R(A,'taskSave',{kind:'영업',title:'지난주 제안서 회신 확인',repeat:'없음',due:addDays_(T,-1)});
    const t5=R(A,'taskSave',{kind:'관리',title:'월말 정산 요청',repeat:'매월',repeatValue:Number(T.slice(8))});
    R(A,'taskDone',{id:t5});
    // 어제 이용 기록(저장소) → 오늘 첫 요청 때 시트로 옮겨지는지
    window.__PROPS['U|'+addDays_(T,-1)+'|'+A]=JSON.stringify({f:'09:01',l:'18:20','접속':4,'실적':2,'영업노트':5});
    delete window.__PROPS['U|flushed']; // 실제로는 어제 기록이 오늘 첫 요청보다 먼저 있음
  })();

  // 광고 관리 테스트 데이터: 가짜 SA 점검 결과(팀장 담당 5개 + 팀원A 1개 + 광고비 없는 계정 1개)와 메모
  (function(){
    const T=today_(), Y=addDays_(T,-1);
    const acc=(i,name,owner,o)=>Object.assign({ customerId:String(3000000+i), adAccountNo:String(900000+i), accessManagerAccountNo:'77001', name:name, owners:[owner],
      memberAccess:{}, alerts:[], yesterday:130000, avg7:128000, last7Avg:130000, monthAvg:126000, monthSpend:126000*Number(Y.slice(8)), lastMonthAvg:120000,
      roas7:482, roas14:455, roasLastMonth:520, roasMonth:470, last7Spend:910150, last14Spend:1770150, lastMonthSpend:3720000,
      purchase:{ last7:{amt:4386900,cnt:61}, last14:{amt:8054000,cnt:118}, last_month:{amt:19344000,cnt:270}, month:{amt:15990000,cnt:230} },
      campaignPerf:[], budgetHits:[], bizmoney:2400000, lastEdit:addDays_(T,-2)+' 16:20', lastEditWhat:{label:'캠페인 쇼핑검색_주력상품',path:'/sa/campaigns/cmp-a001-01'}, daysSinceEdit:2 }, o);
    const camps=[
      {id:'cmp-a001-01',name:'쇼핑검색_주력상품',type:'SHOPPING',avg7:70000,avgLM:60000,roas7:310,roasLM:540,convLoss:40000},
      {id:'cmp-a001-02',name:'파워링크_브랜드',type:'WEB_SITE',avg7:40000,avgLM:42000,roas7:820,roasLM:760,convLoss:-5000},
      {id:'cmp-a001-03',name:'파워링크_일반키워드',type:'WEB_SITE',avg7:18000,avgLM:15000,roas7:0,roasLM:210,convLoss:4000},
      {id:'cmp-a001-04',name:'쇼핑검색_신상품',type:'SHOPPING',avg7:900,avgLM:0,roas7:null,roasLM:null,convLoss:0}];
    const data={ baseDate:Y, accounts:[
      acc(1,'가상_캠핑용품','팀장',{ campaignPerf:camps, budgetHits:[{id:'cmp-a001-02',name:'파워링크_브랜드',budget:50000,hitDays:4,days:[],lastHit:Y,limitedNow:false,avgHitTime:'15시'}] }),
      acc(2,'가상_꽃집','팀장',{ bizmoney:95000, avg7:60000, last7Avg:61000, yesterday:58000, alerts:[{type:'bizmoney',level:'urgent',text:'비즈머니 95,000원, 약 1.6일분 남음'}] }),
      acc(3,'가상_반려용품','팀장',{ yesterday:21000, avg7:90000, alerts:[{type:'drop',level:'warn',text:'어제 21,000원, 7일 평균 90,000원 대비 77% 감소'}], accessManagerAccountNo:'' }),
      acc(4,'가상_커피원두 스토어(이름이 아주 긴 계정 예시입니다)','팀장',{ daysSinceEdit:12, lastEdit:addDays_(T,-12)+' 10:00', roas7:640, roasLastMonth:610, last7Spend:null, last14Spend:null, lastMonthSpend:null, roasMonth:null }),
      acc(5,'가상_가구','팀장',{ roas7:910, roasLastMonth:700, roasMonth:880 }),
      acc(6,'가상_휴면계정','팀장',{ yesterday:0, avg7:0, last7Avg:0, monthAvg:0, monthSpend:0, roas7:null, daysSinceEdit:null, lastEdit:null }),
      acc(7,'가상_팀원A계정','팀원A',{}) ] };
    data.accounts.forEach(a=>{ Object.keys(a).forEach(k=>{ if(a[k]===null) delete a[k]; }); });
    blobWrite_('sa', JSON.stringify(data));
    const R=(u,a,p)=>{ window.__USER=u; const r=JSON.parse(api(a,p)); if(!r.ok) throw new Error(a+': '+r.error); return r.data; };
    R(LEAD,'adMemoSave',{cid:'3000001',name:'가상_캠핑용품',kind:'조정 이유',text:'파워링크_일반키워드 시즌 종료 대비',date:T});
    R(LEAD,'adMemoSave',{cid:'3000001',name:'가상_캠핑용품',kind:'통화',text:'대표님 통화, 다음달 신상품 입고 예정',date:addDays_(T,-3)});
    R(LEAD,'adMemoSave',{cid:'3000001',name:'가상_캠핑용품',kind:'다음 계획',text:'주말 데이터 좀더 지켜보고 월요일에 말씀드리겠습니다.',date:T});
  })();
  window.__USER='a@mymp.co.kr'; const acode=JSON.parse(api('alertCode',{})).data.code;
  console.log('membercode', doPost({postData:{contents:JSON.stringify({code:acode,daily:{dates:[],rows:[]}})}}).text);
  const d=rows_('실적_일별'); const raw=drows.filter(r=>r['날짜']===dates[0]);
  const chk=id=>[raw.find(r=>r['광고주ID']===id), d.find(r=>r['광고주ID']===id&&r['날짜']===dates[0])];
  const [r0,s0]=chk('C1000'), [r4,s4]=chk('C1004'), [r5,s5]=chk('C1005');
  console.log('rules', JSON.stringify({excluded:!d.some(r=>r['광고주ID']==='C1001'), naverVat:[r0['매출'],s0['매출'],r0['매체']], half:[r4['매출'],s4['매출'],r4['매체']], coupang:[r5['매출'],s5['매출'],r5['매체']], last:settings_()['마지막수집']}));
  window.__USER=window.__AS||LEAD;
})();
