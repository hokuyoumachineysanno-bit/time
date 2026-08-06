import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
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

const VERSION = "7.0";
const CONFIG = window.FIREBASE_CONFIG || {};
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
let realtimeReady = false;
let initialized = false;
let lastCloudState = null;
let lastError = null;
let lastAction = "起動";

let currentStatus = {
  state: "offline",
  label: "初期化中",
  shortLabel: "ローカル",
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
  return (
    Object.keys(data.records || {}).length > 0 ||
    Object.keys(data.calendar || {}).length > 0
  );
}

/*
全端末が同じ共有台帳を使用します。
Firestoreルールにより、ログイン済み利用者だけがアクセスできます。
*/
function stateRef() {
  if (!db || !user) {
    throw new Error("Firestoreまたはログイン情報がありません。");
  }
  return doc(db, "shared", "attendance-main");
}

function normalizeState(value = {}) {
  return {
    version: 7,
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

    if (localTime > cloudTime) {
      merged[date] = localRecord;
    }
  }

  return merged;
}

function mergeStates(local = {}, cloud = {}) {
  return {
    version: 7,
    settings: { ...(local.settings || {}), ...(cloud.settings || {}) },
    records: mergeRecords(local.records || {}, cloud.records || {}),
    calendar: { ...(local.calendar || {}), ...(cloud.calendar || {}) },
    clientUpdatedAt: nowIso()
  };
}

function emitState(data) {
  window.dispatchEvent(
    new CustomEvent("attendance-cloud-state", {
      detail: normalizeState(data)
    })
  );
}

function emitStatus() {
  window.dispatchEvent(
    new CustomEvent("attendance-cloud-status", {
      detail: {
        ...currentStatus,
        signedIn: Boolean(user),
        user: user?.email || "",
        lastSync: lastCloudState?.clientUpdatedAt
          ? new Date(lastCloudState.clientUpdatedAt).toLocaleString("ja-JP")
          : "―"
      }
    })
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
    version: VERSION,
    configured,
    initialized,
    realtimeReady,
    online: navigator.onLine,
    origin: location.origin,
    href: location.href,
    authDomain: CONFIG.authDomain || "",
    cookiesEnabled: navigator.cookieEnabled,
    userAgent: navigator.userAgent,
    authCurrentUser: auth?.currentUser
      ? {
          uid: auth.currentUser.uid,
          email: auth.currentUser.email
        }
      : null,
    firebaseUser: user
      ? {
          uid: user.uid,
          email: user.email
        }
      : null,
    firestorePath: user ? "shared/attendance-main" : null,
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
  if (!user || !db) {
    throw new Error("クラウドへログインしていません。");
  }

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
  if (!user || !db) {
    throw new Error("クラウドへログインしていません。");
  }

  if (announce) {
    setStatus("syncing", "受信中", "クラウドから読み込んでいます…");
  }

  const snapshot = await getDoc(stateRef());

  if (!snapshot.exists()) {
    if (announce) {
      setStatus("online", "同期準備完了", "クラウドにデータがありません。");
    }
    return null;
  }

  const cloud = normalizeState(snapshot.data());
  lastCloudState = cloud;
  emitState(cloud);

  if (announce) {
    setStatus("online", "同期済", "クラウドの内容を読み込みました。");
  }

  return cloud;
}

async function establishRealtime() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }

  realtimeReady = false;
  setStatus("syncing", "初回同期", "共有台帳を確認しています…");

  const ref = stateRef();
  const snapshot = await getDoc(ref);
  const local = normalizeState(localState());

  if (!snapshot.exists()) {
    await writeCloud(local, "この端末のデータを共有台帳へ登録しています…");
    emitState(local);
  } else {
    const cloud = normalizeState(snapshot.data());
    lastCloudState = cloud;

    if (hasMeaningfulLocalData(local)) {
      const merged = mergeStates(local, cloud);
      emitState(merged);

      const differs =
        JSON.stringify(merged.records) !== JSON.stringify(cloud.records) ||
        JSON.stringify(merged.calendar) !== JSON.stringify(cloud.calendar) ||
        JSON.stringify(merged.settings) !== JSON.stringify(cloud.settings);

      if (differs) {
        await writeCloud(merged, "端末と共有台帳の差分を統合しています…");
      }
    } else {
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
      setStatus("online", "同期済", "PC・スマホ同期は有効です。");
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

async function emailSignIn(email, password) {
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

  if (!email || !password) {
    setStatus(
      "error",
      "入力不足",
      "メールアドレスとパスワードを入力してください。"
    );
    return;
  }

  setStatus("syncing", "ログイン中", "Firebaseへログインしています…");
  await signInWithEmailAndPassword(auth, email, password);
}

async function processAccount(account) {
  user = account;
  setStatus("syncing", "認証済み", "共有台帳へ接続しています…");

  try {
    await establishRealtime();
  } catch (error) {
    lastError = error;
    console.error(error);
    setStatus("error", "同期エラー", error.message);
  }
}

async function init() {
  if (!configured) {
    initialized = true;
    setStatus("offline", "Firebase未設定", "ローカル保存で動作しています。");
    window.dispatchEvent(new Event("attendance-cloud-ready"));
    return;
  }

  try {
    const app = initializeApp(CONFIG);
    auth = getAuth(app);
    db = getFirestore(app);

    await setPersistence(auth, browserLocalPersistence);

    onAuthStateChanged(auth, account => {
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
          "メールアドレスとパスワードでログインしてください。"
        );
        return;
      }

      processAccount(account);
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

window.addEventListener("attendance-cloud-email-signin", event => {
  const email = String(event.detail?.email || "").trim();
  const password = String(event.detail?.password || "");

  emailSignIn(email, password).catch(error => {
    lastError = error;
    console.error(error);

    const messages = {
      "auth/invalid-credential":
        "メールアドレスまたはパスワードが違います。",
      "auth/invalid-email":
        "メールアドレスの形式が正しくありません。",
      "auth/too-many-requests":
        "ログイン試行が多すぎます。しばらく待ってください。",
      "auth/user-disabled":
        "このユーザーは無効化されています。"
    };

    setStatus(
      "error",
      "ログイン失敗",
      messages[error.code] || `${error.code || "Firebase"}: ${error.message}`
    );
  });
});

window.addEventListener("attendance-cloud-signout", () => {
  if (auth) signOut(auth);
});

window.addEventListener("attendance-cloud-push", event => {
  writeCloud(
    event.detail,
    "この端末のデータを共有台帳へ送っています…"
  ).catch(error => {
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
    establishRealtime().catch(error => {
      lastError = error;
      setStatus("error", "再接続失敗", error.message);
    });
  }
});

window.addEventListener("offline", () => {
  setStatus(
    "offline",
    "オフライン",
    "端末内へ保存し、通信復旧後に再接続します。"
  );
});

init();
