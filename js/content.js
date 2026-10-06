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
  { region: "경기 남부", groups: ["광명", "시흥", "용인", "안산", "안양", "군포", "수원"] },
  { region: "경기 북부", groups: ["의정부포천", "동두천", "양주"] },
  { region: "인천", groups: ["강화", "제물포", "부평", "남동연수", "서구", "영종"] },
  { region: "평택", groups: ["평택", "안성", "송탄오산", "서산"] },
  { region: "기타", groups: ["세종", "광주(전남)"] },
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

// 소개 화면 '앞으로의 추진방향'
export const DIRECTION = {
  pillars: [
    {
      title: "함께",
      focus: "(기독성을 전제로 한) 공동체성, 영성",
      color: "#f4cccc",
      points: [
        "가르치는 일이 더 이상 외롭지 않도록, ‘함께’ 걷고, ‘함께’ 길을 만드는 공동체",
        "공동체 안에서의 공감과 위로, 격려와 지지",
        "다양성의 인정과 활용",
      ],
    },
    {
      title: "기쁘게 (=행복)",
      focus: "전문성",
      color: "#ffd966",
      points: [
        "더 좋은 배움을 꿈꾸는 교사들이 모여 재능을 나누고, 전문성을 키움으로써 학생들보다 앞서 교사가 먼저 배움의 기쁨을 발견",
        "기독교사로서의 정체성을 붙들고 전문성을 기르며 학교 현장의 기독교사가 해결책을 찾아 연구",
        "이 땅의 교육이 직면하고 있는 교육 고통의 문제를 직면하고, 그 문제를 풀기 위한 전문성 있는 기독교사 양성",
      ],
    },
    {
      title: "용기 있게",
      focus: "운동성",
      color: "#93c47d",
      points: [
        "대한민국의 교육 고통을 외면하지 않고 교육의 본질을 회복하기 위해서, 해야 할 바를 삶으로 실천해 내고자 하는 용기 있는 교사들의 모임",
        "교육 고통의 문제를 해결하기 위해 그 해결의 실마리를 나의 교실에서부터 찾는 현장 중심의 교육 공동체",
        "우리가 찾은 해결책은 교실과 학교 현장에서 실천하며 교육의 길을 만들어 가는 교육 공동체",
        "‘느려도 괜찮아 경쟁교육 NO’ 같은 실천운동에 참여함으로 경쟁하지 않는 것을 내 가르침 속에서 풀어내고자 했던 것처럼, 다양한 실천 캠페인에 참여함으로 교육 고통 문제 해결에 나서는 것",
      ],
    },
  ],
  plans: [
    {
      title: "함께 교육의 길이 된다.",
      items: [
        "기윤실교사모임 전체와 지역·전문모임 사이, 회원 사이에 보다 더 깊은 연결성과 공통 분모를 만들어 나간다.",
        "소외되는 회원이 없게 회원의 상황에 맞는 세심한 지원과 맞춤형 지원을 한다.",
      ],
    },
    {
      title: "기쁘게 교육의 길이 된다.",
      items: [
        "교사의 전문성과 관련된 다양한 컨텐츠를 우리 운동과 관련된 단체(기윤실, 좋은교사운동, 교육의 봄, 사교육걱정없는세상)에서 자료를 찾아 연결해서 제공한다. 시기, 주제를 정하고 컨텐츠를 정기적, 체계적으로 제공한다.",
        "교사들의 필요(정서적, 지적, 영적)를 채우며 건강하게 성장할 수 있는 주제를 찾아서 강사를 세우고 단기 프로그램을 운영한다.",
        "전문모임 개척을 장려한다. 기존에 전문모임이 만들어지고 성장한 스토리를 알리고, 누구나 전문모임을 만들 수 있고 새로운 형태의 전문모임(예: 육아)도 가능하며 재정적 지원이 가능하다는 것을 알린다.",
      ],
    },
    {
      title: "용기 있게 교육의 길이 된다.",
      items: [
        "단체 차원에서 집중적으로 해야 하는 ‘경쟁교육 NO!’와 같은 실천운동과 월별로 할 수 있는 실천 과제를 제시하고 실천하며, 지역모임 단위로 결과를 기록하고 공유한다.",
        "회원 각자가 하고 있는 실천들을 모아서 소개하고 공유한다.",
        "즉각적으로 소통하고 교류할 수 있는 플랫폼을 운영한다.",
      ],
    },
  ],
  kkumseom: [
    { title: "꿈섬 1.0", text: "교육의 길이 되어가는 기윤실교사모임의 구성원들로서 공동체성(함께)을 깊이 경험할 수 있는 커리큘럼" },
    {
      title: "꿈섬 2.0",
      text: "꿈섬 1.0을 통해 ‘함께’의 길을 경험한 구성원들에게, 한 걸음 더 나아가 전문성을 키우는 기쁨과 교육 실천의 용기를 경험하게 함으로써 교육 전문가 & 교육운동가로 이끄는 커리큘럼",
    },
  ],
};

// 소개 화면 '히스토리'
export const HISTORY = [
  {
    title: "모임의 시작과 성장",
    period: "1992~2000",
    items: [
      "기윤실 ‘정직한 그리스도인’ 정신을 기초로 기윤실교사모임 시작 (1992.10)",
      "기독교사 윤리강령 제정",
      "‘찌라시’ 문화의 시작과 교육 현안에 대한 심포지엄 개최",
      "‘교육의 밭을 일구는 사람들’ 자료집 발간",
      "기독교사학교 운영",
      "연합운동과 사역의 시작",
      "제1회 세계 기독교사대회 참석 및 기독교 학교 탐방",
      "지역 모임의 시작과 개척 (1996)",
      "제1회 기독교사대회 (주제: 다음세대를 책임지는 기독교사) 주관",
      "전문 모임의 시작 (협동학습연구회, 깨끗한미디어를위한교사운동)",
      "지역모임의 확산",
    ],
  },
  {
    title: "모임의 체계와 변화",
    period: "2000~2010",
    items: [
      "지역모임 교육과정 개발 (학급운영 워크북, 생활지도 워크북, 학원복음화 워크북)",
      "양육의 필요성과 박연경 선생님의 GBS",
      "학급운영 세미나, 학원복음화 세미나, 새 학기 준비 세미나 운영",
      "비전 공청회 (2003)와 정관, 비전 작성",
      "모임의 조직화 (비전위원회, 사역팀, 권역대표, 지역대표, 전문대표 등)",
      "꿈꾸는 섬김이 학교 운영 시작 (2004~)",
      "교육실천 캠페인 ‘숨’ 운동 전개 (2007~)",
      "전문모임의 확산 (통일바람, 학급운영 연구회, 꿈사랑배움터, 초등교육실천연구회, 새로운사회를위한교사들의움직임, 겨자씨와 나무, 기독교특수교사모임, 비전코디)",
      "교과 모임의 태동과 확산 (행복한 수업 만들기)",
      "학교혁신 모임의 시작 (좋은학교만들기모임)",
      "2010 기독교사대회 (주제: 학교, 행복의 날개를 달다) 주관",
    ],
  },
  {
    title: "새로운 도약",
    period: "2011~",
    items: [
      "비전공청회와 새로운 슬로건 ‘학교를 바꾸는 기윤실교사모임’ 확정",
      "학교 혁신 운동의 전개",
      "새로운 교육실천운동 전개 (3아이 운동, 비폭력대화, 교사학습공동체 만들기, 지역모임 지키기 운동)",
      "회복적생활교육 워크숍 (회복적 서클, 비폭력대화, 교사내면치유, HIPP) 수련회 개최",
      "수련회에서 현장 실천 중심의 컨퍼런스 개최",
      "지역모임을 중심으로 회복적생활교육과 수업나눔 스터디 실시",
      "꿈꾸는 섬김이 학교 1.0, 2.0 운영으로 리더 양성",
      "기윤실 학교 탐방 프로그램",
      "기윤실 회원의 밤 개최",
    ],
  },
];

// 모임 대표 연락처 (eduhope.or.kr 기준). 소개 화면에서 지역·전문모임 이름을 누르면 보여 준다.
// keys: 이 낱말이 모임 이름(띄어쓰기·기호 무시)에 들어 있으면 그 대표로 본다.
// area: 지역모임이 속한 권역 (권역대표를 함께 보여 줌)
export const CONTACTS = {
  local: [
    { name: "노원", area: "서울", rep: "심원보", email: "onesimus76@naver.com" },
    { name: "중랑", area: "서울", rep: "신중훈", email: "mc.ewha@gmail.com" },
    { name: "동대문", area: "서울", rep: "김태훈", email: "esemane@hanmail.net" },
    { name: "강남", area: "서울", rep: "유연주", email: "yjkero@daum.net" },
    { name: "강서", area: "서울", rep: "유정수", email: "jsy9311@hanmail.net" },
    { name: "김포", area: "경기서부", rep: "김정선", email: "yongsim2@hanmail.net" },
    { name: "부천", area: "경기서부", rep: "남현욱", email: "cristian@hanmail.net" },
    { name: "파주", area: "경기서부", rep: "정윤석", email: "i-garit@hanmail.net" },
    { name: "일산", area: "경기서부", rep: "홍인기", email: "hateduck@naver.com" },
    { name: "광명", area: "경기남부", rep: "구돈회", email: "dd7713@hanmail.net" },
    { name: "시흥", area: "경기남부", rep: "오순정", email: "so3927@korea.kr" },
    { name: "용인", area: "경기남부", rep: "손지훈", email: "rname2@hanmail.net" },
    { name: "안산", area: "경기남부", rep: "권순홍", email: "mrkwon1@nate.com" },
    { name: "안양", area: "경기남부", rep: "임병호", email: "bhlim911@gmail.com" },
    { name: "군포", area: "경기남부", rep: "김소영", email: "ksya78@korea.kr" },
    { name: "수원", area: "경기남부", rep: "이덕호", email: "gladfeel@korea.kr" },
    { name: "여주이천", area: "경기동부", rep: "김현경", email: "liebekhk@naver.com" },
    { name: "하남", area: "경기동부", rep: "이정연", email: "onmom724@hanmail.net" },
    { name: "구리남양주", area: "경기동부", rep: "백윤선", email: "cucu100@naver.com" },
    { name: "성남", area: "경기동부", rep: "조희국", email: "sfc1404@naver.com" },
    { name: "양평", area: "경기동부", rep: "양요한", email: "lambjohn@hanmail.net" },
    { name: "의정부포천", area: "경기북부", rep: "정재윤", email: "saochung76@daum.net" },
    { name: "동두천양주", keys: ["동두천", "양주"], area: "경기북부", rep: "박준혁", email: "gamramnamu21@naver.com" },
    { name: "강화", area: "인천", rep: "박윤희", email: "sky-angel77@hanmail.net" },
    { name: "부평제물포", keys: ["부평", "제물포"], area: "인천", rep: "홍경숙", email: "hong9628@ice.go.kr" },
    { name: "남동연수", area: "인천", rep: "김애희", email: "aehee100@hanmail.net" },
    { name: "서구", area: "인천", rep: "장진우", email: "skimania75@hanmail.net" },
    { name: "평택", area: "평택", rep: "김복환", email: "under-stand@daum.net" },
    { name: "안성", area: "평택", rep: "조창완", email: "wan0302@hanmail.net" },
    { name: "송탄-오산", keys: ["송탄", "오산"], area: "평택", rep: "최지연", email: "ied0916@naver.com" },
    { name: "서산", area: "충청", rep: "남궁욱", email: "ngwook00@hanmail.net" },
    { name: "세종", area: "충청", rep: "한아름", email: "baboarumi@hanmail.net" },
    { name: "청주", area: "충청", rep: "김현승", email: "clearyuki@naver.com" },
  ],
  special: [
    { name: "기특한모임", keys: ["기특한"], rep: "박유진", email: "park830224@korea.kr" },
    { name: "꿈사랑배움터", rep: "정윤석", email: "i-garit@hanmail.net" },
    { name: "통일바람", rep: "조창완", email: "wan0302@hanmail.net" },
    { name: "기상모임", rep: "안효정", email: "boashj@naver.com" },
    { name: "비전코디", rep: "정연석", email: "kebs79@daum.net" },
    { name: "좋은학교만들기", rep: "유진아", email: "dino45@naver.com" },
    { name: "기독보건교사모임", keys: ["보건", "기봄"], rep: "강은혜", email: "chinychiny@hanmail.net" },
    { name: "기독유치원교사모임(기유미)", keys: ["유치원", "기유미"], rep: "신성옥", email: "sinkiss@hanmail.net" },
  ],
  // 섬김이. area 가 있으면 그 권역의 권역대표.
  staff: [
    { role: "대표", rep: "장승진", email: "eduhope83@gmail.com" },
    { role: "부대표", rep: "권순홍", email: "mrkwon1@nate.com" },
    { role: "사무국", rep: "권신영", email: "kwonsy365@gmail.com" },
    { role: "사무국", rep: "엄익환", email: "ikhwanum@gmail.com" },
    { role: "사무국", rep: "손지훈", email: "rname2@hanmail.net" },
    { role: "교육실천연구소 소장", rep: "김현경", email: "liebekhk@naver.com" },
    { role: "권역대표: 경기남부", area: "경기남부", rep: "윤문희", email: "supermoon83@naver.com" },
    { role: "권역대표: 경기동부", area: "경기동부", rep: "김선희", email: "jesussh0430@daum.net" },
    { role: "권역대표: 경기북부", area: "경기북부", rep: "이인성", email: "starlightsboy@gmail.com" },
    { role: "권역대표: 경기서부", area: "경기서부", rep: "남현욱", email: "cristian@hanmail.net" },
    { role: "권역대표: 서울", area: "서울", rep: "강은혜", email: "chinychiny@hanmail.net" },
    { role: "권역대표: 인천", area: "인천", rep: "권신영", email: "kwonsy365@gmail.com" },
    { role: "권역대표: 충청", area: "충청", rep: "김현승", email: "clearyuki@naver.com" },
    { role: "꿈섬 1.0 교장", rep: "정재윤", email: "saochung76@daum.net" },
    { role: "꿈틀꿈틀 교장", rep: "김영식", email: "jimgal@naver.com" },
    { role: "꿈사랑배움터", rep: "정윤석", email: "i-garit@hanmail.net" },
  ],
};
