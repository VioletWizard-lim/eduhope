// Firebase 프로젝트 설정
// ---------------------------------------------------------------
// 1) https://console.firebase.google.com 에서 프로젝트를 만들고
// 2) "웹 앱 추가" 후 표시되는 firebaseConfig 값을 아래에 붙여넣으세요.
// 3) apiKey 가 비어 있으면 앱은 "데모 모드"(브라우저 저장소)로 동작합니다.
// 자세한 순서는 README.md 를 참고하세요.

export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};

// 아이디/비밀번호 로그인용 도메인.
// 아이디 "admin" 은 Firebase 에서 "admin@eduhope.app" 계정으로 만든다. (실제 메일 주소가 아니어도 된다)
// 이 값을 바꾸면 firestore.rules 의 ID_DOMAIN 부분도 같이 바꿀 것.
export const ID_DOMAIN = "eduhope.app";
