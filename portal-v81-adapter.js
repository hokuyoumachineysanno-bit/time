// portal-v81-adapter.js
(function(global){
  "use strict";
  function merge(portalDb){
    if(!window.HokuyouSharedStore)return portalDb;
    const s=HokuyouSharedStore.read();

    // 社員マスタはportalを正とする。
    // v8.1は社員IDを持たないため、attendanceEmployeeIdで1人に紐付け。
    if(s.companyCalendar?.length){
      portalDb.holidays=s.companyCalendar
        .filter(x=>x.type==="statutory"||x.type==="company")
        .map(x=>({
          id:x.id,date:x.date,
          type:x.type==="statutory"?"statutory":"company",
          name:x.name||(x.type==="statutory"?"法定休日":"所定休日")
        }));
    }

    if(s.attendanceRecords?.length){
      portalDb.attendance=s.attendanceRecords.map(x=>({
        employeeId:x.employeeId,
        date:x.date,
        type:x.type,
        work:0,
        overtime:0,
        paidLeave:x.type==="有休"?1:(x.type==="午前半休"||x.type==="午後半休"?0.5:0),
        start:x.in||"",
        end:x.out||"",
        note:x.note||""
      }));
    }
    return portalDb;
  }

  function pushBusinessData(portalDb){
    if(!window.HokuyouSharedStore)return;
    HokuyouSharedStore.update(s=>{
      s.employees=portalDb.employees||[];
      s.projects=portalDb.projects||[];
      s.tasks=portalDb.tasks||[];
      s.vehicles=portalDb.vehicles||[];
      s.customers=portalDb.customers||[];
      return s;
    });
  }

  global.HokuyouPortalV81Adapter={merge,pushBusinessData};
})(window);
