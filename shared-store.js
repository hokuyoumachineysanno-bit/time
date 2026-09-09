// shared-store.js — v8.1 + portal 共通ストア
(function(global){
  "use strict";
  const KEY = "hokuyou.portal.v1";
  const blank = () => ({
    schemaVersion: 1,
    updatedAt: null,
    employees: [],
    companyCalendar: [],
    attendanceRecords: [],
    projects: [],
    tasks: [],
    vehicles: [],
    customers: []
  });
  function read(){
    try{
      const raw=localStorage.getItem(KEY);
      return raw ? Object.assign(blank(),JSON.parse(raw)) : blank();
    }catch(e){console.error(e);return blank()}
  }
  function write(state){
    const next=Object.assign(blank(),state,{schemaVersion:1,updatedAt:new Date().toISOString()});
    localStorage.setItem(KEY,JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("hokuyou:store-updated",{detail:next}));
    return next;
  }
  function update(fn){const s=read(),draft=JSON.parse(JSON.stringify(s));return write(fn(draft)||draft)}
  global.HokuyouSharedStore={KEY,read,write,update};
})(window);
