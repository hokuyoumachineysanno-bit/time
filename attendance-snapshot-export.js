// attendance-snapshot-export.js
// TIME -> 社内業務ポータル用の一方向スナップショット。
// 編集元はTIMEだけ。ポータルはこのキーを参照するだけ。
(function(){
  "use strict";
  const EMP_STORE_KEY="attendancePwaV82ByEmployee";
  const SNAPSHOT_KEY="hokuyou.time.snapshot.v1";
  const ACTIVE_EMP_KEY="attendancePwaV82ActiveEmployee";
  const EMPLOYEES=[
    {id:"EMP-001",name:"社長"},
    {id:"EMP-002",name:"専務"},
    {id:"EMP-003",name:"山田"},
    {id:"EMP-004",name:"佐藤"},
    {id:"EMP-005",name:"鈴木"}
  ];

  function readStore(){
    try{return JSON.parse(localStorage.getItem(EMP_STORE_KEY)||"{}")}catch{return{}}
  }
  function minutes(v){
    if(!v||!/^\d{1,2}:\d{2}$/.test(v))return null;
    const [h,m]=v.split(":").map(Number); return h*60+m;
  }
  function simpleDuration(r){
    const s=minutes(r?.start), e=minutes(r?.end);
    if(s==null||e==null||e<s)return null;
    const os=minutes(r?.out), ob=minutes(r?.back);
    let mins=e-s;
    if(os!=null&&ob!=null&&ob>=os)mins-=ob-os;
    return Math.max(0,mins);
  }
  function exportSnapshot(){
    const store=readStore();
    const employees={};
    const calendar={};

    for(const emp of EMPLOYEES){
      const state=store[emp.id]||null;
      const records={};
      if(state){
        for(const [date,r] of Object.entries(state.records||{})){
          records[date]={
            date,
            type:r?.type||"",
            start:r?.start||"",
            end:r?.end||"",
            out:r?.out||"",
            back:r?.back||"",
            note:r?.note||"",
            raw:r,
            elapsedMinutes:simpleDuration(r)
          };
        }
        // 暦はTIMEを正本として格納。複数EMPで同日があれば後勝ちだが通常は同一暦。
        for(const [date,c] of Object.entries(state.calendar||{})){
          calendar[date]={
            date,
            type:c?.type||"勤務日",
            name:c?.name||c?.type||"勤務日"
          };
        }
      }
      employees[emp.id]={
        id:emp.id,
        name:emp.name,
        hasTimeData:!!state,
        records,
        settings:state?.settings||{},
        holidayHistory:state?.holidayHistory||[]
      };
    }

    const snapshot={
      schema:"hokuyou.time.snapshot.v1",
      exportedAt:new Date().toISOString(),
      activeEmployeeId:localStorage.getItem(ACTIVE_EMP_KEY)||"EMP-004",
      employees,
      calendar
    };
    localStorage.setItem(SNAPSHOT_KEY,JSON.stringify(snapshot));
    window.dispatchEvent(new CustomEvent("hokuyou-time-snapshot-updated",{detail:{exportedAt:snapshot.exportedAt}}));
    return snapshot;
  }

  // TIME保存・クラウド反映・社員切替の後に更新
  window.addEventListener("attendance-local-change",exportSnapshot);
  window.addEventListener("attendance-cloud-state",exportSnapshot);
  window.addEventListener("attendance-employee-change",exportSnapshot);
  window.addEventListener("load",()=>setTimeout(exportSnapshot,200));

  window.HokuyouAttendanceSnapshot={export:exportSnapshot,key:SNAPSHOT_KEY};
})();