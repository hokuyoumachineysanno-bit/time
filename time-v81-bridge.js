// time-v81-bridge.js
// 勤怠管理 v8.1 の実データ構造 attendancePwaV6 を共通ストアへ反映。
(function(global){
  "use strict";
  if(!global.HokuyouSharedStore)return;

  const ATTENDANCE_KEY="attendancePwaV6";

  // v8.1 は現状「社員IDを持たない1人分の勤怠台帳」。
  // 実機テストでは、この台帳をどの社員として扱うかをここで指定する。
  // 社員マスタのIDに合わせること。
  const TIME_EMPLOYEE_ID="EMP-001";

  function readV81(){
    try{return JSON.parse(localStorage.getItem(ATTENDANCE_KEY)||"{}")}
    catch(e){console.error("v8.1 state parse error",e);return{}}
  }

  function normalizeCalendar(calendar={}){
    return Object.entries(calendar).map(([date,h],i)=>{
      let type="work";
      if(h?.type==="法定休日")type="statutory";
      else if(h?.type==="所定休日"||h?.type==="会社休業日")type="company";
      return{
        id:`CAL-${date}`,
        date,
        type,
        sourceType:h?.type||"勤務日",
        name:h?.name||h?.type||"勤務日"
      };
    });
  }

  function hmToHours(hm){
    if(!hm||!String(hm).includes(":"))return 0;
    const [h,m]=String(hm).split(":").map(Number);
    return h+(m||0)/60;
  }

  // portal用の簡易実績。正確な時間外等はv8.1自身を正とし、
  // portalでは勤務区分・時間帯の参照用途に使う。
  function normalizeRecords(records={}){
    return Object.entries(records).map(([date,r])=>({
      employeeId:TIME_EMPLOYEE_ID,
      date,
      type:r?.type||"出勤",
      in:r?.start||"",
      out:r?.end||"",
      outside:r?.out||"",
      back:r?.back||"",
      note:r?.note||"",
      updatedAt:r?.updatedAt||null
    }));
  }

  function sync(stateFromEvent){
    const v81=stateFromEvent||readV81();
    const shared=HokuyouSharedStore.read();

    shared.companyCalendar=normalizeCalendar(v81.calendar||{});
    shared.attendanceRecords=normalizeRecords(v81.records||{});
    shared.attendanceSettings=v81.settings||{};
    shared.attendanceVersion=v81.version||8.1;
    shared.attendanceEmployeeId=TIME_EMPLOYEE_ID;

    HokuyouSharedStore.write(shared);
    console.info("勤怠v8.1 → portal 共通ストア同期",{
      employeeId:TIME_EMPLOYEE_ID,
      records:shared.attendanceRecords.length,
      calendar:shared.companyCalendar.length
    });
  }

  // v8.1 app.js の persist() が発火するイベントをそのまま利用。
  window.addEventListener("attendance-local-change",e=>sync(e.detail));

  // Firebaseから新stateを受けた時にも反映。
  window.addEventListener("attendance-cloud-state",e=>sync(e.detail));

  // 起動時
  sync();

  global.HokuyouV81Bridge={sync,ATTENDANCE_KEY,TIME_EMPLOYEE_ID};
})(window);
