# 기윤실교사모임 앱

> 교육의 길이 되는 기윤실교사모임: 함께 기쁘게 용기 있게

휴대폰 홈 화면에 설치해서 쓸 수 있는 웹앱(PWA)입니다.

| 메뉴 | 누가 볼 수 있나 | 누가 고칠 수 있나 |
|---|---|---|
| 📅 캘린더 | 누구나 | **편집자**, 관리자 |
| 🙏 기도문 | 누구나 | **편집자**, 관리자 |
| 📰 소식지 | 누구나 | 관리자 |
| 💚 후원자 명단 | 등록된 사람(회원·편집자·관리자) | 관리자 |
| 🌿 소개 (사명·교사상·지역/전문모임) | 누구나 | 코드(`js/content.js`)에서 수정 |
| 🔑 권한 관리 | 관리자 | 관리자 |

## 권한은 어떻게 동작하나요?

"다 같이 편집하되 권한 있는 사람만" 고칠 수 있게 하는 방식입니다.

1. 모두 **구글 계정으로 로그인**합니다.
2. 관리자가 앱의 **권한** 화면에서 이메일을 등록하고 역할(관리자/편집자/회원)을 정합니다.
3. 등록되지 않은 사람은 보기만 가능합니다.
4. 일정을 누가 마지막으로 고쳤는지 이메일과 시간이 남습니다.

권한 검사는 화면이 아니라 **서버(Firestore 보안 규칙, `firestore.rules`)** 에서 합니다.
그래서 누군가 화면을 조작해도 권한이 없으면 저장되지 않습니다.

## 바로 체험해 보기 (데모 모드)

설정 없이 열면 데모 모드로 동작하고, 데이터는 그 브라우저에만 저장됩니다.
오른쪽 위 **로그인**에서 관리자/편집자/회원/미등록 계정을 바꿔가며 권한 차이를 볼 수 있습니다.

```bash
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000
```

## 실제 운영하기 (Firebase, 무료 요금제로 충분)

1. https://console.firebase.google.com 에서 프로젝트 만들기
2. **Authentication → 로그인 방법 → Google** 사용 설정
3. **Firestore Database** 만들기 (위치: `asia-northeast3` 서울)
4. **프로젝트 설정 → 웹 앱 추가** 후 나오는 값을 `js/firebase-config.js` 에 붙여넣기
5. **첫 관리자 등록**: Firestore 콘솔에서 직접 문서를 하나 만듭니다.
   - 컬렉션 `roles` / 문서 ID: 관리자 구글 이메일(소문자, 예: `teacher@gmail.com`)
   - 필드 `role` (string) = `admin`
   - 이후로는 앱의 **권한** 화면에서 사람을 추가하면 됩니다.
6. 보안 규칙과 사이트 배포:
   ```bash
   npm i -g firebase-tools
   firebase login
   firebase use --add          # 위에서 만든 프로젝트 선택
   firebase deploy             # firestore.rules + 호스팅 배포
   ```
   배포 후 `https://<프로젝트>.web.app` 주소로 접속합니다.
   휴대폰에서 열고 "홈 화면에 추가"하면 앱처럼 쓸 수 있습니다.

## 내용 고치기

- 소개 문구, 지역모임/전문모임 목록, 연락처, 바로가기 링크: `js/content.js`
  - 바로가기 버튼(네이버 카페, 회원 가입 안내, 유튜브 등)은 `LINKS` 의 `url` 을 채우면 활성화됩니다.
- 역할별 권한을 바꾸려면 `js/store.js` 의 `PERMISSIONS` 와 `firestore.rules` 를 **함께** 고쳐야 합니다.

## 파일 구성

```
index.html            화면 틀, 하단 탭
css/style.css         디자인 (세이지 그린 + 미색 배경, 다크모드 지원)
js/app.js             화면 그리기, 편집 폼, 라우팅
js/store.js           데이터 저장 (Firebase 또는 데모) + 권한 표
js/content.js         소개 페이지 고정 내용
js/firebase-config.js Firebase 연결 설정
firestore.rules       서버 권한 규칙
sw.js, manifest.webmanifest  홈 화면 설치 / 오프라인
```
