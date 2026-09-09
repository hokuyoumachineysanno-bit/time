// time-v82-bridge.js
// EMPごとのTIMEをportal共通ストアへ集約。
(function(global){
  "use strict";
  if(!global.HokuyouSharedStore)return;

  const EMP_STORE_KEY="attendancePwaV82ByEmployee";
  const EMPLOYEES=[
    {id:"EMP-001",name:"社長"},{id:"EMP-002",name:"専務"},{id:"EMP-003",name:"山田"},
    {id:"EMP-004",name:"佐藤"},{id:"EMP-005",name:"鈴木"}
  ];

  function employeeStore(){
    try{return JSON.parse(localStorage.getItem(EMP_STORE_KEY)||"{}")}catch{return{}}
  }

  function sync(){
    const store=employeeStore();
    const shared=HokuyouSharedStore.read();

    // portal社員マスタが空のときだけ初期社員を供給
    if(!shared.employees?.length){
      shared.employees=EMPLOYEES.map((e,i)=>({
        id:e.id,name:e.name,role:i<2?e.name:"社員",active:true,attendance:true,
        start:"08:30",end:"17:30",order:i+1
      }));
    }

    const attendance=[];
    const calendarMap={};

    for(const emp of EMPLOYEES){
      const state=store[emp.id];
      if(!state)continue;

      for(const [date,r] of Object.entries(state.records||{})){
        attendance.push({
          employeeId:emp.id,date,
          type:r?.type||"出勤",in:r?.start||"",out:r?.end||"",
          outside:r?.out||"",back:r?.back||"",note:r?.note||"",
          updatedAt:r?.updatedAt||null
        });
      }

      // 会社カレンダーは社員間で同一想定。日付ごとに統合。
      for(const [date,h] of Object.entries(state.calendar||{})){
        let type="work";
        if(h?.type==="法定休日")type="statutory";
        else if(h?.type==="所定休日"||h?.type==="会社休業日")type="company";
        calendarMap[date]={
          id:`CAL-${date}`,date,type,sourceType:h?.type||"勤務日",
          name:h?.name||h?.type||"勤務日"
        };
      }
    }

    shared.attendanceRecords=attendance;
    shared.companyCalendar=Object.values(calendarMap).sort((a,b)=>a.date.localeCompare(b.date));
    shared.attendanceVersion=8.2;
    shared.activeAttendanceEmployee=localStorage.getItem("attendancePwaV82ActiveEmployee")||"EMP-004";
    HokuyouSharedStore.write(shared);
  }

  window.addEventListener("attendance-local-change",sync);
  window.addEventListener("attendance-cloud-state",sync);
  window.addEventListener("attendance-employee-change",sync);
  sync();

  global.HokuyouV82Bridge={sync,EMP_STORE_KEY,EMPLOYEES};
})(window);
