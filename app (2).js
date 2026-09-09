
'use strict';
const KEY='attendancePwaV6',LEGACY_KEY='attendancePwaV5',OLDER_KEY='attendancePwaV4',
EMP_STORE_KEY='attendancePwaV82ByEmployee',ACTIVE_EMP_KEY='attendancePwaV82ActiveEmployee',
AUTH_KEY=KEY+'.authHash',SESSION_KEY=KEY+'.sessionUntil',SESSION_DAYS=30;
const EMPLOYEES=[
{id:'EMP-001',name:'社長'},{id:'EMP-002',name:'専務'},{id:'EMP-003',name:'山田'},{id:'EMP-004',name:'佐藤'},{id:'EMP-005',name:'鈴木'}
];
const PORTAL_QUERY=new URLSearchParams(location.search);
const requestedEmployee=PORTAL_QUERY.get('emp');
const requestedDate=PORTAL_QUERY.get('date');
const requestedEdit=PORTAL_QUERY.get('edit')==='1';
let activeEmployeeId=(requestedEmployee&&EMPLOYEES.some(e=>e.id===requestedEmployee))
  ? requestedEmployee
  : (localStorage.getItem(ACTIVE_EMP_KEY)||'EMP-004');
if(requestedEmployee)localStorage.setItem(ACTIVE_EMP_KEY,activeEmployeeId);
const defaults={version:8.1,settings:{fiscalYear:new Date().getFullYear(),fiscalStartMonth:4,fiscalStartDay:21,cutoffDay:20,annualHolidayTarget:110,standardHours:8,baseBreak:1,extraBreak:.25,extraBreakAfter:'18:00',roundMinutes:15,roundStart:'切上',roundEnd:'切捨',earlyStart:'05:00',normalStart:'08:30',normalEnd:'17:30',nightStart:'22:00',monthOtLimit:45,yearOtLimit:360},records:{},calendar:{},holidayHistory:[]};
let state=load(),dialogDate='',editDate='',deferredPrompt=null,applyingCloudState=false;
const $=id=>document.getElementById(id),pad=n=>String(n).padStart(2,'0');
function employeeStore(){
  try{return JSON.parse(localStorage.getItem(EMP_STORE_KEY)||'{}')}catch{return{}}
}
function migrateLegacyToEmployee004(){
  const store=employeeStore();
  if(store['EMP-004'])return store;
  try{
    const raw=JSON.parse(localStorage.getItem(KEY)||localStorage.getItem(LEGACY_KEY)||localStorage.getItem(OLDER_KEY)||'{}');
    const hasOld=Object.keys(raw.records||{}).length||Object.keys(raw.calendar||{}).length||Object.keys(raw.settings||{}).length;
    if(hasOld){
      store['EMP-004']={
        version:8.2,
        settings:Object.assign({},defaults.settings,raw.settings||{}),
        records:raw.records||{},
        calendar:raw.calendar||{},
        holidayHistory:Array.isArray(raw.holidayHistory)?raw.holidayHistory:[]
      };
      localStorage.setItem(EMP_STORE_KEY,JSON.stringify(store));
      localStorage.setItem('attendancePwaV82MigrationBackup',JSON.stringify(raw));
      console.info('既存TIMEデータをEMP-004へ移行しました');
    }
  }catch(e){console.error('EMP-004移行失敗',e)}
  return store;
}
function blankEmployeeState(){
  return {version:8.2,settings:Object.assign({},defaults.settings),records:{},calendar:{},holidayHistory:[]};
}
function load(){
  const store=migrateLegacyToEmployee004();
  const raw=store[activeEmployeeId]||{};
  return{
    version:8.2,
    settings:Object.assign({},defaults.settings,raw.settings||{}),
    records:raw.records||{},
    calendar:raw.calendar||{},
    holidayHistory:Array.isArray(raw.holidayHistory)?raw.holidayHistory:[]
  }
}
function persist(){
  try{
    state.version=8.1;
    const text=JSON.stringify(state);
    const store=employeeStore();
    store[activeEmployeeId]=state;
    localStorage.setItem(EMP_STORE_KEY,JSON.stringify(store));
    localStorage.setItem(ACTIVE_EMP_KEY,activeEmployeeId);
    // EMP-004には従来キーも互換用として残す。既存バックアップ/旧機能を壊さないため。
    if(activeEmployeeId==='EMP-004')localStorage.setItem(KEY,text);
    const check=JSON.stringify(employeeStore()[activeEmployeeId]||{});
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
function calcRecord(k,r={}){
  const s=state.settings;
  const rs=roundTime(r.start,s.roundMinutes,s.roundStart);
  const re=roundTime(r.end,s.roundMinutes,s.roundEnd);
  const isWork=['出勤','休日出勤'].includes(r.type);
  const extra=(r.end&&r.start&&(mins(r.end)<mins(r.start)||mins(r.end)>=mins(s.extraBreakAfter)))?+s.extraBreak:0;
  const br=isWork?(+s.baseBreak+extra):0;
  const outside=duration(r.out,r.back);
  const work=Math.max(0,duration(rs,re)-br-outside);
  let early=overlap(rs,re,s.earlyStart,s.normalStart);
  let evening=overlap(rs,re,s.normalEnd,s.nightStart);
  let night=overlap(rs,re,s.nightStart,s.earlyStart);
  if(r.out&&r.back){
    early=Math.max(0,early-overlap(r.out,r.back,s.earlyStart,s.normalStart));
    evening=Math.max(0,evening-overlap(r.out,r.back,s.normalEnd,s.nightStart));
    night=Math.max(0,night-overlap(r.out,r.back,s.nightStart,s.earlyStart));
  }
  const hol=holidayFor(k);
  const dailyOvertime=isWork&&hol.type!=='法定休日'?Math.max(0,work-(+s.standardHours||8)):0;
  const scheduledHolidayWork=isWork&&hol.type==='所定休日'?work:0;
  const statutoryHolidayWork=isWork&&hol.type==='法定休日'?work:0;
  const compEarn=r.type==='休日出勤'&&hol.type!=='勤務日'&&work>0?1:0;
  const compUse=r.type==='代休'?1:0;
  return{rs,re,breakHours:br,outside,work,early,evening,night,hol,dailyOvertime,scheduledHolidayWork,statutoryHolidayWork,compEarn,compUse};
}
function startOfWeekMonday(d){const x=new Date(d),day=x.getDay(),diff=day===0?-6:1-day;x.setDate(x.getDate()+diff);x.setHours(0,0,0,0);return x}
function weeklyOvertimeMap(){
  const s=state.settings,result={},weeks=new Map();
  for(const k of allKeys()){const wk=iso(startOfWeekMonday(parseIso(k)));if(!weeks.has(wk))weeks.set(wk,[]);weeks.get(wk).push(k)}
  for(const weekKeys of weeks.values()){
    weekKeys.sort();let cumulativeStandardPart=0;
    for(const k of weekKeys){
      const c=calcRecord(k,state.records[k]||{});
      if(c.hol.type==='法定休日'||c.work<=0){result[k]={weeklyExtra:0,overtime:0,scheduledHolidayWork:c.scheduledHolidayWork,statutoryHolidayWork:c.statutoryHolidayWork};continue}
      const standardPart=Math.min(c.work,+s.standardHours||8);
      const before=cumulativeStandardPart,after=before+standardPart;
      const weeklyExtra=Math.max(0,after-40)-Math.max(0,before-40);
      cumulativeStandardPart=after;
      result[k]={weeklyExtra,overtime:c.dailyOvertime+weeklyExtra,scheduledHolidayWork:c.scheduledHolidayWork,statutoryHolidayWork:c.statutoryHolidayWork};
    }
  }
  return result
}
function stats(){
  let comp=0,yearOt=0,holidayWorkDays=0,planned=0,statutoryHolidayHours=0;
  const otMap=weeklyOvertimeMap();
  const months=buildPeriods().map(p=>({label:p.label,range:p.range,work:0,ot:0,scheduledHolidayWorkDays:0,statutoryHolidayWork:0,comp:0}));
  for(const k of allKeys()){
    const c=calcRecord(k,state.records[k]||{}),ot=otMap[k]?.overtime||0;
    if(c.hol.type!=='勤務日')planned++;
    comp+=c.compEarn-c.compUse;yearOt+=ot;statutoryHolidayHours+=c.statutoryHolidayWork;if(c.compEarn)holidayWorkDays++;
    const p=periodForDate(parseIso(k));if(p){const m=months[p.index];m.work+=c.work;m.ot+=ot;if(c.scheduledHolidayWork>0)m.scheduledHolidayWorkDays++;m.statutoryHolidayWork+=c.statutoryHolidayWork;m.comp=comp}
  }
  const used=Object.values(state.records).filter(r=>r.type==='代休').length;
  return{comp,yearOt,holidayWorkDays,planned,actualHoliday:planned-holidayWorkDays+used,statutoryHolidayHours,months,otMap};
}
function formRecord(){return{type:$('workType').value,start:$('start').value,end:$('end').value,out:$('out').value,back:$('back').value,note:$('note').value}}
function previewToday(){
  const key=iso(),draft=formRecord(),before=state.records[key];
  state.records[key]=draft;
  const c=calcRecord(key,draft),ot=weeklyOvertimeMap()[key]?.overtime||0;
  if(before)state.records[key]=before;else delete state.records[key];
  $('todayBreak').textContent=c.breakHours.toFixed(2)+'h';
  $('todayOutside').textContent=c.outside.toFixed(2)+'h';
  $('todayWork').textContent=c.work.toFixed(2)+'h';
  $('todayOt').textContent=ot.toFixed(2)+'h';
  $('todayBands').textContent=`${c.early.toFixed(2)} / ${c.evening.toFixed(2)} / ${c.night.toFixed(2)}h`
}
function loadTodayForm(){const r=state.records[iso()]||{type:'出勤'};$('workType').value=r.type||'出勤';['start','end','out','back','note'].forEach(id=>$(id).value=r[id]||'');previewToday()}

function hoursToClock(h){
  const total=Math.max(0,Math.round((+h||0)*60));
  return `${Math.floor(total/60)}:${pad(total%60)}`
}
function weekSummaryFor(start){
  const otMap=weeklyOvertimeMap();
  let basis=0,work=0,ot=0,stat=0,scheduled=0,night=0;
  const days=[];
  for(let i=0;i<7;i++){
    const d=addDays(start,i),k=iso(d),c=calcRecord(k,state.records[k]||{}),o=otMap[k]?.overtime||0;
    work+=c.work;ot+=o;stat+=c.statutoryHolidayWork;scheduled+=c.scheduledHolidayWork;night+=c.night;
    if(c.hol.type!=='法定休日')basis+=c.work;
    days.push(k)
  }
  return{start:new Date(start),end:addDays(start,6),days,basis,work,ot,stat,scheduled,night}
}
function periodWeekSummaries(p){
  const first=startOfWeekMonday(p.start),arr=[];
  for(let d=new Date(first);d<=p.end;d=addDays(d,7))arr.push(weekSummaryFor(d));
  return arr
}
function currentOverviewPeriod(){
  const periods=buildPeriods(),sel=$('overviewPeriod');
  if(!sel)return periods[0];
  const idx=Math.min(periods.length-1,Math.max(0,+sel.value||0));
  return periods[idx]
}
function overviewRowClass(type){
  if(type==='所定休日')return'ov-scheduled';
  if(type==='法定休日')return'ov-statutory';
  if(type==='会社休業日')return'ov-company';
  return'ov-work'
}
function renderOverview(){
  const periods=buildPeriods(),sel=$('overviewPeriod'),prev=sel.value,current=periodForDate(new Date());
  sel.innerHTML=periods.map(p=>`<option value="${p.index}">${p.label}（${p.range}）</option>`).join('');
  sel.value=prev!==''&&periods[+prev]?prev:String(current?current.index:0);
  const p=currentOverviewPeriod(),otMap=weeklyOvertimeMap(),balances=periodCompBalances();
  $('overviewTitle').textContent=p.label;
  $('overviewRange').textContent=p.range;
  let work=0,ot=0,stat=0,scheduled=0,night=0,days=0;
  const rows=[];
  for(let d=new Date(p.start);d<=p.end;d=addDays(d,1)){
    const k=iso(d),r=state.records[k]||{},c=calcRecord(k,r),o=otMap[k]?.overtime||0,h=holidayFor(k);
    work+=c.work;ot+=o;stat+=c.statutoryHolidayWork;scheduled+=c.scheduledHolidayWork;night+=c.night;
    if(c.work>0)days++;
    rows.push(`<tr class="${overviewRowClass(h.type)} ${c.work>0?'ov-recorded':''}" data-overview-date="${k}">
      <th class="sticky-day">${d.getDate()} <small>${['日','月','火','水','木','金','土'][d.getDay()]}</small></th>
      <td>${h.type==='勤務日'?(r.type||''):h.type.replace('休日','休')}</td>
      <td>${r.start||'<span class="muted-cell">―</span>'}</td>
      <td>${r.end||'<span class="muted-cell">―</span>'}</td>
      <td>${c.work?hoursToClock(c.work):''}</td>
      <td class="${o>0?'ot-positive':''}">${o?hoursToClock(o):''}</td>
      <td class="${c.statutoryHolidayWork>0?'stat-positive':''}">${c.statutoryHolidayWork?hoursToClock(c.statutoryHolidayWork):''}</td>
      <td>${c.night?hoursToClock(c.night):''}</td>
      <td class="overview-note">${escapeAttr(r.note||'')}</td>
    </tr>`);
    if(d.getDay()===0 || iso(d)===iso(p.end)){
      const ws=weekSummaryFor(startOfWeekMonday(d));
      rows.push(`<tr class="week-total"><th class="sticky-day" colspan="2">週計 ${ws.start.getMonth()+1}/${ws.start.getDate()}–${ws.end.getMonth()+1}/${ws.end.getDate()}</th><td colspan="2">40h判定 ${hoursToClock(ws.basis)}</td><td>${hoursToClock(ws.work)}</td><td>${hoursToClock(ws.ot)}</td><td>${hoursToClock(ws.stat)}</td><td>${hoursToClock(ws.night)}</td><td></td></tr>`)
    }
  }
  $('overviewRows').innerHTML=rows.join('');
  $('overviewWork').textContent=hoursToClock(work);$('overviewOt').textContent=hoursToClock(ot);$('overviewStat').textContent=hoursToClock(stat);$('overviewScheduled').textContent=hoursToClock(scheduled);$('overviewComp').textContent=(balances[iso(p.end)]||0).toFixed(1)+'日';
  $('overviewFootDays').textContent=`出勤 ${days}日`;$('overviewFootWork').textContent=hoursToClock(work);$('overviewFootOt').textContent=hoursToClock(ot);$('overviewFootStat').textContent=hoursToClock(stat);$('overviewFootNight').textContent=hoursToClock(night);
  $('overviewWeeks').innerHTML=periodWeekSummaries(p).map(w=>{
    const cls=w.ot>=15?'danger':w.ot>0?'warning':'';
    const remain=Math.max(0,40-w.basis);
    return `<article class="week-card ${cls}"><div class="week-range">${w.start.getMonth()+1}/${w.start.getDate()}〜${w.end.getMonth()+1}/${w.end.getDate()}</div><div class="week-values"><span>40h判定</span><b>${hoursToClock(w.basis)}</b><span>${w.basis<40?'40hまで残':'時間外'}</span><b>${w.basis<40?hoursToClock(remain):hoursToClock(w.ot)}</b><span>法定休日</span><b>${hoursToClock(w.stat)}</b></div></article>`
  }).join('');
  document.querySelectorAll('[data-overview-date]').forEach(tr=>tr.addEventListener('click',e=>{if(e.target.closest('button,input,select,textarea,a'))return;openOverviewInlineEdit(tr.dataset.overviewDate,tr)}))
}
let overviewInlineDate='';
function closeOverviewInlineEdit(){
  const ed=document.querySelector('.overview-inline-editor');if(ed)ed.remove();
  document.querySelectorAll('[data-overview-date].is-editing').forEach(x=>x.classList.remove('is-editing'));
  overviewInlineDate=''
}
function overviewInlinePreview(k,box){
  const r={type:box.querySelector('[data-ov-field="type"]').value,start:box.querySelector('[data-ov-field="start"]').value,end:box.querySelector('[data-ov-field="end"]').value,out:box.querySelector('[data-ov-field="out"]').value,back:box.querySelector('[data-ov-field="back"]').value,note:box.querySelector('[data-ov-field="note"]').value};
  const old=state.records[k];state.records[k]=r;
  const c=calcRecord(k,r),o=weeklyOvertimeMap()[k]?.overtime||0;
  if(old)state.records[k]=old;else delete state.records[k];
  const target=box.querySelector('[data-ov-preview]');if(target)target.innerHTML=`<span>就労 <b>${hoursToClock(c.work)}</b></span><span>時間外 <b>${hoursToClock(o)}</b></span><span>法定休日 <b>${hoursToClock(c.statutoryHolidayWork)}</b></span><span>深夜 <b>${hoursToClock(c.night)}</b></span>`
}
function openOverviewInlineEdit(k,tr){
  if(overviewInlineDate===k){closeOverviewInlineEdit();return}
  closeOverviewInlineEdit();overviewInlineDate=k;tr.classList.add('is-editing');
  const r=state.records[k]||{},h=holidayFor(k),d=parseIso(k),editor=document.createElement('tr');
  editor.className='overview-inline-editor';editor.dataset.editorDate=k;
  const td=document.createElement('td');td.colSpan=9;
  td.innerHTML=`<div class="overview-inline-head"><b>${d.getMonth()+1}/${d.getDate()}（${['日','月','火','水','木','金','土'][d.getDay()]}）</b><span>${h.type}${h.name?'・'+escapeAttr(h.name):''}</span></div>
  <div class="overview-inline-grid">
    <label>勤務区分<select data-ov-field="type"><option value="">未入力</option>${['出勤','休日出勤','公休','有休','代休','特休'].map(x=>`<option ${r.type===x?'selected':''}>${x}</option>`).join('')}</select></label>
    <label>出勤<input data-ov-field="start" type="time" value="${escapeAttr(r.start||'')}"></label>
    <label>退勤<input data-ov-field="end" type="time" value="${escapeAttr(r.end||'')}"></label>
    <label>外出<input data-ov-field="out" type="time" value="${escapeAttr(r.out||'')}"></label>
    <label>戻り<input data-ov-field="back" type="time" value="${escapeAttr(r.back||'')}"></label>
    <label class="wide">備考<textarea data-ov-field="note" rows="2">${escapeAttr(r.note||'')}</textarea></label>
  </div>
  <div class="overview-inline-preview" data-ov-preview></div>
  <div class="overview-inline-actions"><button type="button" class="primary" data-ov-save>保存</button><button type="button" data-ov-cancel>キャンセル</button><button type="button" class="danger-button" data-ov-delete>入力削除</button></div>`;
  editor.appendChild(td);tr.insertAdjacentElement('afterend',editor);
  editor.querySelectorAll('input,select,textarea').forEach(el=>el.addEventListener('input',()=>overviewInlinePreview(k,editor)));
  editor.querySelector('[data-ov-cancel]').onclick=closeOverviewInlineEdit;
  editor.querySelector('[data-ov-save]').onclick=()=>{
    const rec={type:editor.querySelector('[data-ov-field="type"]').value,start:editor.querySelector('[data-ov-field="start"]').value,end:editor.querySelector('[data-ov-field="end"]').value,out:editor.querySelector('[data-ov-field="out"]').value,back:editor.querySelector('[data-ov-field="back"]').value,note:editor.querySelector('[data-ov-field="note"]').value};
    if(saveRecord(k,rec)){overviewInlineDate='';renderAll();if(k===iso())loadTodayForm();requestAnimationFrame(()=>{const row=document.querySelector(`[data-overview-date="${k}"]`);if(row){row.classList.add('overview-save-flash');setTimeout(()=>row.classList.remove('overview-save-flash'),800)}})}
  };
  editor.querySelector('[data-ov-delete]').onclick=()=>{if(!confirm(`${k} の勤怠入力を削除しますか？`))return;delete state.records[k];if(persist()){overviewInlineDate='';renderAll();if(k===iso())loadTodayForm()}};
  overviewInlinePreview(k,editor);
  const first=editor.querySelector('select,input');if(first)first.focus({preventScroll:true})
}
function openDayEdit(k){
  editDate=k;const r=state.records[k]||{},h=holidayFor(k),d=parseIso(k),ot=weeklyOvertimeMap()[k]?.overtime||0,c=calcRecord(k,r);
  $('dayEditDate').textContent=`${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}（${['日','月','火','水','木','金','土'][d.getDay()]}）`;
  $('dayEditHoliday').textContent=`${h.type}${h.name?'・'+h.name:''}`;
  $('dayEditType').value=r.type||'';$('dayEditStart').value=r.start||'';$('dayEditEnd').value=r.end||'';$('dayEditOut').value=r.out||'';$('dayEditBack').value=r.back||'';$('dayEditNote').value=r.note||'';
  $('dayEditCalc').innerHTML=`<div><span>就労</span><strong>${hoursToClock(c.work)}</strong></div><div><span>時間外</span><strong>${hoursToClock(ot)}</strong></div><div><span>法定休日</span><strong>${hoursToClock(c.statutoryHolidayWork)}</strong></div><div><span>代休</span><strong>${c.compEarn?'+1日':'―'}</strong></div>`;
  $('dayEditDialog').showModal()
}
function saveOverviewDay(){
  const record={type:$('dayEditType').value,start:$('dayEditStart').value,end:$('dayEditEnd').value,out:$('dayEditOut').value,back:$('dayEditBack').value,note:$('dayEditNote').value};
  if(saveRecord(editDate,record)){renderAll();if(editDate===iso())loadTodayForm();$('dayEditDialog').close()}
}
function deleteOverviewDay(){
  if(!editDate)return;if(!confirm(`${editDate} の勤怠入力を削除しますか？`))return;delete state.records[editDate];persist();renderAll();if(editDate===iso())loadTodayForm();$('dayEditDialog').close()
}
function renderHolidayHistory(){
  const box=$('holidayHistory');if(!box)return;const list=(state.holidayHistory||[]).slice().reverse().slice(0,30);
  box.innerHTML=list.length?list.map(x=>`<div class="history-row"><b>${x.date}</b><div>${escapeAttr(x.from||'')} → ${escapeAttr(x.to||'')}<br><small>${new Date(x.changedAt).toLocaleString('ja-JP')}</small></div><div>${escapeAttr(x.reason||'')}</div></div>`).join(''):'<p class="hint">変更履歴はありません。</p>'
}
function renderTodayMetrics(){const st=stats(),p=periodForDate(new Date()),m=p?st.months[p.index]:{ot:0};$('todayLabel').textContent=new Intl.DateTimeFormat('ja-JP',{dateStyle:'full'}).format(new Date());$('metricComp').textContent=st.comp.toFixed(1)+'日';$('metricMonthOt').textContent=m.ot.toFixed(1)+'h';$('metricYearOt').textContent=st.yearOt.toFixed(1)+'h';$('todayPeriod').textContent=p?`${p.label}　${p.range}`:'本日は設定年度の範囲外です'}
function renderDashboard(){
  const st=stats(),limit=+state.settings.yearOtLimit||360;
  $('dashComp').textContent=st.comp.toFixed(1)+'日';
  $('dashPlanned').textContent=st.planned+'日';
  $('dashHolidayWork').textContent=st.months.reduce((a,m)=>a+m.scheduledHolidayWorkDays,0)+'日';
  if($('dashStatutoryHolidayWork'))$('dashStatutoryHolidayWork').textContent=st.statutoryHolidayHours.toFixed(1)+'h';
  $('dashActualHoliday').textContent=st.actualHoliday+'日';
  $('yearOtBar').style.width=Math.min(100,st.yearOt/limit*100)+'%';
  $('yearOtText').textContent=`時間外 ${st.yearOt.toFixed(1)} / ${limit} h（残り ${(limit-st.yearOt).toFixed(1)} h）／ 法定休日労働 ${st.statutoryHolidayHours.toFixed(1)} h`;
  $('monthRows').innerHTML=st.months.map(m=>`<tr><td>${m.label}<br><small>${m.range}</small></td><td>${m.work.toFixed(1)}</td><td>${m.ot.toFixed(1)}</td><td>${m.scheduledHolidayWorkDays}</td><td>${m.statutoryHolidayWork.toFixed(1)}</td><td>${m.comp.toFixed(1)}</td></tr>`).join('')
}
function renderCalendar(){const val=$('calendarMonth').value||iso().slice(0,7);$('calendarMonth').value=val;const[y,m]=val.split('-').map(Number),first=new Date(y,m-1,1),start=new Date(y,m-1,1-first.getDay()),cells=[];for(let i=0;i<42;i++){const d=new Date(start);d.setDate(start.getDate()+i);const k=iso(d),h=holidayFor(k),cls=d.getMonth()!==m-1?'outside':h.type==='勤務日'?'work':'holiday';cells.push(`<button class="day ${cls}" data-date="${k}"><b>${d.getDate()}</b><small>${h.name||h.type}</small></button>`)}$('calendarGrid').innerHTML=cells.join('');document.querySelectorAll('.day').forEach(b=>b.onclick=()=>openHoliday(b.dataset.date))}
function ledgerTypeOptions(selected){
  const options=['','出勤','休日出勤','公休','有休','代休','特休'];
  return options.map(v=>`<option value="${v}"${v===selected?' selected':''}>${v||'未入力'}</option>`).join('')
}
function escapeAttr(v){return String(v??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;')}
function saveRecord(date,record){const clean={type:record.type||'',start:record.start||'',end:record.end||'',out:record.out||'',back:record.back||'',note:record.note||'',updatedAt:new Date().toISOString()};const hasInput=[clean.type,clean.start,clean.end,clean.out,clean.back,clean.note].some(v=>String(v).trim()!=='');if(hasInput)state.records[date]=clean;else delete state.records[date];if(!persist())return false;try{const stored=employeeStore()[activeEmployeeId]||{};const ok=hasInput?Boolean(stored.records&&stored.records[date]):!(stored.records&&stored.records[date]);if(!ok)throw new Error('保存後の確認に失敗しました');return true}catch(e){console.error(e);alert('保存確認に失敗しました：'+e.message);return false}}
function isMobileLedger(){return window.matchMedia('(max-width:720px)').matches}
function ledgerEntries(){return document.querySelectorAll('[data-ledger-entry][data-date]')}
function updateLedgerCalculations(){
  let comp=0;const otMap=weeklyOvertimeMap();
  for(const k of allKeys()){
    const c=calcRecord(k,state.records[k]||{});comp+=c.compEarn-c.compUse;
    document.querySelectorAll(`[data-ledger-entry][data-date="${k}"]`).forEach(entry=>{
      const work=entry.querySelector('[data-calc="work"]'),ot=entry.querySelector('[data-calc="ot"]'),compEl=entry.querySelector('[data-calc="comp"]');
      if(work)work.textContent=c.work.toFixed(2);if(ot)ot.textContent=(otMap[k]?.overtime||0).toFixed(2);if(compEl)compEl.textContent=comp.toFixed(1)
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
    <td data-calc="ot">${(weeklyOvertimeMap()[k]?.overtime||0).toFixed(2)}</td>
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
      <div class="ledger-card-metric"><span>時間外</span><strong data-calc="ot">${(weeklyOvertimeMap()[k]?.overtime||0).toFixed(2)}h</strong></div>
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
function renderAll(){renderOverview();renderTodayMetrics();renderDashboard();renderCalendar();renderHolidayHistory();renderLedger();renderSettings()}
function saveToday(){if(!saveRecord(iso(),formRecord()))return;renderTodayMetrics();renderDashboard();renderLedger();$('saveMessage').textContent='保存しました';setTimeout(()=>$('saveMessage').textContent='',1800)}
function openHoliday(k){dialogDate=k;const h=holidayFor(k);$('holidayDateLabel').textContent=k;$('holidayType').value=h.type;$('holidayName').value=h.name||'';$('holidayReason').value='';$('holidayDialog').showModal()}
function saveSettings(){Object.keys(state.settings).forEach(k=>{const e=$(k);if(e)state.settings[k]=e.type==='number'?+e.value:e.value});persist();renderAll();loadTodayForm();alert('設定を保存しました')}
async function sha256(t){const h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t));return[...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,'0')).join('')}
function sessionValid(){return +localStorage.getItem(SESSION_KEY)>Date.now()}
function showLock(){const has=!!localStorage.getItem(AUTH_KEY);$('lockScreen').hidden=false;$('confirmPasswordWrap').hidden=has;$('lockDescription').textContent=has?'パスワードを入力してください。':'初回パスワードを設定してください。';$('loginButton').textContent=has?'ログイン':'パスワードを設定';$('loginPassword').value='';$('confirmPassword').value='';$('loginMessage').textContent=''}
async function login(){
 try{
  const p=$('loginPassword')?.value||'',saved=localStorage.getItem(AUTH_KEY);
  if(p.length<4){$('loginMessage').textContent='4文字以上で入力してください。';return}
  if(!saved){
    if(p!==($('confirmPassword')?.value||'')){$('loginMessage').textContent='確認用が一致しません。';return}
    localStorage.setItem(AUTH_KEY,await sha256(p));
  }else if(await sha256(p)!==saved){
    $('loginMessage').textContent='パスワードが違います。';return
  }
  localStorage.setItem(SESSION_KEY,String(Date.now()+SESSION_DAYS*86400000));
  $('lockScreen').hidden=true;
  renderAll();
  loadTodayForm();
  setTimeout(applyPortalDeepLink,0);
 }catch(err){
  console.error('login error',err);
  const msg=$('loginMessage');
  if(msg)msg.textContent='ログイン処理でエラーが発生しました。画面を再読込してください。';
 }
}
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
      version:8,
      settings:{...defaults.settings,...(cloud.settings||state.settings||{})},
      records:mergeRecordMaps(state.records||{},cloud.records||{}),
      calendar:{...(state.calendar||{}),...(cloud.calendar||{})},
      holidayHistory:Array.isArray(cloud.holidayHistory)?cloud.holidayHistory:(state.holidayHistory||[])
    };
    const store=employeeStore();store[activeEmployeeId]=state;localStorage.setItem(EMP_STORE_KEY,JSON.stringify(store));
    if(activeEmployeeId==='EMP-004')localStorage.setItem(KEY,JSON.stringify(state));
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
  if($('googleLoginForm'))$('googleLoginForm').hidden=signed;
  if($('cloudSignOut'))$('cloudSignOut').hidden=!signed;
  if($('cloudPush'))$('cloudPush').hidden=!signed;
  if($('cloudPull'))$('cloudPull').hidden=!signed
});

function requestCloudStatus(){
  window.dispatchEvent(new Event('attendance-cloud-request-status'))
}
window.addEventListener('attendance-cloud-ready',requestCloudStatus);
window.addEventListener('attendance-cloud-diagnostics',e=>{
  const box=$('cloudDiagnostics');
  if(!box)return;
  box.hidden=false;
  box.textContent=JSON.stringify(e.detail||{},null,2)
});

function switchEmployee(employeeId){
  if(!EMPLOYEES.some(e=>e.id===employeeId))return;
  // 現在社員を保存してから切替
  persist();
  activeEmployeeId=employeeId;
  localStorage.setItem(ACTIVE_EMP_KEY,activeEmployeeId);
  state=load();
  const sel=$('employeeSwitcher');if(sel)sel.value=activeEmployeeId;
  renderAll();loadTodayForm();
  window.dispatchEvent(new CustomEvent('attendance-employee-change',{detail:{employeeId:activeEmployeeId,state}}));
  window.dispatchEvent(new Event('attendance-cloud-reconnect'));
}


let deepLinkApplied=false;
function applyPortalDeepLink(){
  if(deepLinkApplied)return;
  if(!requestedDate)return;
  deepLinkApplied=true;
  // 月間を表示した上で、その日の日別編集を直接開く。
  try{
    const tab=document.querySelector('.tab[data-view="overview"]');
    if(tab){
      document.querySelectorAll('.tab,.view').forEach(x=>x.classList.remove('active'));
      tab.classList.add('active');
      const view=$('view-overview');if(view)view.classList.add('active');
      renderOverview();
    }
    if(requestedEdit)openDayEdit(requestedDate);
  }catch(e){console.error('portal deep link failed',e)}
}


function bindLoginControls(){
  const loginButton=$('loginButton');
  const loginPassword=$('loginPassword');
  const confirmPassword=$('confirmPassword');
  const logoutButton=$('logoutButton');

  if(loginButton)loginButton.onclick=()=>login().catch(err=>{
    console.error('login failed',err);
    const msg=$('loginMessage');if(msg)msg.textContent='ログイン処理でエラーが発生しました。再読込してください。';
  });
  if(logoutButton)logoutButton.onclick=logout;
  if(loginPassword)loginPassword.onkeydown=e=>{if(e.key==='Enter')loginButton?.click()};
  if(confirmPassword)confirmPassword.onkeydown=e=>{if(e.key==='Enter')loginButton?.click()};
}
bindLoginControls();

function setup(){const employeeSwitcher=$('employeeSwitcher');if(employeeSwitcher){employeeSwitcher.value=activeEmployeeId;employeeSwitcher.onchange=()=>switchEmployee(employeeSwitcher.value)}
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab,.view').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('view-'+b.dataset.view).classList.add('active');if(b.dataset.view==='ledger')renderLedger();if(b.dataset.view==='overview')renderOverview()});document.querySelectorAll('.now').forEach(b=>b.onclick=e=>{e.preventDefault();$(b.dataset.target).value=hm();previewToday()});['workType','start','end','out','back'].forEach(id=>$(id).addEventListener('input',previewToday));['fiscalYear','fiscalStartMonth','fiscalStartDay','cutoffDay'].forEach(id=>$(id).addEventListener('input',renderPeriodPreview));$('saveToday').onclick=saveToday;$('saveAllLedger').onclick=()=>{let ok=0;document.querySelectorAll('[data-ledger-entry].dirty').forEach(entry=>{if(saveLedgerRow(entry))ok++});$('ledgerSaveMessage').textContent=ok?`${ok}件を保存しました。`:'変更された行はありません。'};$('reloadLedger').onclick=renderLedger;$('calendarMonth').onchange=renderCalendar;
$('overviewPeriod').onchange=renderOverview;$('prevOverviewPeriod').onclick=()=>{const i=Math.max(0,(+$('overviewPeriod').value||0)-1);$('overviewPeriod').value=String(i);renderOverview()};$('nextOverviewPeriod').onclick=()=>{const i=Math.min(11,(+$('overviewPeriod').value||0)+1);$('overviewPeriod').value=String(i);renderOverview()};$('saveDayEdit').onclick=e=>{e.preventDefault();saveOverviewDay()};$('deleteDayEdit').onclick=deleteOverviewDay;['dayEditType','dayEditStart','dayEditEnd','dayEditOut','dayEditBack'].forEach(id=>$(id).addEventListener('input',()=>{const r={type:$('dayEditType').value,start:$('dayEditStart').value,end:$('dayEditEnd').value,out:$('dayEditOut').value,back:$('dayEditBack').value,note:$('dayEditNote').value},old=state.records[editDate];state.records[editDate]=r;const c=calcRecord(editDate,r),o=weeklyOvertimeMap()[editDate]?.overtime||0;if(old)state.records[editDate]=old;else delete state.records[editDate];$('dayEditCalc').innerHTML=`<div><span>就労</span><strong>${hoursToClock(c.work)}</strong></div><div><span>時間外</span><strong>${hoursToClock(o)}</strong></div><div><span>法定休日</span><strong>${hoursToClock(c.statutoryHolidayWork)}</strong></div><div><span>代休</span><strong>${c.compEarn?'+1日':'―'}</strong></div>`}));$('ledgerPeriod').onchange=renderLedger;
$('prevLedgerPeriod').onclick=()=>{const i=Math.max(0,(+$('ledgerPeriod').value||0)-1);$('ledgerPeriod').value=String(i);renderLedger()};
$('nextLedgerPeriod').onclick=()=>{const i=Math.min(11,(+$('ledgerPeriod').value||0)+1);$('ledgerPeriod').value=String(i);renderLedger()};$('saveHoliday').onclick=()=>{const before=holidayFor(dialogDate),after={type:$('holidayType').value,name:$('holidayName').value};if(before.type!==after.type||before.name!==after.name){state.holidayHistory=state.holidayHistory||[];state.holidayHistory.push({date:dialogDate,from:before.type,to:after.type,reason:$('holidayReason').value||'',changedAt:new Date().toISOString()})}state.calendar[dialogDate]=after;persist();renderAll()};$('saveSettings').onclick=saveSettings;

$('cloudGoogleSignIn').onclick=()=>window.dispatchEvent(new Event('attendance-cloud-google-signin'));
$('cloudSignOut').onclick=()=>window.dispatchEvent(new Event('attendance-cloud-signout'));
$('cloudPush').onclick=()=>window.dispatchEvent(new CustomEvent('attendance-cloud-push',{detail:structuredClone(state)}));
$('cloudPull').onclick=()=>window.dispatchEvent(new Event('attendance-cloud-pull'));
$('cloudDiagnose').onclick=()=>window.dispatchEvent(new Event('attendance-cloud-diagnose'));$('exportJson').onclick=()=>download('attendance-backup.json',JSON.stringify(state,null,2),'application/json');$('importJson').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{const x=JSON.parse(r.result);state={version:8,settings:{...defaults.settings,...(x.settings||{})},records:x.records||{},calendar:x.calendar||{},holidayHistory:Array.isArray(x.holidayHistory)?x.holidayHistory:[]};persist();renderAll();loadTodayForm();alert('復元しました')};r.readAsText(f)};$('exportCsv').onclick=exportCsv;$('importExcel').onchange=e=>{const f=e.target.files[0];if(f)importWorkbook(f)};$('resetData').onclick=()=>{if(confirm('全データを削除しますか？')){state=structuredClone(defaults);persist();renderAll();loadTodayForm()}};window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;$('installBtn').hidden=false});$('installBtn').onclick=async()=>{if(deferredPrompt){deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;$('installBtn').hidden=true}};let lastMobile=isMobileLedger();
window.addEventListener('resize',()=>{const now=isMobileLedger();if(now!==lastMobile){lastMobile=now;const ledgerView=$('view-ledger');if(ledgerView&&ledgerView.classList.contains('active'))renderLedger()}});
if(sessionValid()){$('lockScreen').hidden=true;renderAll();loadTodayForm();setTimeout(applyPortalDeepLink,0)}else showLock();requestCloudStatus()}
try{
  setup();
}catch(err){
  console.error('TIME setup error',err);
  bindLoginControls();
  const msg=$('loginMessage');
  if(msg && !$('lockScreen')?.hidden)msg.textContent='一部初期化に失敗しましたが、ログインは可能です。';
}

window.HokuyouAttendanceEmployee=()=>activeEmployeeId;
window.HokuyouAttendanceEmployeeStore=()=>employeeStore();
