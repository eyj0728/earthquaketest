# 지구는 지금 어디서 흔들릴까? (Where is the Earth Shaking Right Now?)

중학교 과학 수업(지권의 변화 및 판 구조론 단원)을 위한 실시간 전 세계 지진 및 판 경계 인터랙티브 탐구 웹 애플리케이션입니다.  
React와 Vite 기반의 순수 정적 웹앱(Static Web App)으로 제작되어, 별도의 백엔드 서버나 데이터베이스 없이 브라우저 환경에서 동작하며 GitHub 저장소 연동 및 Netlify를 통해 간편하게 배포할 수 있습니다.

---

## 1. 앱 목적
- **중학교 과학 교육용**: 대륙과 해양의 분포, 화산대와 지진대, 그리고 판의 경계(수렴형, 발산형, 보존형 경계)의 공간적 상관관계를 학생들이 직관적으로 비교·탐구할 수 있도록 돕습니다.
- **실제 관측 자료 기반 학습**: 가상 데이터가 아닌 미국 지질조사국(USGS)의 실제 관측 GeoJSON 피드를 활용하여 생생한 지구과학 탐구 활동을 지원합니다.
- **정교한 시각화와 상호작용**: 지진 규모(원 반지름)와 진원 깊이(색상 구간)를 직관적으로 구분하고, 목록 클릭 시 해당 위치로 부드럽게 이동하여 팝업을 표시합니다.

---

## 2. 데이터 출처 및 라이선스
1. **실시간 지진 데이터**:
   - 제공: **USGS (U.S. Geological Survey) Earthquake Hazards Program**
   - 피드 주소:
     - 최근 24시간: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson`
     - 최근 7일: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson`
     - 최근 30일: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_month.geojson`
2. **판 경계선 데이터 (Tectonic Plate Boundaries)**:
   - 제공: **USGS ArcGIS REST Services** (`map_plateboundaries`)
   - 원자료 모델: **Peter Bird (2003)**, *"An updated digital model of plate boundaries"*, Geochemistry, Geophysics, Geosystems, 4(3), 1027.
   - 서비스 주소: `https://earthquake.usgs.gov/arcgis/rest/services/eq/map_plateboundaries/MapServer/1`
3. **배경 지도 타일**:
   - 제공: **OpenStreetMap** (© [OpenStreetMap contributors](https://www.openstreetmap.org/copyright))

---

## 3. 프로젝트 빌드 및 실행 명령

### 사전 요구사항
- Node.js 18 이상
- npm 9 이상

### 설치 및 로컬 개발 서버 실행
```bash
# 의존성 설치
npm install

# 로컬 개발 서버 실행 (기본 포트: 3000)
npm run dev
```

### 정적 프로덕션 번들 빌드
```bash
# 정적 배포용 dist 폴더 생성
npm run build

# 빌드 결과물 로컬 미리보기
npm run preview
```

---

## 4. Netlify 배포 설정

루트 디렉터리의 `netlify.toml` 파일을 통해 배포 설정이 자동 적용됩니다:

```toml
[build]
  command = "npm run build"
  publish = "dist"
```

- **Build command**: `npm run build`
- **Publish directory**: `dist`
- **배포 방식**: GitHub 저장소를 Netlify에 연동하면 `main` 브랜치 푸시 시 자동으로 정적 빌드가 수행되어 전 세계 CDN에 배포됩니다.
- **환경 변수**: 별도의 비밀 API 키나 서버 환경 변수가 필요 없습니다.

---

## 5. 자료의 한계 및 교육적 유의사항

1. **지진 관측 데이터의 한계**:
   - 본 앱은 USGS 공개 피드의 기준에 따라 **규모 2.5 이상의 지진 이벤트**를 다룹니다.
   - 전 세계 지진 관측망의 배치 밀도와 관측 한계에 따라 소규모 미세 지진이 모두 포함되는 것은 아니므로, 학생들에게 *'관측되어 검증된 주요 지진의 분포'* 관점으로 안내해 주시기 바랍니다.
2. **판 경계 모델의 성격**:
   - 지도에 표시되는 판 경계선은 지구물리학적 연구 모델(Peter Bird, 2003)에 기반한 **참고 모델**입니다.
   - 지진은 판 경계뿐만 아니라 지각 내 응력 축적에 의해 **판 내부에서도 발생할 수 있습니다**.
3. **미래 지진 예측 불가**:
   - 본 애플리케이션에 표시되는 자료는 최근 24시간~30일 동안 발생한 **과거 관측 기록**이며, **미래의 지진 발생 시기나 장소를 예측하지 않습니다**.
