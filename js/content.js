// 소개 페이지에 쓰이는 고정 내용 (기윤실교사모임 사이트 기준)
// 자주 바뀌지 않는 내용이라 코드에 둔다. 바뀌면 이 파일만 고치면 된다.

export const ORG = {
  name: "기윤실교사모임",
  slogan: "교육의 길이 되는 기윤실교사모임: 함께 기쁘게 용기 있게",
  mission: [
    "기윤실교사모임은",
    "영성과 전문성을 구비한 헌신된 기독교사 양성과",
    "기독교적인 교육 운동을 통해 전체 기독교사들을 깨워",
    "아이들과 학교 현장을 변화시키고 교육을 새롭게 함으로",
    "민족과 교회에 희망을 주고자 하는",
    "기독교사들의 공동체입니다.",
  ],
  teacherIdeals: [
    "삶의 전 영역에서 하나님 나라를 실현하는 온전한 기독인",
    "영성과 전문성을 갖춘 균형잡힌 기독교사",
    "교육계 전체를 품고 그 회복을 위해 힘쓰는 헌신된 교육운동가",
  ],
  phone: "010-8381-1992",
  email: "eduhope1992@naver.com",
  site: "https://sites.google.com/view/eduhope2024",
};

export const LOCAL_INTRO =
  "지역모임은 우리 기윤실교사모임의 가장 든든한 뿌리라고 할 수 있습니다. " +
  "서울·경기 지역을 중심으로 모이고 있으며, 지역별로 격주 혹은 매주 한번씩 모임을 갖고 있습니다. " +
  "찬양, GBS(그룹성경공부), 책나눔, 교육에 관한 발제 등 다양하게 이루어지고, " +
  "지역모임을 통해 학교현장에서의 어려움을 함께 나누고 위로받기도 하고, 도전받기도 하며 " +
  "따뜻하고 풍성한 사랑의 공동체를 경험하고 있습니다.";

export const SPECIAL_INTRO =
  "전문모임은 지역모임에서 쌓은 영성을 바탕으로, 그 위에 전문성을 더하고자 하는 " +
  "선생님들이 모여 함께 고민하고 연구하는 모임입니다.";

export const LOCAL_GROUPS = [
  { region: "서울", groups: ["강서", "동대문", "중랑", "노원", "성북", "강남"] },
  { region: "경기 서부", groups: ["파주", "일산", "김포", "부천"] },
  { region: "경기 동부", groups: ["여주이천", "하남", "구리남양주", "성남", "양평", "청주"] },
  { region: "경기 남부", groups: ["광명", "시흥", "안산", "안양", "군포", "수원"] },
  { region: "경기 북부", groups: ["의정부포천", "동두천", "양주"] },
  { region: "인천", groups: ["강화", "제물포", "부평", "남동연수", "서구", "영종"] },
  { region: "평택", groups: ["평택", "안성", "송탄오산", "서산"] },
  { region: "기타", groups: ["광주(전남)"] },
];

export const SPECIAL_GROUPS = [
  "특수교육 (기특한 모임)",
  "기독 보건교사 (기봄)",
  "기독 유치원교사 (기유미)",
  "꿈사랑 배움터",
  "통일바람",
  "좋은학교 만들기",
  "날티놀티",
  "기상모임",
  "비전코디",
];

// 사이트의 바로가기 버튼들. url 이 비어 있으면 버튼을 숨긴다.
// "#/" 로 시작하면 앱 안의 화면으로 이동한다.
export const LINKS = [
  { label: "기윤실교사모임 가보고 싶어요", url: "https://docs.google.com/forms/d/e/1FAIpQLSdrdEePXdIANcro76an9vAiJzvpUa8gneEdYfJdNWAEHte4OA/viewform" },
  { label: "모임 활동 소식 (네이버 카페 가입)", url: "https://cafe.naver.com/eduhope1992" },
  { label: "회원 가입 안내", url: "#/join" },
  { label: "기윤실교사모임에 오신 선생님을 환영합니다! (환영 게시판)", url: "https://padlet.com/eduhope1992/padlet-ub9bf0fdnv37hysp" },
  { label: "선업튀 \"선생님 업고 튀어\" 영상 (YouTube)", url: "https://youtu.be/sBQ-WjGYvF0" },
];

// 소개 화면에 넣는 유튜브 영상 ID
export const YOUTUBE_ID = "sBQ-WjGYvF0";

// 회원가입 안내
export const JOIN = {
  bylaw:
    "기독교윤리실천운동 교사모임 정관 제4조에 “기윤실 회원은 우리 단체의 활동 목적에 동의하고 회비를 납부해야 한다”라고 " +
    "명시되어 있습니다. 활동에 대한 관심과 조속한 회비납부 신청은 기윤실교사모임에 밑거름이 될 것입니다.",
  onePercentTitle: "기윤실교사모임, 1% 나눔 운동",
  onePercent: [
    "자기 월급의 1%를 우리 모임의 회비로 내는 ‘1% 나눔 운동’을 시작합니다.",
    "선생님께서 나눠주시는 1%의 회비는 황폐한 교육의 밭에 한 알의 겨자씨가 될 것입니다.",
    "푸른 의의 나무가 가득한 세상, 선생님과 함께 만들고 싶습니다.",
  ],
  googleForm: "https://docs.google.com/forms/d/e/1FAIpQLScb18zuakIelvyTbSEM-P6Fm7smpnRyG8q-oevtQGn-VNXvrg/viewform",
  applicationFile: "https://drive.google.com/file/d/1HKW6GI1vkwabT2g-0jpa6mH0ewR4p6Jb/view",
};

// 캘린더 일정 구분과 색. 시트 '캘린더' 탭의 '구분' 칸 값으로 정한다.
// match 의 낱말이 구분 칸에 들어 있으면 그 색이 된다. 비어 있거나 맞는 것이 없으면 마지막 '그 외'(민트).
// 색을 바꾸면 apps-script/Code.gs 의 CATEGORIES 와 template 양식도 같게 맞출 것.
export const CATEGORIES = [
  { key: "지역모임", color: "#f4cccc", match: ["지역"] },
  { key: "전문모임", color: "#ffd966", match: ["전문"] },
  { key: "실천연구소", color: "#93c47d", match: ["실천", "연구소"] },
  { key: "꿈섬·꿈틀", color: "#6d9eeb", match: ["꿈섬", "꿈틀"] },
  { key: "번개", color: "#b4a7d6", match: ["번개"] },
  { key: "전체·사무국", color: "#ffff00", match: ["전체", "사무국"] },
  { key: "그 외", color: "#b7e1cd", match: [] },
];
