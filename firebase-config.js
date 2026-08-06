/*
Firebase Console > プロジェクトの設定 > マイアプリ > SDKの設定と構成
に表示される firebaseConfig を下へ貼り付けてください。
*/
window.FIREBASE_CONFIG = {
  apiKey: "PASTE_API_KEY",
  authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
  projectId: "PASTE_PROJECT_ID",
  storageBucket: "PASTE_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "PASTE_MESSAGING_SENDER_ID",
  appId: "PASTE_APP_ID"
};

/*
任意：特定メールだけを画面上で許可したい場合に記入します。
Firestoreの本当の保護は firestore.rules で行います。
空配列ならGoogleログインできる全アカウントが自分専用領域を利用できます。
*/
window.FIREBASE_ALLOWED_EMAILS = [
  // "your-account@gmail.com"
];
