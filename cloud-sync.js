import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const CONFIG = window.FIREBASE_CONFIG || {};
const ALLOWED = (window.FIREBASE_ALLOWED_EMAILS || [])
  .map(value => String(value).trim().toLowerCase())
  .filter(Boolean);

const LOCAL_KEYS = ["attendancePwaV6", "attendancePwaV5", "attendancePwaV4"];
const configured =
  Boolean(CONFIG.apiKey) &&
  !String(CONFIG.apiKey).startsWith("PASTE_") &&
  Boolean(CONFIG.projectId) &&
  !String(CONFIG.projectId).startsWith("PASTE_");

let auth = null;
let db = null;
let user = null;
let unsubscribe = null;
let pushTimer = null;
let initialized = false;
let realtimeReady = false;
let lastCloudState = null;
let lastError = null;
let lastAction = "起動";
let currentStatus = {
  state: "offline",
  label: "初期化中",
  message: "",
  signedIn: false,
  user: "",
  lastSync: "―"
};

function nowIso() {
  return new Date().toISOString();
}

function localState() {
  for (const key of LOCAL_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (error) {
      console.warn("ローカルデータ解析失敗", key, error);
    }
  }
  return {};
}

function hasMeaningfulLocalData(data = {}) {
  const recordCount = Object.keys(data.records || {}).length;
  const calendarCount = Object.keys(data.calendar || {}).length;
  return recordCount > 0 || calendarCount > 0;
}

function allowed(account) {
  if (!ALLOWED.length) return true;
  return ALLOWED.includes(String(account?.email || "").toLowerCase());
}

function stateRef(account = user) {
  if (!db || !account) throw new Error("Firestoreまたはログイン情報がありません。");
  return doc(db, "users", account.uid, "apps", "attendance-main");
}

function normalizeState(value = {}) {
  return {
    version: 6.2,
    settings: value.settings || {},
    records: value.records || {},
    calendar: value.calendar || {},
    clientUpdatedAt: value.clientUpdatedAt || nowIso()
  };
}

function mergeRecords(localRecords = {}, cloudRecords = {}) {
  const merged = { ...cloudRecords };
  for (const [date, localRecord] of Object.entries(localRecords)) {
    const cloudRecord = merged[date];
    if (!cloudRecord) {
      merged[date] = localRecord;
      continue;
    }
    const localTime = Date.parse(localRecord?.updatedAt || 0) || 0;
    const cloudTime = Date.parse(cloudRecord?.updatedAt || 0) || 0;
    if (localTime > cloudTime) merged[date] = localRecord;
  }
  return merged;
}

function mergeForExistingDevice(local = {}, cloud = {}) {
  return {
    version: 6.2,
    // クラウド設定を優先。クラウド側にない項目だけローカルで補う。
    settings: { ...(local.settings || {}), ...(cloud.settings || {}) },
    records: mergeRecords(local.records || {}, cloud.records || {}),
    calendar: { ...(local.calendar || {}), ...(cloud.calendar || {}) },
    clientUpdatedAt: nowIso()
  };
}

function emitState(data) {
  window.dispatchEvent(
    new CustomEvent("attendance-cloud-state", { detail: normalizeState(data) })
  );
}

function emitStatus() {
  const detail = {
    ...currentStatus,
    signedIn: Boolean(user),
    user: user?.email || "",
    lastSync: lastCloudState?.clientUpdatedAt
      ? new Date(lastCloudState.clientUpdatedAt).toLocaleString("ja-JP")
      : "―"
  };
  window.dispatchEvent(
    new CustomEvent("attendance-cloud-status", { detail })
  );
}

function setStatus(state, label, message = "") {
  currentStatus = {
    state,
    label,
    shortLabel:
      state === "online"
        ? "同期済"
        : state === "syncing"
          ? "同期中"
          : state === "error"
            ? "同期エラー"
            : "ローカル",
    message,
    signedIn: Boolean(user),
    user: user?.email || "",
    lastSync: lastCloudState?.clientUpdatedAt
      ? new Date(lastCloudState.clientUpdatedAt).toLocaleString("ja-JP")
      : "―"
  };
  lastAction = label;
  emitStatus();
}

function diagnostics() {
  return {
    version: "6.2",
    configured,
    initialized,
    realtimeReady,
    online: navigator.onLine,
    userAgent: navigator.userAgent,
    firebaseUser: user
      ? { uid: user.uid, email: user.email, providerId: user.providerId }
      : null,
    firestorePath: user
      ? `users/${user.uid}/apps/attendance-main`
      : null,
    status: currentStatus,
    lastAction,
    lastError: lastError
      ? {
          code: lastError.code || "",
          name: lastError.name || "",
          message: lastError.message || String(lastError)
        }
      : null,
    local: {
      records: Object.keys(localState().records || {}).length,
      calendar: Object.keys(localState().calendar || {}).length
    },
    cloud: lastCloudState
      ? {
          records: Object.keys(lastCloudState.records || {}).length,
          calendar: Object.keys(lastCloudState.calendar || {}).length,
          clientUpdatedAt: lastCloudState.clientUpdatedAt || ""
        }
      : null
  };
}

function emitDiagnostics() {
  window.dispatchEvent(
    new CustomEvent("attendance-cloud-diagnostics", {
      detail: diagnostics()
    })
  );
}

async function writeCloud(data, message = "クラウドへ保存しています…") {
  if (!user || !db) throw new Error("クラウドへログインしていません。");

  const payload = normalizeState(data);
  payload.ownerUid = user.uid;
  payload.ownerEmail = user.email || "";
  payload.clientUpdatedAt = nowIso();
  payload.serverUpdatedAt = serverTimestamp();

  setStatus("syncing", "送信中", message);
  await setDoc(stateRef(), payload, { merge: false });

  lastCloudState = {
    ...payload,
    serverUpdatedAt: undefined
  };
  setStatus("online", "同期済", "クラウドへ保存しました。");
}

function schedulePush(data) {
  if (!user || !db || !realtimeReady) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    writeCloud(data, "変更をクラウドへ保存しています…").catch(error => {
      lastError = error;
      console.error(error);
      setStatus("error", "同期エラー", error.message);
    });
  }, 600);
}

async function pullCloud({ announce = true } = {}) {
  if (!user || !db) throw new Error("クラウドへログインしていません。");

  if (announce) setStatus("syncing", "受信中", "クラウドから読み込んでいます…");
  const snapshot = await getDoc(stateRef());

  if (!snapshot.exists()) {
    if (announce) setStatus("online", "同期準備完了", "クラウドにデータがありません。");
    return null;
  }

  const cloud = normalizeState(snapshot.data());
  lastCloudState = cloud;
  emitState(cloud);

  if (announce) setStatus("online", "同期済", "クラウドの内容を読み込みました。");
  return cloud;
}

async function establishRealtime(account) {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  realtimeReady = false;

  const ref = stateRef(account);
  setStatus("syncing", "初回同期", "クラウド台帳を確認しています…");

  const snapshot = await getDoc(ref);
  const local = normalizeState(localState());

  if (!snapshot.exists()) {
    // 初回の最初の端末。ローカルの内容をクラウドへ作成。
    await writeCloud(local, "この端末のデータをクラウドへ登録しています…");
    emitState(local);
  } else {
    const cloud = normalizeState(snapshot.data());
    lastCloudState = cloud;

    if (hasMeaningfulLocalData(local)) {
      // 既存端末なら更新時刻を比較して統合。
      const merged = mergeForExistingDevice(local, cloud);
      emitState(merged);

      const differs =
        JSON.stringify(merged.records) !== JSON.stringify(cloud.records) ||
        JSON.stringify(merged.calendar) !== JSON.stringify(cloud.calendar) ||
        JSON.stringify(merged.settings) !== JSON.stringify(cloud.settings);

      if (differs) {
        await writeCloud(merged, "端末とクラウドの差分を統合しています…");
      }
    } else {
      // 新しいスマホなど、ローカルが空ならクラウドをそのまま採用。
      emitState(cloud);
    }
  }

  unsubscribe = onSnapshot(
    ref,
    snapshotValue => {
      if (!snapshotValue.exists()) return;
      const cloud = normalizeState(snapshotValue.data());
      lastCloudState = cloud;
      emitState(cloud);
      setStatus("online", "同期済", "クラウドとのリアルタイム同期は有効です。");
    },
    error => {
      lastError = error;
      console.error(error);
      setStatus("error", "同期エラー", error.message);
    }
  );

  realtimeReady = true;
  setStatus("online", "同期済", "PC・スマホ同期は有効です。");
}

function isMobileBrowser() {
  return (
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    window.matchMedia("(max-width: 820px)").matches
  );
}

async function signIn() {
  if (!configured) {
    setStatus(
      "error",
      "Firebase未設定",
      "firebase-config.jsへFirebase構成を設定してください。"
    );
    return;
  }
  if (!auth) {
    setStatus("error", "認証準備中", "数秒後にもう一度押してください。");
    return;
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  if (isMobileBrowser()) {
    setStatus("syncing", "Googleへ移動", "Googleログイン画面へ移動します…");
    await signInWithRedirect(auth, provider);
    return;
  }

  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    const redirectCodes = [
      "auth/popup-blocked",
      "auth/popup-closed-by-user",
      "auth/cancelled-popup-request",
      "auth/operation-not-supported-in-this-environment",
      "auth/web-storage-unsupported"
    ];
    if (redirectCodes.includes(error.code)) {
      setStatus(
        "syncing",
        "Googleへ移動",
        "画面遷移方式のGoogleログインへ切り替えます…"
      );
      await signInWithRedirect(auth, provider);
      return;
    }
    throw error;
  }
}

async function init() {
  if (!configured) {
    initialized = true;
    setStatus(
      "offline",
      "Firebase未設定",
      "ローカル保存で動作しています。"
    );
    window.dispatchEvent(new Event("attendance-cloud-ready"));
    return;
  }

  try {
    const app = initializeApp(CONFIG);
    auth = getAuth(app);
    db = getFirestore(app);
    await setPersistence(auth, browserLocalPersistence);

    try {
      await getRedirectResult(auth);
    } catch (error) {
      lastError = error;
      console.error(error);
      setStatus(
        "error",
        "ログイン失敗",
        `${error.code || "Firebase"}: ${error.message}`
      );
    }

    onAuthStateChanged(auth, async account => {
      if (!account) {
        user = null;
        realtimeReady = false;
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
        setStatus(
          "offline",
          "未ログイン",
          "GoogleでログインするとPC・スマホ同期を開始します。"
        );
        return;
      }

      if (!allowed(account)) {
        const deniedEmail = account.email || "このアカウント";
        await signOut(auth);
        setStatus(
          "error",
          "許可されていないアカウント",
          `${deniedEmail}は許可リストにありません。`
        );
        return;
      }

      user = account;
      setStatus("syncing", "接続中", "クラウド台帳へ接続しています…");

      try {
        await establishRealtime(account);
      } catch (error) {
        lastError = error;
        console.error(error);
        setStatus("error", "同期エラー", error.message);
      }
    });

    initialized = true;
    window.dispatchEvent(new Event("attendance-cloud-ready"));
    emitStatus();
  } catch (error) {
    initialized = true;
    lastError = error;
    console.error(error);
    setStatus("error", "Firebase初期化エラー", error.message);
    window.dispatchEvent(new Event("attendance-cloud-ready"));
  }
}

window.addEventListener("attendance-local-change", event => {
  schedulePush(event.detail);
});

window.addEventListener("attendance-cloud-signin", () => {
  signIn().catch(error => {
    lastError = error;
    console.error(error);
    setStatus("error", "ログイン失敗", error.message);
  });
});

window.addEventListener("attendance-cloud-signout", () => {
  if (auth) signOut(auth);
});

window.addEventListener("attendance-cloud-push", event => {
  writeCloud(event.detail, "この端末のデータをクラウドへ送っています…").catch(error => {
    lastError = error;
    console.error(error);
    setStatus("error", "送信失敗", error.message);
  });
});

window.addEventListener("attendance-cloud-pull", () => {
  pullCloud().catch(error => {
    lastError = error;
    console.error(error);
    setStatus("error", "受信失敗", error.message);
  });
});

window.addEventListener("attendance-cloud-request-status", () => {
  emitStatus();
});

window.addEventListener("attendance-cloud-diagnose", () => {
  emitDiagnostics();
});

window.addEventListener("online", () => {
  if (user) {
    establishRealtime(user).catch(error => {
      lastError = error;
      setStatus("error", "再接続失敗", error.message);
    });
  }
});

window.addEventListener("offline", () => {
  setStatus("offline", "オフライン", "端末内へ保存し、通信復旧後に再接続します。");
});

init();
