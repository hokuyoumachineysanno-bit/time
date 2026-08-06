import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const CONFIG=window.FIREBASE_CONFIG||{};
const ALLOWED=(window.FIREBASE_ALLOWED_EMAILS||[]).map(x=>String(x).toLowerCase());
const configured=CONFIG.apiKey&&!String(CONFIG.apiKey).startsWith("PASTE_")&&
  CONFIG.projectId&&!String(CONFIG.projectId).startsWith("PASTE_");

let auth=null,db=null,user=null,unsubscribe=null,pushTimer=null,lastCloudState=null;
let suppressNextSnapshot=false;

function emitStatus(detail){
  window.dispatchEvent(new CustomEvent("attendance-cloud-status",{detail}))
}
function emitState(data){
  window.dispatchEvent(new CustomEvent("attendance-cloud-state",{detail:data}))
}
function status(state,label,message=""){
  emitStatus({
    state,label,shortLabel:state==="online"?"同期中":state==="syncing"?"送信中":state==="error"?"同期エラー":"ローカル",
    message,
    signedIn:Boolean(user),
    user:user?.email||"",
    lastSync:lastCloudState?.clientUpdatedAt?new Date(lastCloudState.clientUpdatedAt).toLocaleString("ja-JP"):"―"
  })
}
function allowed(u){
  return !ALLOWED.length||ALLOWED.includes(String(u?.email||"").toLowerCase())
}
function stateRef(u=user){
  return doc(db,"users",u.uid,"apps","attendance-main")
}
function normalizeState(x={}){
  return {
    version:6,
    settings:x.settings||{},
    records:x.records||{},
    calendar:x.calendar||{},
    clientUpdatedAt:x.clientUpdatedAt||new Date().toISOString()
  }
}
function mergeRecords(a={},b={}){
  const out={...a};
  for(const [key,value] of Object.entries(b)){
    const old=out[key];
    if(!old){out[key]=value;continue}
    const at=Date.parse(old.updatedAt||0)||0;
    const bt=Date.parse(value.updatedAt||0)||0;
    if(bt>=at)out[key]=value
  }
  return out
}
function mergeStates(local={},cloud={}){
  return {
    version:6,
    settings:{...(local.settings||{}),...(cloud.settings||{})},
    records:mergeRecords(local.records||{},cloud.records||{}),
    calendar:{...(local.calendar||{}),...(cloud.calendar||{})},
    clientUpdatedAt:new Date().toISOString()
  }
}
async function pushNow(data){
  if(!user||!db)return;
  const payload=normalizeState(data);
  payload.ownerUid=user.uid;
  payload.ownerEmail=user.email||"";
  payload.clientUpdatedAt=new Date().toISOString();
  payload.serverUpdatedAt=serverTimestamp();
  status("syncing","送信中","クラウドへ保存しています…");
  suppressNextSnapshot=true;
  await setDoc(stateRef(),payload,{merge:false});
  lastCloudState=payload;
  status("online","同期済","PC・スマホ同期は有効です。")
}
function schedulePush(data){
  if(!user||!db)return;
  clearTimeout(pushTimer);
  pushTimer=setTimeout(()=>pushNow(data).catch(e=>{
    console.error(e);status("error","同期エラー",e.message)
  }),450)
}
async function pullNow(){
  if(!user||!db)return;
  status("syncing","受信中","クラウドから読み込んでいます…");
  const snap=await getDoc(stateRef());
  if(snap.exists()){
    const cloud=normalizeState(snap.data());
    lastCloudState=cloud;
    emitState(cloud);
    status("online","同期済","クラウドの内容を読み込みました。")
  }else{
    status("online","同期準備完了","クラウドにまだデータがありません。")
  }
}
async function beginRealtime(u){
  if(unsubscribe)unsubscribe();
  const ref=stateRef(u);
  const snap=await getDoc(ref);
  const local=JSON.parse(localStorage.getItem("attendancePwaV6")||localStorage.getItem("attendancePwaV5")||"{}");
  if(!snap.exists()){
    await pushNow(local);
  }else{
    const cloud=normalizeState(snap.data());
    const merged=mergeStates(local,cloud);
    lastCloudState=merged;
    emitState(merged);
    await pushNow(merged)
  }
  unsubscribe=onSnapshot(ref,snapshot=>{
    if(!snapshot.exists())return;
    const cloud=normalizeState(snapshot.data());
    lastCloudState=cloud;
    if(suppressNextSnapshot){suppressNextSnapshot=false;status("online","同期済","PC・スマホ同期は有効です。");return}
    emitState(cloud);
    status("online","同期済","別端末の変更を反映しました。")
  },e=>{
    console.error(e);status("error","同期エラー",e.message)
  })
}
async function signIn(){
  if(!configured){
    status("error","Firebase未設定","firebase-config.jsへFirebase構成を貼り付けてください。");
    return
  }
  const provider=new GoogleAuthProvider();
  provider.setCustomParameters({prompt:"select_account"});
  try{
    await signInWithPopup(auth,provider)
  }catch(e){
    if(["auth/popup-blocked","auth/cancelled-popup-request","auth/operation-not-supported-in-this-environment"].includes(e.code)){
      await signInWithRedirect(auth,provider)
    }else{
      throw e
    }
  }
}
async function init(){
  if(!configured){
    status("offline","Firebase未設定","ローカル保存で動作中です。同期にはFirebase設定が必要です。");
    return
  }
  try{
    const app=initializeApp(CONFIG);
    auth=getAuth(app);
    db=getFirestore(app);
    onAuthStateChanged(auth,async u=>{
      if(!u){
        user=null;
        if(unsubscribe){unsubscribe();unsubscribe=null}
        status("offline","未ログイン","Googleでログインすると端末間同期を開始します。");
        return
      }
      if(!allowed(u)){
        await signOut(auth);
        status("error","許可されていないアカウント",`${u.email||"このアカウント"}は許可リストにありません。`);
        return
      }
      user=u;
      status("syncing","接続中","クラウド台帳へ接続しています…");
      try{await beginRealtime(u)}
      catch(e){console.error(e);status("error","同期エラー",e.message)}
    })
  }catch(e){
    console.error(e);status("error","Firebase初期化エラー",e.message)
  }
}

window.addEventListener("attendance-local-change",e=>schedulePush(e.detail));
window.addEventListener("attendance-cloud-signin",()=>signIn().catch(e=>status("error","ログイン失敗",e.message)));
window.addEventListener("attendance-cloud-signout",()=>auth&&signOut(auth));
window.addEventListener("attendance-cloud-push",e=>pushNow(e.detail).catch(err=>status("error","送信失敗",err.message)));
window.addEventListener("attendance-cloud-pull",()=>pullNow().catch(err=>status("error","受信失敗",err.message)));

init();
