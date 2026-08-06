
'use strict';
const KEY='attendancePwaV6',LEGACY_KEY='attendancePwaV5',OLDER_KEY='attendancePwaV4',AUTH_KEY=KEY+'.authHash',SESSION_KEY=KEY+'.sessionUntil',SESSION_DAYS=30;
const defaults={version:6,settings:{fiscalYear:new Date().getFullYear(),fiscalStartMonth:4,fiscalStartDay:21,cutoffDay:20,annualHolidayTarget:110,standardHours:8,baseBreak:1,extraBreak:.25,extraBreakAfter:'18:00',roundMinutes:15,roundStart:'切上',roundEnd:'切捨',earlyStart:'05:00',normalStart:'08:30',normalEnd:'17:30',nightStart:'22:00',monthOtLimit:45,yearOtLimit:360},records:{},calendar:{}};
let state=load(),dialogDate='',editDate='',deferredPrompt=null,applyingCloudState=false;
const $=id=>document.getElementById(id),pad=n=>String(n).padStart(2,'0');
function load(){try{const raw=JSON.parse(localStorage.getItem(KEY)||localStorage.getItem(LEGACY_KEY)||localStorage.getItem(OLDER_KEY)||'{}');return{version:6,settings:Object.assign({},defaults.settings,raw.settings||{}),records:raw.records||{},calendar:raw.calendar||{}}}catch{return structuredClone(defaults)}}
function persist(){
  try{
    state.version=6;
    const text=JSON.stringify(state);
    localStorage.setItem(KEY,text);
    const check=localStorage.getItem(KEY);
    if(check!==text)throw new Error('保存内容の照合に失敗しました');
    if(!applyingCloudState){
      window.dispatchEvent(new CustomEvent('attendance-local-change',{detail:structuredClone(state)}))
    }
    return true
  }catch(e){
    console.error(e);
    alert('ブラウザへの保存に失敗しました：'+e.message);
    return false
  }
}
function iso(d=new Date()){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function parseIso(k){const [y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d)}
function hm(d=new Date()){return `${pad(d.getHours())}:${pad(d.getMinutes())}`}
function mins(t){if(!t)return null;const [h,m]=t.split(':').map(Number);return h*60+m}
function duration(a,b){let x=mins(a),y=mins(b);if(x==null||y==null)return 0;if(y<x)y+=1440;return(y-x)/60}
function roundTime(t,u,mode){if(!t)return'';let v=mins(t),unit=Math.max(1,+u||1),r=mode==='切上'?Math.ceil(v/unit)*unit:mode==='切捨'?Math.floor(v/unit)*unit:Math.round(v/unit)*unit;r=((r%1440)+1440)%1440;return`${pad(Math.floor(r/60))}:${pad(r%60)}`}
function overlap(start,end,bs,be){let s=mins(start),e=mins(end),a=mins(bs),b=mins(be);if([s,e,a,b].some(v=>v==null))return 0;if(e<s)e+=1440;if(b<=a)b+=1440;return(Math.max(0,Math.min(e,b)-Math.max(s,a))+Math.max(0,Math.min(e,b+1440)-Math.max(s,a+1440)))/60}
function safeDate(y,m,d){const last=new Date(y,m+1,0).getDate();return new Date(y,m,Math.min(Math.max(1,d),last))}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function closingDateOnOrAfter(start,cutoff){const same=safeDate(start.getFullYear(),start.getMonth(),cutoff);return same>=start?same:safeDate(start.getFullYear(),start.getMonth()+1,cutoff)}
function buildPeriods(s=state.settings){const y=+s.fiscalYear,m=Math.min(12,Math.max(1,+s.fiscalStartMonth||4)),day=Math.min(31,Math.max(1,+s.fiscalStartDay||21)),cut=Math.min(31,Math.max(1,+s.cutoffDay||20));let start=safeDate(y,m-1,day);const arr=[];for(let i=0;i<12;i++){const end=closingDateOnOrAfter(start,cut);arr.push({index:i,start:new Date(start),end:new Date(end),label:`${start.getMonth()+1}月度`,range:`${start.getFullYear()}/${start.getMonth()+1}/${start.getDate()}～${end.getFullYear()}/${end.getMonth()+1}/${end.getDate()}`});start=addDays(end,1)}return arr}
function fiscalBounds(){const p=buildPeriods();return[p[0].start,p[11].end]}
function periodForDate(d){return buildPeriods().find(p=>d>=p.start&&d<=p.end)||null}
function allKeys(){const[a,b]=fiscalBounds(),arr=[];for(let d=new Date(a);d<=b;d.setDate(d.getDate()+1))arr.push(iso(d));return arr}
function defaultHoliday(d){if(d.getDay()===0)return{type:'法定休日',name:''};if(d.getDay()===6)return{type:'所定休日',name:''};return{type:'勤務日',name:''}}
function holidayFor(k){return state.calendar[k]||defaultHoliday(parseIso(k))}
function calcRecord(k,r={}){const s=state.settings,rs=roundTime(r.start,s.roundMinutes,s.roundStart),re=roundTime(r.end,s.roundMinutes,s.roundEnd),isWork=['出勤','休日出勤'].includes(r.type),extra=(r.end&&r.start&&(mins(r.end)<mins(r.start)||mins(r.end)>=mins(s.extraBreakAfter)))?+s.extraBreak:0,br=isWork?(+s.baseBreak+extra):0,outside=duration(r.out,r.back),work=Math.max(0,duration(rs,re)-br-outside),standard=r.type==='出勤'?+s.standardHours:0,overtime=Math.max(0,work-standard);let early=overlap(rs,re,s.earlyStart,s.normalStart),evening=overlap(rs,re,s.normalEnd,s.nightStart),night=overlap(rs,re,s.nightStart,s.earlyStart);if(r.out&&r.back){early=Math.max(0,early-overlap(r.out,r.back,s.earlyStart,s.normalStart));evening=Math.max(0,evening-overlap(r.out,r.back,s.normalEnd,s.nightStart));night=Math.max(0,night-overlap(r.out,r.back,s.nightStart,s.earlyStart))}const hol=holidayFor(k),holidayWork=isWork&&hol.type!=='勤務日'?work:0,compEarn=r.type==='休日出勤'&&holidayWork>0?1:0,compUse=r.type==='代休'?1:0;return{rs,re,breakHours:br,outside,work,standard,overtime,early,evening,night,holidayWork,compEarn,compUse,hol}}
function stats(){let comp=0,yearOt=0,holidayWorkDays=0,planned=0;const months=buildPeriods().map(p=>({label:p.label,range:p.range,work:0,ot:0,holidayWork:0,comp:0}));for(const k of allKeys()){const c=calcRecord(k,state.records[k]||{});if(c.hol.type!=='勤務日')planned++;comp+=c.compEarn-c.compUse;yearOt+=c.overtime;if(c.compEarn)holidayWorkDays++;const p=periodForDate(parseIso(k));if(p){const m=months[p.index];m.work+=c.work;m.ot+=c.overtime;m.holidayWork+=c.compEarn;m.comp=comp}}const used=Object.values(state.records).filter(r=>r.type==='代休').length;return{comp,yearOt,holidayWorkDays,planned,actualHoliday:planned-holidayWorkDays+used,months}}
function formRecord(){return{type:$('workType').value,start:$('start').value,end:$('end').value,out:$('out').value,back:$('back').value,note:$('note').value}}
function previewToday(){const c=calcRecord(iso(),formRecord());$('todayBreak').textContent=c.breakHours.toFixed(2)+'h';$('todayOutside').textContent=c.outside.toFixed(2)+'h';$('todayWork').textContent=c.work.toFixed(2)+'h';$('todayOt').textContent=c.overtime.toFixed(2)+'h';$('todayBands').textContent=`${c.early.toFixed(2)} / ${c.evening.toFixed(2)} / ${c.night.toFixed(2)}h`}
function loadTodayForm(){const r=state.records[iso()]||{type:'出勤'};$('workType').value=r.type||'出勤';['start','end','out','back','note'].forEach(id=>$(id).value=r[id]||'');previewToday()}
function renderTodayMetrics(){const st=stats(),p=periodForDate(new Date()),m=p?st.months[p.index]:{ot:0};$('todayLabel').textContent=new Intl.DateTimeFormat('ja-JP',{dateStyle:'full'}).format(new Date());$('metricComp').textContent=st.comp.toFixed(1)+'日';$('metricMonthOt').textContent=m.ot.toFixed(1)+'h';$('metricYearOt').textContent=st.yearOt.toFixed(1)+'h';$('todayPeriod').textContent=p?`${p.label}　${p.range}`:'本日は設定年度の範囲外です'}
function renderDashboard(){const st=stats(),limit=+state.settings.yearOtLimit||360;$('dashComp').textContent=st.comp.toFixed(1)+'日';$('dashPlanned').textContent=st.planned+'日';$('dashHolidayWork').textContent=st.holidayWorkDays+'日';$('dashActualHoliday').textContent=st.actualHoliday+'日';$('yearOtBar').style.width=Math.min(100,st.yearOt/limit*100)+'%';$('yearOtText').textContent=`${st.yearOt.toFixed(1)} / ${limit} h（残り ${(limit-st.yearOt).toFixed(1)} h）`;$('monthRows').innerHTML=st.months.map(m=>`<tr><td>${m.label}<br><small>${m.range}</small></td><td>${m.work.toFixed(1)}</td><td>${m.ot.toFixed(1)}</td><td>${m.holidayWork}</td><td>${m.comp.toFixed(1)}</td></tr>`).join('')}
function renderCalendar(){const val=$('calendarMonth').value||iso().slice(0,7);$('calendarMonth').value=val;const[y,m]=val.split('-').map(Number),first=new Date(y,m-1,1),start=new Date(y,m-1,1-first.getDay()),cells=[];for(let i=0;i<42;i++){const d=new Date(start);d.setDate(start.getDate()+i);const k=iso(d),h=holidayFor(k),cls=d.getMonth()!==m-1?'outside':h.type==='勤務日'?'work':'holiday';cells.push(`<button class="day ${cls}" data-date="${k}"><b>${d.getDate()}</b><small>${h.name||h.type}</small></button>`)}$('calendarGrid').innerHTML=cells.join('');document.querySelectorAll('.day').forEach(b=>b.onclick=()=>openHoliday(b.dataset.date))}
function ledgerTypeOptions(selected){
  const options=['','出勤','休日出勤','公休','有休','代休','特休'];
  return options.map(v=>`<option value="${v}"${v===selected?' selected':''}>${v||'未入力'}</option>`).join('')
}
function escapeAttr(v){return String(v??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;')}
function saveRecord(date,record){const clean={type:record.type||'',start:record.start||'',end:record.end||'',out:record.out||'',back:record.back||'',note:record.note||'',updatedAt:new Date().toISOString()};const hasInput=[clean.type,clean.start,clean.end,clean.out,clean.back,clean.note].some(v=>String(v).trim()!=='');if(hasInput)state.records[date]=clean;else delete state.records[date];if(!persist())return false;try{const stored=JSON.parse(localStorage.getItem(KEY)||'{}');const ok=hasInput?Boolean(stored.records&&stored.records[date]):!(stored.records&&stored.records[date]);if(!ok)throw new Error('保存後の確認に失敗しました');return true}catch(e){console.error(e);alert('保存確認に失敗しました：'+e.message);return false}}
function isMobileLedger(){return window.matchMedia('(max-width:720px)').matches}
function ledgerEntries(){return document.querySelectorAll('[data-ledger-entry][data-date]')}
function updateLedgerCalculations(){
  let comp=0;
  for(const k of allKeys()){
    const c=calcRecord(k,state.records[k]||{});
    comp+=c.compEarn-c.compUse;
    document.querySelectorAll(`[data-ledger-entry][data-date="${k}"]`).forEach(entry=>{
      const work=entry.querySelector('[data-calc="work"]');
      const ot=entry.querySelector('[data-calc="ot"]');
      const compEl=entry.querySelector('[data-calc="comp"]');
      if(work)work.textContent=c.work.toFixed(2);
      if(ot)ot.textContent=c.overtime.toFixed(2);
      if(compEl)compEl.textContent=comp.toFixed(1)
    })
  }
}
function markRowDirty(entry){
  entry.classList.remove('saved-ok','ledger-card-save-flash');
  entry.classList.add('dirty');
  const b=entry.querySelector('.save-ledger-row');
  const status=entry.querySelector('.ledger-card-status');
  if(b){b.textContent='保存';b.classList.remove('saved')}
  if(status)status.textContent='未保存'
}
function bindLedgerEntries(){
  ledgerEntries().forEach(entry=>{
    entry.querySelectorAll('input,select,textarea').forEach(el=>{
      el.addEventListener('input',()=>markRowDirty(entry));
      el.addEventListener('change',()=>markRowDirty(entry))
    });
    const save=entry.querySelector('.save-ledger-row');
    const clear=entry.querySelector('.clear-ledger-row');
    if(save)save.onclick=()=>saveLedgerRow(entry);
    if(clear)clear.onclick=()=>clearLedgerRow(entry)
  })
}
function periodCompBalances(){
  const balances={};let comp=0;
  for(const k of allKeys()){
    const c=calcRecord(k,state.records[k]||{});
    comp+=c.compEarn-c.compUse;
    balances[k]=comp
  }
  return balances
}
function holidayClass(type){
  if(type==='所定休日')return'holiday-scheduled';
  if(type==='法定休日')return'holiday-statutory';
  if(type==='会社休業日')return'holiday-company';
  return'holiday-workday'
}
function calendarBadge(type){
  const map={
    '勤務日':['calendar-workday','勤務日'],
    '所定休日':['calendar-scheduled','所定休日'],
    '法定休日':['calendar-statutory','法定休日'],
    '会社休業日':['calendar-company','会社休業日']
  };
  const [cls,label]=map[type]||map['勤務日'];
  return`<span class="status-badge ${cls}">会社：${label}</span>`
}
function workBadge(type){
  if(!type)return'<span class="status-badge work-empty">実績：未入力</span>';
  return`<span class="status-badge work-${type}">実績：${type}</span>`
}
function compWarningBadge(c){
  return c.compEarn>0?'<span class="status-badge comp-warning">代休 +1日</span>':''
}
function desktopLedgerRow(k,d,r,c,comp){
  const hol=holidayFor(k),tr=document.createElement('tr');
  tr.dataset.date=k;tr.dataset.ledgerEntry='1';
  tr.className=`${holidayClass(hol.type)} type-${r.type||''}`;
  tr.innerHTML=`
    <td>
      ${k.slice(5)}（${['日','月','火','水','木','金','土'][d.getDay()]}）
      <div class="status-badges">${calendarBadge(hol.type)}${workBadge(r.type||'')}${compWarningBadge(c)}</div>
    </td>
    <td>${hol.type}</td>
    <td><select data-field="type">${ledgerTypeOptions(r.type||'')}</select></td>
    <td><input data-field="start" type="time" value="${escapeAttr(r.start||'')}"></td>
    <td><input data-field="end" type="time" value="${escapeAttr(r.end||'')}"></td>
    <td><input data-field="out" type="time" value="${escapeAttr(r.out||'')}"></td>
    <td><input data-field="back" type="time" value="${escapeAttr(r.back||'')}"></td>
    <td data-calc="work">${c.work.toFixed(2)}</td>
    <td data-calc="ot">${c.overtime.toFixed(2)}</td>
    <td data-calc="comp">${comp.toFixed(1)}</td>
    <td><input class="ledger-note" data-field="note" type="text" value="${escapeAttr(r.note||'')}"></td>
    <td><button type="button" class="save-ledger-row">保存</button><br><button type="button" class="clear-ledger-row">削除</button></td>`;
  return tr
}
function mobileLedgerCard(k,d,r,c,comp){
  const hol=holidayFor(k),article=document.createElement('article');
  article.dataset.date=k;article.dataset.ledgerEntry='1';
  article.className=`ledger-card ${holidayClass(hol.type)} type-${r.type||''}`;
  article.innerHTML=`
    <div class="ledger-card-head">
      <div>
        <div class="ledger-card-date">${k.slice(5).replace('-','/')}（${['日','月','火','水','木','金','土'][d.getDay()]}）</div>
        <div class="status-badges">${calendarBadge(hol.type)}${workBadge(r.type||'')}${compWarningBadge(c)}</div>
      </div>
      <span class="ledger-card-status">${r.updatedAt?'保存済':'未入力'}</span>
    </div>
    <div class="ledger-card-grid">
      <label class="full">勤務区分
        <select data-field="type">${ledgerTypeOptions(r.type||'')}</select>
      </label>
      <label>出勤<input data-field="start" type="time" value="${escapeAttr(r.start||'')}"></label>
      <label>退勤<input data-field="end" type="time" value="${escapeAttr(r.end||'')}"></label>
      <label>外出<input data-field="out" type="time" value="${escapeAttr(r.out||'')}"></label>
      <label>戻り<input data-field="back" type="time" value="${escapeAttr(r.back||'')}"></label>
      <label class="full">備考<textarea data-field="note" rows="2">${String(r.note||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}</textarea></label>
    </div>
    <div class="ledger-card-metrics">
      <div class="ledger-card-metric"><span>就労</span><strong data-calc="work">${c.work.toFixed(2)}h</strong></div>
      <div class="ledger-card-metric"><span>残業</span><strong data-calc="ot">${c.overtime.toFixed(2)}h</strong></div>
      <div class="ledger-card-metric"><span>代休残</span><strong data-calc="comp">${comp.toFixed(1)}日</strong></div>
    </div>
    <div class="ledger-card-actions">
      <button type="button" class="save-ledger-row">保存</button>
      <button type="button" class="clear-ledger-row">削除</button>
    </div>`;
  return article
}
function renderLedger(){
  const periods=buildPeriods(),prev=$('ledgerPeriod').value,current=periodForDate(new Date());
  $('ledgerPeriod').innerHTML=periods.map(p=>`<option value="${p.index}">${p.label}（${p.range}）</option>`).join('');
  $('ledgerPeriod').value=prev!==''&&periods[+prev]?prev:String(current?current.index:0);
  const p=periods[+$('ledgerPeriod').value];
  $('ledgerPeriodText').textContent=`${p.label}　${p.range}`;
  $('ledgerRows').innerHTML='';
  $('ledgerCards').innerHTML='';
  const balances=periodCompBalances();
  for(const k of allKeys()){
    const d=parseIso(k);
    if(d>=p.start&&d<=p.end){
      const r=state.records[k]||{},c=calcRecord(k,r),comp=balances[k]||0;
      if(isMobileLedger())$('ledgerCards').appendChild(mobileLedgerCard(k,d,r,c,comp));
      else $('ledgerRows').appendChild(desktopLedgerRow(k,d,r,c,comp))
    }
  }
  bindLedgerEntries()
}
function recordFromLedgerRow(entry){
  const get=name=>entry.querySelector(`[data-field="${name}"]`)?.value||'';
  return{type:get('type'),start:get('start'),end:get('end'),out:get('out'),back:get('back'),note:get('note')}
}
function saveLedgerRow(entry){
  const k=entry.dataset.date,r=recordFromLedgerRow(entry);
  if(!saveRecord(k,r))return false;
  renderDashboard();renderTodayMetrics();if(k===iso())loadTodayForm();
  updateLedgerCalculations();
  const c=calcRecord(k,state.records[k]||{});
  const hol=holidayFor(k);
  entry.className=entry.className
    .split(/\s+/)
    .filter(x=>!x.startsWith('type-')&&!x.startsWith('holiday-')&&x!=='dirty'&&x!=='saved-ok'&&x!=='ledger-card-save-flash')
    .join(' ');
  entry.classList.add(holidayClass(hol.type),`type-${r.type||''}`,'saved-ok','ledger-card-save-flash');
  const button=entry.querySelector('.save-ledger-row');
  const status=entry.querySelector('.ledger-card-status');
  const badges=entry.querySelector('.status-badges');
  if(button){button.textContent='保存済';button.classList.add('saved')}
  if(status)status.textContent='保存済';
  if(badges)badges.innerHTML=calendarBadge(hol.type)+workBadge(r.type||'')+compWarningBadge(c);
  $('ledgerSaveMessage').textContent=`${k} を保存しました。`;
  setTimeout(()=>{
    entry.classList.remove('ledger-card-save-flash');
    $('ledgerSaveMessage').textContent=''
  },1800);
  return true
}
function clearLedgerRow(entry){
  const k=entry.dataset.date;if(!confirm(`${k} の入力を削除しますか？`))return;
  delete state.records[k];if(!persist())return;
  renderDashboard();renderTodayMetrics();if(k===iso())loadTodayForm();
  renderLedger();
  $('ledgerSaveMessage').textContent=`${k} の入力を削除しました。`;
  setTimeout(()=>{$('ledgerSaveMessage').textContent=''},2200)
}
function renderSettings(){Object.keys(state.settings).forEach(k=>{const e=$(k);if(e)e.value=state.settings[k]});renderPeriodPreview()}
function renderPeriodPreview(){const temp={...state.settings,fiscalYear:+$('fiscalYear').value||state.settings.fiscalYear,fiscalStartMonth:+$('fiscalStartMonth').value||4,fiscalStartDay:+$('fiscalStartDay').value||21,cutoffDay:+$('cutoffDay').value||20},p=buildPeriods(temp);$('periodPreview').textContent=`第1月度：${p[0].label}　${p[0].range}　／　第12月度：${p[11].label}　${p[11].range}`;$('periodWarning').textContent=(+temp.fiscalStartDay===((+temp.cutoffDay)%31)+1||+temp.cutoffDay===31)?'':'期開始日と締め日の翌日が一致していないため、第1月度だけ通常より短い／長い場合があります。'}
function renderAll(){renderTodayMetrics();renderDashboard();renderCalendar();renderLedger();renderSettings()}
function saveToday(){if(!saveRecord(iso(),formRecord()))return;renderTodayMetrics();renderDashboard();renderLedger();$('saveMessage').textContent='保存しました';setTimeout(()=>$('saveMessage').textContent='',1800)}
function openHoliday(k){dialogDate=k;const h=holidayFor(k);$('holidayDateLabel').textContent=k;$('holidayType').value=h.type;$('holidayName').value=h.name||'';$('holidayDialog').showModal()}
function saveSettings(){Object.keys(state.settings).forEach(k=>{const e=$(k);if(e)state.settings[k]=e.type==='number'?+e.value:e.value});persist();renderAll();loadTodayForm();alert('設定を保存しました')}
async function sha256(t){const h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t));return[...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,'0')).join('')}
function sessionValid(){return +localStorage.getItem(SESSION_KEY)>Date.now()}
function showLock(){const has=!!localStorage.getItem(AUTH_KEY);$('lockScreen').hidden=false;$('confirmPasswordWrap').hidden=has;$('lockDescription').textContent=has?'パスワードを入力してください。':'初回パスワードを設定してください。';$('loginButton').textContent=has?'ログイン':'パスワードを設定';$('loginPassword').value='';$('confirmPassword').value='';$('loginMessage').textContent=''}
async function login(){const p=$('loginPassword').value,saved=localStorage.getItem(AUTH_KEY);if(p.length<4){$('loginMessage').textContent='4文字以上で入力してください。';return}if(!saved){if(p!==$('confirmPassword').value){$('loginMessage').textContent='確認用が一致しません。';return}localStorage.setItem(AUTH_KEY,await sha256(p))}else if(await sha256(p)!==saved){$('loginMessage').textContent='パスワードが違います。';return}localStorage.setItem(SESSION_KEY,String(Date.now()+SESSION_DAYS*86400000));$('lockScreen').hidden=true;renderAll();loadTodayForm()}
function logout(){localStorage.removeItem(SESSION_KEY);showLock()}
function download(name,text,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();URL.revokeObjectURL(a.href)}
function exportCsv(){const rows=[['日付','月度','期間','勤務区分','出勤','退勤','外出','戻り','備考']];Object.entries(state.records).sort().forEach(([k,r])=>{const p=periodForDate(parseIso(k));rows.push([k,p?.label||'',p?.range||'',r.type||'',r.start||'',r.end||'',r.out||'',r.back||'',r.note||''])});download('attendance.csv','\ufeff'+rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\n'),'text/csv')}
function normalizeHeader(v){return String(v??'').trim().replace(/\s+/g,'').replace(/[（）()]/g,'')}
const aliases={
  date:['日付','年月日','勤務日','出勤日','対象日'],
  type:['勤務区分','区分','勤怠区分','勤務種別','勤務'],
  start:['出勤','出勤時刻','始業','始業時刻','開始','開始時刻'],
  end:['退勤','退勤時刻','終業','終業時刻','終了','終了時刻'],
  out:['外出','外出時刻','中抜け開始'],
  back:['戻り','戻り時刻','帰社','帰社時刻','中抜け終了'],
  note:['備考','摘要','メモ','コメント']
};
function detectHeader(rows){for(let i=0;i<Math.min(rows.length,30);i++){const n=(rows[i]||[]).map(normalizeHeader);if(aliases.date.some(x=>n.includes(x))&&(aliases.type.some(x=>n.includes(x))||aliases.start.some(x=>n.includes(x))))return i}return-1}
function mapCols(h){const n=h.map(normalizeHeader),o={};for(const[k,a]of Object.entries(aliases))o[k]=n.findIndex(x=>a.includes(x));return o}
function excelDate(v,baseYear=state.settings.fiscalYear){
  if(v==null||v==='')return'';
  if(v instanceof Date&&!isNaN(v))return iso(v);
  if(typeof v==='number'&&window.XLSX){
    const p=XLSX.SSF.parse_date_code(v);
    if(p&&p.y>=1900)return`${p.y}-${pad(p.m)}-${pad(p.d)}`
  }
  let s=String(v).trim();
  if(!s)return'';
  s=s.replace(/\([^)]*\)/g,'')
     .replace(/[月火水木金土日]曜日?/g,'')
     .replace(/\s+\d{1,2}:\d{2}(:\d{2})?$/,'')
     .replace(/午前|午後/g,'')
     .trim();
  let m=s.match(/(\d{4})\s*[\/\-.年]\s*(\d{1,2})\s*[\/\-.月]\s*(\d{1,2})\s*日?/);
  if(m)return`${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m=s.match(/^(\d{1,2})\s*[\/\-.月]\s*(\d{1,2})\s*日?$/);
  if(m){
    let year=Number(baseYear)||new Date().getFullYear();
    const month=Number(m[1]),fiscalStart=Number(state.settings.fiscalStartMonth)||4;
    if(month<fiscalStart)year++;
    return`${year}-${pad(month)}-${pad(m[2])}`
  }
  const parsed=new Date(s);
  return isNaN(parsed)?'':iso(parsed)
}
function excelTime(v){
  if(v==null||v==='')return'';
  if(v instanceof Date&&!isNaN(v))return`${pad(v.getHours())}:${pad(v.getMinutes())}`;
  if(typeof v==='number'){
    const fraction=((v%1)+1)%1,t=Math.round(fraction*1440)%1440;
    return`${pad(Math.floor(t/60))}:${pad(t%60)}`
  }
  const s=String(v).trim();
  if(!s)return'';
  const jp=s.match(/(午前|午後)?\s*(\d{1,2})\s*時(?:\s*(\d{1,2})\s*分?)?/);
  if(jp){
    let h=Number(jp[2]),m=Number(jp[3]||0);
    if(jp[1]==='午後'&&h<12)h+=12;
    if(jp[1]==='午前'&&h===12)h=0;
    return`${pad(h)}:${pad(m)}`
  }
  const m=s.match(/(\d{1,2}):(\d{2})/);
  return m?`${pad(m[1])}:${m[2]}`:''
}
function sheetCandidate(book,name){
  const rows=XLSX.utils.sheet_to_json(book.Sheets[name],{header:1,defval:'',raw:true});
  const hr=detectHeader(rows);
  if(hr<0)return null;
  const cols=mapCols(rows[hr]);
  if(cols.date<0)return null;
  let validDates=0,nonEmpty=0;
  for(let i=hr+1;i<Math.min(rows.length,hr+400);i++){
    const row=rows[i]||[];
    if(row.some(v=>String(v??'').trim()!==''))nonEmpty++;
    if(excelDate(row[cols.date]))validDates++
  }
  const mappedFields=['type','start','end','out','back','note'].filter(k=>cols[k]>=0).length;
  const score=validDates*20+mappedFields*5+(cols.type>=0?10:0)+(cols.start>=0?10:0)+(cols.end>=0?10:0);
  return{name,rows,hr,cols,validDates,nonEmpty,mappedFields,score}
}
async function importWorkbook(file){
  $('importResult').textContent='読み込み中…';
  $('importErrors').textContent='';
  $('importSheetInfo').hidden=true;
  try{
    if(!window.XLSX)throw new Error('Excel読込ライブラリを読み込めません。通信状態を確認してください。');
    const book=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true,cellNF:true,cellText:true,raw:true});
    const candidates=book.SheetNames.map(name=>sheetCandidate(book,name)).filter(Boolean).sort((a,b)=>b.score-a.score);
    if(!candidates.length)throw new Error('「日付」を含む台帳形式のシートが見つかりません。');
    const sel=candidates[0];
    if(sel.validDates===0){
      const samples=sel.rows.slice(sel.hr+1,sel.hr+8).map((r,i)=>`${sel.hr+i+2}行目：${String(r[sel.cols.date]??'')}`).join(' / ');
      throw new Error(`日付列は見つかりましたが、日付を解析できません。読み取った値：${samples}`)
    }
    $('importSheetInfo').hidden=false;
    $('importSheetInfo').textContent=`取込対象：${sel.name}（日付判定 ${sel.validDates}件、認識列 ${sel.mappedFields+1}項目）`;
    const c=sel.cols;
    let imported=0,skipped=0,over=0,errors=[];
    for(let i=sel.hr+1;i<sel.rows.length;i++){
      const row=sel.rows[i]||[];
      if(!row.some(v=>String(v??'').trim()!==''))continue;
      const rawDate=row[c.date],date=excelDate(rawDate);
      if(!date){errors.push(`${i+1}行目：日付不明「${String(rawDate??'').slice(0,30)}」`);continue}
      const old=state.records[date];
      if(old&&$('importPolicy').value==='skip'){skipped++;continue}
      const rawType=c.type>=0?String(row[c.type]??'').trim():'';
      const normalizedType=['出勤','休日出勤','公休','有休','代休','特休'].includes(rawType)
        ?rawType
        :(rawType.includes('休日')&&rawType.includes('出勤')?'休日出勤':
          rawType.includes('有休')?'有休':
          rawType.includes('代休')?'代休':
          rawType.includes('公休')?'公休':
          rawType.includes('特休')?'特休':
          rawType?'出勤':(old?.type||'出勤'));
      state.records[date]={
        type:normalizedType,
        start:c.start>=0?excelTime(row[c.start]):old?.start||'',
        end:c.end>=0?excelTime(row[c.end]):old?.end||'',
        out:c.out>=0?excelTime(row[c.out]):old?.out||'',
        back:c.back>=0?excelTime(row[c.back]):old?.back||'',
        note:c.note>=0?String(row[c.note]??'').trim():old?.note||'',
        updatedAt:new Date().toISOString(),
        importedFrom:`${file.name} / ${sel.name}`
      };
      if(old)over++;
      imported++
    }
    if(!persist())throw new Error('ブラウザへの保存に失敗しました。');
    renderAll();loadTodayForm();
    $('importResult').textContent=`${imported}件取込み、${over}件上書き、${skipped}件スキップ`;
    $('importErrors').innerHTML=errors.length
      ?`<b>確認事項 ${errors.length}件</b><br>${errors.slice(0,30).map(x=>escapeAttr(x)).join('<br>')}${errors.length>30?'<br>…':''}`
      :'エラーはありません。'
  }catch(e){
    $('importResult').textContent='取込み失敗';
    $('importErrors').textContent=e.message
  }finally{$('importExcel').value=''}
}

function mergeRecordMaps(localMap={},cloudMap={}){
  const merged={...localMap};
  for(const [date,cloudRecord] of Object.entries(cloudMap||{})){
    const localRecord=merged[date];
    if(!localRecord){merged[date]=cloudRecord;continue}
    const lt=Date.parse(localRecord.updatedAt||0)||0;
    const ct=Date.parse(cloudRecord.updatedAt||0)||0;
    if(ct>=lt)merged[date]=cloudRecord
  }
  return merged
}
function applyCloudState(cloud){
  if(!cloud||typeof cloud!=='object')return;
  applyingCloudState=true;
  try{
    state={
      version:6,
      settings:{...defaults.settings,...(cloud.settings||state.settings||{})},
      records:mergeRecordMaps(state.records||{},cloud.records||{}),
      calendar:{...(state.calendar||{}),...(cloud.calendar||{})}
    };
    localStorage.setItem(KEY,JSON.stringify(state));
    renderAll();
    loadTodayForm()
  }finally{
    applyingCloudState=false
  }
}
window.addEventListener('attendance-cloud-state',e=>applyCloudState(e.detail));
window.addEventListener('attendance-cloud-status',e=>{
  const s=e.detail||{};
  const status=$('cloudStatus'),user=$('cloudUser'),last=$('cloudLastSync'),head=$('cloudHeaderStatus'),msg=$('cloudMessage');
  if(status)status.textContent=s.label||'未設定';
  if(user)user.textContent=s.user||'未ログイン';
  if(last)last.textContent=s.lastSync||'―';
  if(msg)msg.textContent=s.message||'';
  if(head){
    head.textContent=s.shortLabel||s.label||'ローカル';
    head.className='cloud-header-status '+(s.state||'offline')
  }
  const signed=Boolean(s.signedIn);
  if($('cloudSignIn'))$('cloudSignIn').hidden=signed;
  if($('cloudSignOut'))$('cloudSignOut').hidden=!signed;
  if($('cloudPush'))$('cloudPush').hidden=!signed;
  if($('cloudPull'))$('cloudPull').hidden=!signed
});
function setup(){document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab,.view').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('view-'+b.dataset.view).classList.add('active');if(b.dataset.view==='ledger')renderLedger()});document.querySelectorAll('.now').forEach(b=>b.onclick=e=>{e.preventDefault();$(b.dataset.target).value=hm();previewToday()});['workType','start','end','out','back'].forEach(id=>$(id).addEventListener('input',previewToday));['fiscalYear','fiscalStartMonth','fiscalStartDay','cutoffDay'].forEach(id=>$(id).addEventListener('input',renderPeriodPreview));$('saveToday').onclick=saveToday;$('saveAllLedger').onclick=()=>{let ok=0;document.querySelectorAll('[data-ledger-entry].dirty').forEach(entry=>{if(saveLedgerRow(entry))ok++});$('ledgerSaveMessage').textContent=ok?`${ok}件を保存しました。`:'変更された行はありません。'};$('reloadLedger').onclick=renderLedger;$('calendarMonth').onchange=renderCalendar;
$('ledgerPeriod').onchange=renderLedger;
$('prevLedgerPeriod').onclick=()=>{const i=Math.max(0,(+$('ledgerPeriod').value||0)-1);$('ledgerPeriod').value=String(i);renderLedger()};
$('nextLedgerPeriod').onclick=()=>{const i=Math.min(11,(+$('ledgerPeriod').value||0)+1);$('ledgerPeriod').value=String(i);renderLedger()};$('saveHoliday').onclick=()=>{state.calendar[dialogDate]={type:$('holidayType').value,name:$('holidayName').value};persist();renderAll()};$('saveSettings').onclick=saveSettings;
$('cloudSignIn').onclick=()=>window.dispatchEvent(new Event('attendance-cloud-signin'));
$('cloudSignOut').onclick=()=>window.dispatchEvent(new Event('attendance-cloud-signout'));
$('cloudPush').onclick=()=>window.dispatchEvent(new CustomEvent('attendance-cloud-push',{detail:structuredClone(state)}));
$('cloudPull').onclick=()=>window.dispatchEvent(new Event('attendance-cloud-pull'));$('loginButton').onclick=login;$('logoutButton').onclick=logout;$('loginPassword').onkeydown=e=>{if(e.key==='Enter')login()};$('confirmPassword').onkeydown=e=>{if(e.key==='Enter')login()};$('exportJson').onclick=()=>download('attendance-backup.json',JSON.stringify(state,null,2),'application/json');$('importJson').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{const x=JSON.parse(r.result);state={version:6,settings:{...defaults.settings,...(x.settings||{})},records:x.records||{},calendar:x.calendar||{}};persist();renderAll();loadTodayForm();alert('復元しました')};r.readAsText(f)};$('exportCsv').onclick=exportCsv;$('importExcel').onchange=e=>{const f=e.target.files[0];if(f)importWorkbook(f)};$('resetData').onclick=()=>{if(confirm('全データを削除しますか？')){state=structuredClone(defaults);persist();renderAll();loadTodayForm()}};window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;$('installBtn').hidden=false});$('installBtn').onclick=async()=>{if(deferredPrompt){deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;$('installBtn').hidden=true}};let lastMobile=isMobileLedger();
window.addEventListener('resize',()=>{const now=isMobileLedger();if(now!==lastMobile){lastMobile=now;const ledgerView=$('view-ledger');if(ledgerView&&ledgerView.classList.contains('active'))renderLedger()}});
clearOldAppCaches();if(sessionValid()){$('lockScreen').hidden=true;renderAll();loadTodayForm()}else showLock()}
setup();
