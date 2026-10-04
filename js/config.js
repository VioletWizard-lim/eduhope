// 앱 연결 설정
// ---------------------------------------------------------------
// SHEET_URL: 구글 시트 링크를 그대로 붙여넣으세요.
//   - 시트는 [공유 → 일반 액세스: 링크가 있는 모든 사용자 (뷰어)] 로 되어 있어야 합니다.
//   - 내용은 시트에서 고치면 앱에 자동으로 나타납니다.
//   - 비어 있으면 예시 내용으로 동작하는 "미리보기 모드"가 됩니다.
export const SHEET_URL = "https://docs.google.com/spreadsheets/d/1cAznTPLL2JSD_pa2h3MhK-Le2LX7bJQv4EimP31XtUw/edit";

// UPLOAD_URL: 관리자 사진 올리기용 Apps Script 웹 앱 주소 (https://script.google.com/macros/s/.../exec)
//   - apps-script/Code.gs 를 시트에 설치하고 배포한 주소를 넣으면 앱에 "관리자" 로그인 버튼이 생깁니다.
//   - 비워 두면 사진은 시트 '사진' 탭에 드라이브 링크를 붙여넣는 방식으로만 올립니다.
//   - 자세한 순서는 README 의 "관리자 사진 올리기 설정" 참고.
export const UPLOAD_URL = "";
