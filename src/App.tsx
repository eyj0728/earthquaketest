/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Globe,
  Compass,
  Layers,
  Activity,
  RotateCcw,
  Info,
  Clock,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  ExternalLink,
  XCircle,
  MapPin,
  AlertCircle,
  BookOpen,
  Filter,
  SlidersHorizontal,
  Check,
  ArrowUpDown,
  List,
  Map as MapIcon,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  ShieldAlert,
  ToggleLeft,
  ToggleRight,
  Navigation
} from 'lucide-react';

type PeriodKey = 'day' | 'week' | 'month';

interface PeriodConfig {
  key: PeriodKey;
  label: string;
  badge: string;
  url: string;
  description: string;
}

const PERIOD_CONFIGS: Record<PeriodKey, PeriodConfig> = {
  day: {
    key: 'day',
    label: '최근 24시간',
    badge: '24시간',
    url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson',
    description: '최근 1일간 발생한 규모 2.5 이상 지진',
  },
  week: {
    key: 'week',
    label: '최근 7일',
    badge: '7일 (기본)',
    url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson',
    description: '최근 1주일간 발생한 규모 2.5 이상 지진',
  },
  month: {
    key: 'month',
    label: '최근 30일',
    badge: '30일',
    url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_month.geojson',
    description: '최근 1개월간 발생한 규모 2.5 이상 지진',
  },
};

const MIN_MAG_OPTIONS: number[] = [2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0];

type DepthFilterKey = 'all' | 'shallow' | 'intermediate' | 'deep' | 'unknown';

interface DepthFilterOption {
  key: DepthFilterKey;
  label: string;
  shortLabel: string;
  colorDot?: string;
  description: string;
}

const DEPTH_FILTER_OPTIONS: DepthFilterOption[] = [
  {
    key: 'all',
    label: '전체 깊이',
    shortLabel: '전체',
    description: '모든 진원 깊이 지진 표시',
  },
  {
    key: 'shallow',
    label: '70km 미만 (천발 지진)',
    shortLabel: '70km 미만',
    colorDot: 'bg-orange-500 border-orange-700',
    description: '지표면 근처에서 발생한 얕은 지진',
  },
  {
    key: 'intermediate',
    label: '70~300km 미만 (중발 지진)',
    shortLabel: '70~300km',
    colorDot: 'bg-blue-500 border-blue-700',
    description: '맨틀 상부 등 중간 깊이 지진',
  },
  {
    key: 'deep',
    label: '300km 이상 (심발 지진)',
    shortLabel: '300km 이상',
    colorDot: 'bg-purple-500 border-purple-700',
    description: '침강하는 판의 깊은 곳에서 발생한 지진',
  },
  {
    key: 'unknown',
    label: '깊이 정보 없음',
    shortLabel: '정보 없음',
    colorDot: 'bg-slate-400 border-slate-600',
    description: '진원 깊이 관측값이 결측된 지진',
  },
];

type PlateBoundaryCategory = 'convergent' | 'divergent' | 'transform' | 'other';

interface PlateTypeStyle {
  category: PlateBoundaryCategory;
  koreanLabel: string;
  color: string;
  weight: number;
  dashArray?: string;
  description: string;
  lineSymbol: string;
}

const getPlateTypeStyle = (
  rawLabel: string | null | undefined
): PlateTypeStyle => {
  const normalized = (rawLabel || '').trim();
  if (normalized === 'Convergent Boundary') {
    return {
      category: 'convergent',
      koreanLabel: '수렴 경계',
      color: '#b91c1c',
      weight: 3,
      dashArray: undefined,
      description: '판과 판이 서로 충돌하거나 섭입하는 경계',
      lineSymbol: '━━━━━ (실선)',
    };
  }
  if (normalized === 'Divergent Boundary') {
    return {
      category: 'divergent',
      koreanLabel: '발산 경계',
      color: '#0f766e',
      weight: 3,
      dashArray: '10, 8',
      description: '판과 판이 서로 멀어지며 새 지각이 생성되는 경계',
      lineSymbol: '╌ ╌ ╌ (긴 점선)',
    };
  }
  if (normalized === 'Transform Boundary') {
    return {
      category: 'transform',
      koreanLabel: '보존 경계',
      color: '#374151',
      weight: 2.5,
      dashArray: '4, 4',
      description: '판과 판이 어긋나며 미끄러지는 경계',
      lineSymbol: '┄ ┄ ┄ (짧은 점선)',
    };
  }
  return {
    category: 'other',
    koreanLabel: '기타·미분류 경계',
    color: '#94a3b8',
    weight: 2,
    dashArray: '3, 6',
    description: '복합 변형대 또는 분류 미확정 경계',
    lineSymbol: '· · · (옅은 점선)',
  };
};

interface ValidatedEarthquake {
  id: string;
  lat: number;
  lng: number;
  depthKm: number | null;
  mag: number | null;
  magType: string | null;
  place: string | null;
  time: number | null;
  url: string | null;
}

type FetchStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error';
type SortKey = 'latest' | 'magnitude';
type MobileTab = 'all' | 'map' | 'list';

interface CacheEntry {
  earthquakes: ValidatedEarthquake[];
  generatedTime: number | null;
  fetchedTime: number;
  invalidCount: number;
}

const getMarkerRadius = (mag: number | null): number => {
  if (mag === null || isNaN(mag)) {
    return 4;
  }
  return Math.max(4, Math.min(22, 4 + (mag - 2.5) * 3));
};

interface DepthInfo {
  category: 'shallow' | 'intermediate' | 'deep' | 'unknown';
  label: string;
  shortLabel: string;
  fillColor: string;
  borderColor: string;
  badgeClass: string;
  borderClass: string;
  textClass: string;
}

const getDepthInfo = (depthKm: number | null): DepthInfo => {
  if (depthKm === null || isNaN(depthKm)) {
    return {
      category: 'unknown',
      label: '깊이 정보 없음',
      shortLabel: '정보 없음',
      fillColor: '#94a3b8',
      borderColor: '#475569',
      badgeClass: 'bg-[#edebe9] text-[rgba(0,0,0,0.87)] border-[#d6dbde]',
      borderClass: 'border-[#d6dbde]',
      textClass: 'text-[rgba(0,0,0,0.58)]',
    };
  }

  if (depthKm < 70) {
    return {
      category: 'shallow',
      label: '70km 미만 (천발 지진)',
      shortLabel: '70km 미만',
      fillColor: '#f97316',
      borderColor: '#c2410c',
      badgeClass: 'bg-orange-50 text-orange-900 border-orange-200',
      borderClass: 'border-orange-300',
      textClass: 'text-orange-700',
    };
  }

  if (depthKm >= 70 && depthKm < 300) {
    return {
      category: 'intermediate',
      label: '70km 이상 300km 미만 (중발 지진)',
      shortLabel: '70km~300km',
      fillColor: '#3b82f6',
      borderColor: '#1d4ed8',
      badgeClass: 'bg-blue-50 text-blue-900 border-blue-200',
      borderClass: 'border-blue-300',
      textClass: 'text-blue-700',
    };
  }

  return {
    category: 'deep',
    label: '300km 이상 (심발 지진)',
    shortLabel: '300km 이상',
    fillColor: '#a855f7',
    borderColor: '#7e22ce',
    badgeClass: 'bg-purple-50 text-purple-900 border-purple-200',
    borderClass: 'border-purple-300',
    textClass: 'text-purple-700',
  };
};

const formatToKST = (timestamp: number | null | undefined): string => {
  if (timestamp === null || timestamp === undefined || isNaN(timestamp)) {
    return '시각 정보 없음';
  }
  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '시각 정보 없음';
    return (
      new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(date) + ' (한국시간 KST)'
    );
  } catch {
    return '시각 변환 실패';
  }
};

const validateUsgsUrl = (rawUrl: unknown): string | null => {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return null;
  try {
    const parsed = new URL(rawUrl.trim());
    if (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'earthquake.usgs.gov'
    ) {
      return parsed.href;
    }
    return null;
  } catch {
    return null;
  }
};

const sanitizeAntimeridian = (feature: any): any => {
  if (!feature?.geometry?.coordinates) return feature;
  const geomType = feature.geometry.type;

  if (geomType === 'LineString') {
    const coords = feature.geometry.coordinates;
    let hasJump = false;
    for (let i = 0; i < coords.length - 1; i++) {
      if (Math.abs(coords[i + 1][0] - coords[i][0]) > 180) {
        hasJump = true;
        break;
      }
    }
    if (!hasJump) return feature;

    const lines: number[][][] = [];
    let currentLine: number[][] = [coords[0]];
    for (let i = 0; i < coords.length - 1; i++) {
      const p1 = coords[i];
      const p2 = coords[i + 1];
      if (Math.abs(p2[0] - p1[0]) > 180) {
        lines.push(currentLine);
        currentLine = [p2];
      } else {
        currentLine.push(p2);
      }
    }
    lines.push(currentLine);

    return {
      ...feature,
      geometry: {
        type: 'MultiLineString',
        coordinates: lines,
      },
    };
  }

  return feature;
};

export default function App() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const earthquakeLayerRef = useRef<L.LayerGroup | null>(null);
  const plateBoundariesLayerRef = useRef<L.GeoJSON | null>(null);
  const markerMapRef = useRef<Map<string, L.CircleMarker>>(new Map());

  // 지도 현재 중심 좌표 및 줌 레벨
  const [mapState, setMapState] = useState({
    lat: 20.0,
    lng: 0.0,
    zoom: 2,
  });

  // 필터 조건 상태
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>('week');
  const [minMagnitude, setMinMagnitude] = useState<number>(2.5);
  const [depthFilter, setDepthFilter] = useState<DepthFilterKey>('all');

  // 정렬 및 페이지네이션 상태
  const [sortBy, setSortBy] = useState<SortKey>('latest');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 12;

  // 모바일 화면 탭 상태
  const [mobileTab, setMobileTab] = useState<MobileTab>('all');

  // 지진 데이터 수신 상태
  const [fetchStatus, setFetchStatus] = useState<FetchStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rawEarthquakes, setRawEarthquakes] = useState<ValidatedEarthquake[]>([]);
  const [invalidCount, setInvalidCount] = useState<number>(0);
  const [dataGeneratedTime, setDataGeneratedTime] = useState<number | null>(null);
  const [lastFetchedTime, setLastFetchedTime] = useState<number | null>(null);

  // 판 경계 레이어 관련 상태
  const [showPlateBoundaries, setShowPlateBoundaries] = useState<boolean>(false);
  const [plateFetchStatus, setPlateFetchStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');
  const [plateErrorMessage, setPlateErrorMessage] = useState<string | null>(null);
  const [plateBoundariesData, setPlateBoundariesData] =
    useState<GeoJSON.FeatureCollection | null>(null);

  // 판 경계 종류별 가시성 토글 상태
  const [plateTypeFilters, setPlateTypeFilters] = useState<
    Record<PlateBoundaryCategory, boolean>
  >({
    convergent: true,
    divergent: true,
    transform: true,
    other: true,
  });

  const cacheRef = useRef<Partial<Record<PeriodKey, CacheEntry>>>({});
  const requestIdRef = useRef<number>(0);

  // 선택된 지진 상세 정보
  const [selectedEarthquake, setSelectedEarthquake] =
    useState<ValidatedEarthquake | null>(null);

  // Leaflet 지도 초기화
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const container = mapContainerRef.current;

    const map = L.map(container, {
      center: [20, 0],
      zoom: 2,
      minZoom: 2,
      zoomSnap: 1,
      zoomDelta: 1,
      scrollWheelZoom: true,
      wheelPxPerZoomLevel: 60,
    });

    mapInstanceRef.current = map;

    // 판 경계선 전용 Pane 생성 (zIndex: 350)
    if (!map.getPane('plateBoundariesPane')) {
      const platePane = map.createPane('plateBoundariesPane');
      platePane.style.zIndex = '350';
    }

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
      minZoom: 2,
      maxZoom: 18,
    }).addTo(map);

    const eqLayer = L.layerGroup().addTo(map);
    earthquakeLayerRef.current = eqLayer;

    const updateCoordinates = () => {
      const center = map.getCenter();
      setMapState({
        lat: parseFloat(center.lat.toFixed(2)),
        lng: parseFloat(center.lng.toFixed(2)),
        zoom: map.getZoom(),
      });
    };

    map.on('move', updateCoordinates);
    map.on('zoomend', updateCoordinates);

    const handleWheel = (e: WheelEvent) => {
      const zoomSnap = map.options.zoomSnap ?? 1;
      const minZoom = map.getMinZoom();
      const currentZoom = map.getZoom();

      if (currentZoom - zoomSnap < minZoom && e.deltaY > 0) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    container.addEventListener('wheel', handleWheel, {
      capture: true,
      passive: false,
    });

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener('wheel', handleWheel, {
        capture: true,
      });
      resizeObserver.disconnect();
      map.off('move', updateCoordinates);
      map.off('zoomend', updateCoordinates);
      map.remove();
      mapInstanceRef.current = null;
      earthquakeLayerRef.current = null;
      plateBoundariesLayerRef.current = null;
      markerMapRef.current.clear();
    };
  }, []);

  // USGS 지진 데이터 요청 함수
  const fetchPeriodData = useCallback(
    async (period: PeriodKey, forceRefresh = false) => {
      if (!forceRefresh && cacheRef.current[period]) {
        const cached = cacheRef.current[period]!;
        setRawEarthquakes(cached.earthquakes);
        setDataGeneratedTime(cached.generatedTime);
        setLastFetchedTime(cached.fetchedTime);
        setInvalidCount(cached.invalidCount);
        setErrorMessage(null);
        setFetchStatus(cached.earthquakes.length === 0 ? 'empty' : 'success');
        return;
      }

      const currentRequestId = ++requestIdRef.current;
      setFetchStatus('loading');
      setErrorMessage(null);

      try {
        const config = PERIOD_CONFIGS[period];
        const response = await fetch(config.url);
        if (!response.ok) {
          throw new Error(
            `USGS 서버 응답 오류 (HTTP ${response.status} ${response.statusText})`
          );
        }

        const data = await response.json();

        if (requestIdRef.current !== currentRequestId) {
          return;
        }

        if (!data || !Array.isArray(data.features)) {
          throw new Error('USGS 수신 데이터 형식이 올바르지 않습니다.');
        }

        const generatedMs =
          typeof data.metadata?.generated === 'number'
            ? data.metadata.generated
            : null;
        const fetchedMs = Date.now();

        const validList: ValidatedEarthquake[] = [];
        let invalidCoords = 0;

        for (const feature of data.features) {
          if (feature?.properties?.type !== 'earthquake') {
            continue;
          }

          const coords = feature?.geometry?.coordinates;
          if (!Array.isArray(coords) || coords.length < 2) {
            invalidCoords++;
            continue;
          }

          const lng = coords[0];
          const lat = coords[1];

          if (
            typeof lat !== 'number' ||
            typeof lng !== 'number' ||
            isNaN(lat) ||
            isNaN(lng) ||
            lat < -90 ||
            lat > 90 ||
            lng < -180 ||
            lng > 180
          ) {
            invalidCoords++;
            continue;
          }

          let depthKm: number | null = null;
          if (
            coords.length >= 3 &&
            typeof coords[2] === 'number' &&
            !isNaN(coords[2])
          ) {
            depthKm = coords[2];
          }

          let mag: number | null = null;
          if (
            typeof feature.properties?.mag === 'number' &&
            !isNaN(feature.properties.mag)
          ) {
            mag = feature.properties.mag;
          }

          const place =
            typeof feature.properties?.place === 'string' &&
            feature.properties.place.trim()
              ? feature.properties.place.trim()
              : null;

          const magType =
            typeof feature.properties?.magType === 'string' &&
            feature.properties.magType.trim()
              ? feature.properties.magType.trim()
              : null;

          const time =
            typeof feature.properties?.time === 'number' &&
            !isNaN(feature.properties.time)
              ? feature.properties.time
              : null;

          const safeUrl = validateUsgsUrl(feature.properties?.url);

          validList.push({
            id:
              feature.id ||
              `eq-${lat}-${lng}-${time || Math.random().toString(36).substring(2)}`,
            lat,
            lng,
            depthKm,
            mag,
            magType,
            place,
            time,
            url: safeUrl,
          });
        }

        cacheRef.current[period] = {
          earthquakes: validList,
          generatedTime: generatedMs,
          fetchedTime: fetchedMs,
          invalidCount: invalidCoords,
        };

        setRawEarthquakes(validList);
        setDataGeneratedTime(generatedMs);
        setLastFetchedTime(fetchedMs);
        setInvalidCount(invalidCoords);

        if (validList.length === 0) {
          setFetchStatus('empty');
        } else {
          setFetchStatus('success');
        }
      } catch (err) {
        if (requestIdRef.current !== currentRequestId) {
          return;
        }

        const message =
          err instanceof Error
            ? err.message
            : '네트워크 통신 중 오류가 발생했습니다.';
        setErrorMessage(message);
        setFetchStatus('error');
        setRawEarthquakes([]);
        setInvalidCount(0);
      }
    },
    []
  );

  useEffect(() => {
    fetchPeriodData(selectedPeriod, false);
  }, [selectedPeriod, fetchPeriodData]);

  const handleManualRefresh = () => {
    if (fetchStatus === 'loading') return;
    delete cacheRef.current[selectedPeriod];
    fetchPeriodData(selectedPeriod, true);
  };

  // USGS 판 경계 데이터 요청 함수
  const fetchPlateBoundaries = useCallback(async () => {
    if (plateFetchStatus === 'loading' || plateBoundariesData) return;

    setPlateFetchStatus('loading');
    setPlateErrorMessage(null);

    try {
      const baseUrl =
        'https://earthquake.usgs.gov/arcgis/rest/services/eq/map_plateboundaries/MapServer/1/query';
      let allFeatures: any[] = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const url = `${baseUrl}?where=1%3D1&outFields=NAME%2CLABEL&outSR=4326&f=geojson&resultOffset=${offset}&resultRecordCount=1000`;
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`USGS 판 경계 서버 응답 오류 (HTTP ${res.status})`);
        }

        const data = await res.json();

        if (data.error) {
          throw new Error(
            data.error.message || 'ArcGIS 서비스 오류가 발생했습니다.'
          );
        }

        if (!data || !Array.isArray(data.features)) {
          throw new Error('판 경계 GeoJSON 데이터 형식이 올바르지 않습니다.');
        }

        allFeatures = allFeatures.concat(data.features);

        const exceeded =
          data.exceededTransferLimit === true ||
          data.properties?.exceededTransferLimit === true;

        if (exceeded && data.features.length > 0) {
          offset += data.features.length;
        } else {
          hasMore = false;
        }
      }

      const sanitizedFeatures = allFeatures.map((f) =>
        sanitizeAntimeridian(f)
      );

      const collection: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: sanitizedFeatures,
      };

      setPlateBoundariesData(collection);
      setPlateFetchStatus('success');
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : '판 경계 데이터를 불러오는 중 통신 오류가 발생했습니다.';
      setPlateErrorMessage(msg);
      setPlateFetchStatus('error');
      setPlateBoundariesData(null);
    }
  }, [plateFetchStatus, plateBoundariesData]);

  const handleTogglePlateBoundaries = () => {
    const nextState = !showPlateBoundaries;
    setShowPlateBoundaries(nextState);

    if (nextState && !plateBoundariesData && plateFetchStatus !== 'loading') {
      fetchPlateBoundaries();
    }
  };

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (plateBoundariesLayerRef.current) {
      map.removeLayer(plateBoundariesLayerRef.current);
      plateBoundariesLayerRef.current = null;
    }

    if (!showPlateBoundaries || !plateBoundariesData) return;

    const layer = L.geoJSON(plateBoundariesData, {
      pane: 'plateBoundariesPane',
      filter: (feature) => {
        const style = getPlateTypeStyle(feature?.properties?.LABEL);
        return plateTypeFilters[style.category];
      },
      style: (feature) => {
        const style = getPlateTypeStyle(feature?.properties?.LABEL);
        return {
          color: style.color,
          weight: style.weight,
          dashArray: style.dashArray,
          opacity: 0.9,
        };
      },
      onEachFeature: (feature, fLayer) => {
        const rawName = feature?.properties?.NAME;
        const rawLabel = feature?.properties?.LABEL;
        const style = getPlateTypeStyle(rawLabel);

        const popupContainer = document.createElement('div');
        popupContainer.className =
          'p-2.5 text-[rgba(0,0,0,0.87)] text-xs font-sans space-y-1.5 min-w-[210px] max-w-[280px] bg-white rounded-xl';

        const headerEl = document.createElement('div');
        headerEl.className =
          'flex items-center gap-2 border-b border-[#edebe9] pb-1.5 mb-1';

        const colorIndicator = document.createElement('span');
        colorIndicator.style.display = 'inline-block';
        colorIndicator.style.width = '14px';
        colorIndicator.style.height = '3.5px';
        colorIndicator.style.borderRadius = '2px';
        colorIndicator.style.backgroundColor = style.color;
        headerEl.appendChild(colorIndicator);

        const titleEl = document.createElement('h4');
        titleEl.className = 'font-bold text-sm text-[#006241] leading-snug';
        titleEl.textContent = style.koreanLabel;
        headerEl.appendChild(titleEl);
        popupContainer.appendChild(headerEl);

        if (rawName && typeof rawName === 'string' && rawName.trim()) {
          const nameEl = document.createElement('div');
          nameEl.className = 'text-xs text-[rgba(0,0,0,0.87)]';

          const labelSpan = document.createElement('span');
          labelSpan.className = 'text-[rgba(0,0,0,0.58)] mr-1.5 font-medium';
          labelSpan.textContent = '원문 NAME:';
          nameEl.appendChild(labelSpan);

          const valSpan = document.createElement('span');
          valSpan.className = 'font-semibold text-[#1E3932]';
          valSpan.textContent = rawName.trim();
          nameEl.appendChild(valSpan);

          popupContainer.appendChild(nameEl);
        } else {
          const noNameEl = document.createElement('div');
          noNameEl.className = 'text-[11px] text-[rgba(0,0,0,0.58)] italic';
          noNameEl.textContent = '원문 NAME 정보 없음';
          popupContainer.appendChild(noNameEl);
        }

        const typeDescEl = document.createElement('div');
        typeDescEl.className = 'text-[11px] text-[rgba(0,0,0,0.58)] mt-1';
        typeDescEl.textContent = `원자료 LABEL: ${rawLabel || '미분류'}`;
        popupContainer.appendChild(typeDescEl);

        const descNoteEl = document.createElement('div');
        descNoteEl.className = 'text-[10px] text-[#33433d] mt-0.5 leading-snug';
        descNoteEl.textContent = style.description;
        popupContainer.appendChild(descNoteEl);

        fLayer.bindPopup(popupContainer);
      },
    });

    layer.addTo(map);
    plateBoundariesLayerRef.current = layer;
  }, [showPlateBoundaries, plateBoundariesData, plateTypeFilters]);

  // 필터링 적용
  const filteredEarthquakes = useMemo(() => {
    if (fetchStatus !== 'success' && fetchStatus !== 'empty') {
      return [];
    }

    return rawEarthquakes.filter((eq) => {
      if (eq.mag !== null) {
        if (eq.mag < minMagnitude) return false;
      } else {
        if (minMagnitude > 2.5) return false;
      }

      if (depthFilter === 'all') return true;
      if (depthFilter === 'unknown') return eq.depthKm === null;
      if (eq.depthKm === null) return false;

      if (depthFilter === 'shallow') return eq.depthKm < 70;
      if (depthFilter === 'intermediate') return eq.depthKm >= 70 && eq.depthKm < 300;
      if (depthFilter === 'deep') return eq.depthKm >= 300;

      return true;
    });
  }, [rawEarthquakes, minMagnitude, depthFilter, fetchStatus]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filteredEarthquakes.length, sortBy]);

  const sortedEarthquakes = useMemo(() => {
    const list = [...filteredEarthquakes];
    if (sortBy === 'latest') {
      return list.sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
    }
    if (sortBy === 'magnitude') {
      return list.sort((a, b) => (b.mag ?? -999) - (a.mag ?? -999));
    }
    return list;
  }, [filteredEarthquakes, sortBy]);

  const totalItems = sortedEarthquakes.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedList = useMemo(() => {
    return sortedEarthquakes.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedEarthquakes, startIndex, itemsPerPage]);

  const stats = useMemo(() => {
    const validMagnitudes = filteredEarthquakes
      .map((e) => e.mag)
      .filter((m): m is number => typeof m === 'number' && !isNaN(m));

    const maxMagnitude =
      validMagnitudes.length > 0 ? Math.max(...validMagnitudes) : null;

    let shallowCount = 0;
    let intermediateCount = 0;
    let deepCount = 0;
    let unknownDepthCount = 0;
    let missingMagCount = 0;

    filteredEarthquakes.forEach((e) => {
      if (e.mag === null || isNaN(e.mag)) {
        missingMagCount++;
      }

      if (e.depthKm === null || isNaN(e.depthKm)) {
        unknownDepthCount++;
      } else if (e.depthKm < 70) {
        shallowCount++;
      } else if (e.depthKm < 300) {
        intermediateCount++;
      } else {
        deepCount++;
      }
    });

    return {
      maxMagnitude,
      shallowCount,
      intermediateCount,
      deepCount,
      unknownDepthCount,
      missingMagCount,
      total: filteredEarthquakes.length,
      rawTotal: rawEarthquakes.length,
    };
  }, [filteredEarthquakes, rawEarthquakes]);

  // 지진 마커 렌더링
  useEffect(() => {
    const layer = earthquakeLayerRef.current;
    if (!layer) return;

    layer.clearLayers();
    markerMapRef.current.clear();
    if (filteredEarthquakes.length === 0) return;

    filteredEarthquakes.forEach((eq) => {
      const radius = getMarkerRadius(eq.mag);
      const depthInfo = getDepthInfo(eq.depthKm);

      const marker = L.circleMarker([eq.lat, eq.lng], {
        radius,
        fillColor: depthInfo.fillColor,
        color: depthInfo.borderColor,
        weight: 1.5,
        opacity: 0.9,
        fillOpacity: 0.75,
      });

      const popupContainer = document.createElement('div');
      popupContainer.className =
        'p-3 text-[rgba(0,0,0,0.87)] text-xs font-sans space-y-2 min-w-[230px] max-w-[290px] bg-white rounded-xl';

      const titleEl = document.createElement('h4');
      titleEl.className =
        'font-bold text-sm text-[#006241] border-b border-[#edebe9] pb-1.5 mb-1 leading-snug';
      titleEl.textContent = eq.place || '위치 설명 정보 없음';
      popupContainer.appendChild(titleEl);

      const magEl = document.createElement('div');
      magEl.className = 'font-semibold text-[#1E3932] text-xs';
      const magDisplay =
        eq.mag !== null ? `M ${eq.mag.toFixed(1)}` : '값 없음 (정보 없음)';
      const magTypeDisplay = eq.magType ? ` (${eq.magType})` : '';
      magEl.textContent = `규모: ${magDisplay}${magTypeDisplay}`;
      popupContainer.appendChild(magEl);

      const depthContainer = document.createElement('div');
      depthContainer.className = 'text-[rgba(0,0,0,0.87)] text-xs space-y-0.5';

      const depthTextEl = document.createElement('div');
      depthTextEl.className = 'flex items-center gap-1.5 font-medium';

      const depthDot = document.createElement('span');
      depthDot.style.display = 'inline-block';
      depthDot.style.width = '8px';
      depthDot.style.height = '8px';
      depthDot.style.borderRadius = '50%';
      depthDot.style.backgroundColor = depthInfo.fillColor;
      depthDot.style.border = `1px solid ${depthInfo.borderColor}`;
      depthTextEl.appendChild(depthDot);

      const depthValueSpan = document.createElement('span');
      depthValueSpan.textContent = `진원 깊이: ${
        eq.depthKm !== null ? `${eq.depthKm.toFixed(1)} km` : '깊이 정보 없음'
      }`;
      depthTextEl.appendChild(depthValueSpan);
      depthContainer.appendChild(depthTextEl);

      const depthCategoryEl = document.createElement('div');
      depthCategoryEl.className = 'text-[11px] text-[rgba(0,0,0,0.58)] pl-3.5';
      depthCategoryEl.textContent = `구분: ${depthInfo.label}`;
      depthContainer.appendChild(depthCategoryEl);

      if (eq.depthKm !== null && eq.depthKm < 0) {
        const negativeNoteEl = document.createElement('div');
        negativeNoteEl.className =
          'text-[10px] text-amber-800 bg-[#faf6ee] p-1.5 rounded-lg border border-[#dfc49d] mt-1';
        negativeNoteEl.textContent =
          '※ 음수 깊이는 평균 해수면 기준 지표 고도나 관측 모델 추정치와 관련된 원자료 값입니다.';
        depthContainer.appendChild(negativeNoteEl);
      }

      popupContainer.appendChild(depthContainer);

      const timeEl = document.createElement('div');
      timeEl.className = 'text-[rgba(0,0,0,0.58)] text-xs';
      timeEl.textContent = `발생 시각: ${formatToKST(eq.time)}`;
      popupContainer.appendChild(timeEl);

      if (eq.url) {
        const linkEl = document.createElement('a');
        linkEl.href = eq.url;
        linkEl.target = '_blank';
        linkEl.rel = 'noopener noreferrer';
        linkEl.className =
          'inline-flex items-center gap-1 mt-1.5 text-xs font-semibold text-[#00754A] hover:underline';
        linkEl.textContent = 'USGS 상세 페이지 열기 ↗';
        popupContainer.appendChild(linkEl);
      } else {
        const noLinkEl = document.createElement('div');
        noLinkEl.className = 'text-[rgba(0,0,0,0.58)] text-xs italic mt-1';
        noLinkEl.textContent = 'USGS 상세 페이지 링크 없음';
        popupContainer.appendChild(noLinkEl);
      }

      marker.bindPopup(popupContainer);

      marker.on('click', () => {
        setSelectedEarthquake(eq);
      });

      marker.addTo(layer);
      markerMapRef.current.set(eq.id, marker);
    });
  }, [filteredEarthquakes]);

  const handleSelectEarthquakeFromList = useCallback(
    (eq: ValidatedEarthquake) => {
      setSelectedEarthquake(eq);
      if (mapInstanceRef.current) {
        const targetZoom = Math.max(mapInstanceRef.current.getZoom(), 5);
        mapInstanceRef.current.setView([eq.lat, eq.lng], targetZoom, {
          animate: true,
        });

        const marker = markerMapRef.current.get(eq.id);
        if (marker) {
          marker.openPopup();
        }
      }

      if (mobileTab === 'list') {
        setMobileTab('map');
      }
    },
    [mobileTab]
  );

  const handleResetFilters = () => {
    setSelectedPeriod('week');
    setMinMagnitude(2.5);
    setDepthFilter('all');
  };

  const handleResetMapView = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([20, 0], 2);
    }
  };

  const selectedDepthInfo = selectedEarthquake
    ? getDepthInfo(selectedEarthquake.depthKm)
    : null;

  const currentPeriodConfig = PERIOD_CONFIGS[selectedPeriod];
  const currentDepthConfig =
    DEPTH_FILTER_OPTIONS.find((d) => d.key === depthFilter) ||
    DEPTH_FILTER_OPTIONS[0];

  return (
    <div className="min-h-screen bg-[#f2f0eb] text-[rgba(0,0,0,0.87)] flex flex-col font-sans tracking-[-0.01em]">
      {/* 1. 상단 글로벌 네비게이션 (Starbucks Nav Style: White bg, 3-layer soft lift, 50px pill buttons) */}
      <header className="bg-white sb-nav-shadow sticky top-0 z-30 transition-all border-b border-[#edebe9]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3.5">
            {/* Starbucks Green Circular Brand Mark */}
            <div className="w-11 h-11 rounded-full bg-[#006241] text-white flex items-center justify-center shadow-xs shrink-0">
              <Globe className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-[#006241] tracking-[-0.01em]">
                  지구의 지진 알아보기
                </h1>
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#d4e9e2] text-[#006241]">
                  중학교 과학 탐구
                </span>
              </div>
              <p className="text-xs sm:text-sm text-[rgba(0,0,0,0.58)] mt-0.5">
                지권의 변화 · 실시간 지진 분포와 판 구조론(Plate Tectonics) 탐구
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-stretch md:self-auto justify-between md:justify-end">
            <div className="text-right hidden sm:block">
              <span className="text-xs font-bold text-[#1E3932] block">
                USGS {currentPeriodConfig.label} · 규모 2.5 이상
              </span>
              <span className="text-[11px] text-[rgba(0,0,0,0.58)]">
                (소규모 지진 등 전 세계 모든 지진이 포함되지는 않음)
              </span>
            </div>

            {/* Primary Filled Pill Button in Green Accent (#00754A) */}
            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={fetchStatus === 'loading'}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#00754A] hover:bg-[#006241] disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition-all duration-200 cursor-pointer disabled:cursor-not-allowed shrink-0 sb-btn-active"
              title="현재 선택된 기간의 최신 지진 데이터를 USGS 서버에서 다시 받아옵니다"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  fetchStatus === 'loading' ? 'animate-spin' : ''
                }`}
              />
              {fetchStatus === 'loading' ? '수신 중...' : '데이터 새로고침'}
            </button>
          </div>
        </div>
      </header>

      {/* 모바일 화면용 자료 범위 표시 */}
      <div className="bg-[#edebe9] border-b border-[#d6dbde] px-4 py-2 sm:hidden text-xs text-[#1E3932] flex flex-col gap-0.5">
        <span className="font-bold">
          USGS {currentPeriodConfig.label} · 규모 2.5 이상 자료
        </span>
        <span className="text-[11px] text-[rgba(0,0,0,0.58)]">
          (관측망 특성상 전 세계 모든 지진을 빠짐없이 보여 주는 것은 아닙니다)
        </span>
      </div>

      {/* 2. 에스프레소 다크 피처 밴드 (House Green #1E3932 Feature Band with Gold Ceremony Accent) */}
      <section className="bg-[#1E3932] text-white px-4 sm:px-6 py-4 shadow-sm border-b border-[#2b5148]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#2b5148] flex items-center justify-center shrink-0 border border-[#cba258]/30">
              <BookOpen className="w-4 h-4 text-[#cba258]" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#cba258] block">
                중학교 과학 핵심 개념
              </span>
              <p className="text-xs sm:text-sm font-medium text-white/95 leading-relaxed">
                <strong>규모(Magnitude)</strong>는 지진의 크기를 나타내는
                절대값이고, <strong>진도(Intensity)</strong>는 장소에 따라
                달라지는 흔들림의 정도입니다.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
            {/* Outlined on Dark Pill Button */}
            <button
              type="button"
              onClick={handleResetMapView}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-white/60 hover:border-white text-xs font-medium text-white transition-all sb-btn-active cursor-pointer"
            >
              <RotateCcw className="w-3 h-3 text-[#cba258]" />
              초기 지도 위치 (위도 20, 줌 2)
            </button>
          </div>
        </div>
      </section>

      {/* 3. 메인 콘텐츠 캔버스 (Neutral Warm #f2f0eb) */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full flex-1 flex flex-col gap-6">
        {/* 필터 제어 패널 (White Card, 12px radius, sb-card-shadow) */}
        <section
          aria-label="지진 필터 제어 패널"
          className="bg-white rounded-[12px] p-4 sm:p-6 sb-card-shadow flex flex-col gap-4 border border-[#edebe9]"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#edebe9] pb-3.5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#edebe9] flex items-center justify-center text-[#006241]">
                <SlidersHorizontal className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-[#006241]">
                  지진 데이터 탐구 필터
                </h2>
                <span className="text-[11px] text-[rgba(0,0,0,0.58)]">
                  수업 주제에 맞게 기간·규모·깊이를 조합하여 판 구조론의 상관성을 확인하세요
                </span>
              </div>
            </div>

            {/* Dark Outlined 50px Pill Button */}
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold text-[rgba(0,0,0,0.87)] hover:bg-[#edebe9] border border-[#d6dbde] cursor-pointer transition-all sb-btn-active self-start sm:self-auto"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[rgba(0,0,0,0.58)]" />
              조건 초기화 (최근 7일 · M2.5 · 전체)
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* 1. 기간 선택 (Segmented 50px pill controls) */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-[#1E3932] flex items-center justify-between">
                <span>1. 발생 기간 선택</span>
                <span className="text-[11px] font-semibold text-[#00754A]">
                  {fetchStatus === 'loading'
                    ? '피드 수신 중...'
                    : cacheRef.current[selectedPeriod]
                    ? '캐시 적용'
                    : '최신 수신'}
                </span>
              </label>

              <div className="grid grid-cols-3 gap-1.5 bg-[#f2f0eb] p-1 rounded-full border border-[#edebe9]">
                {(Object.keys(PERIOD_CONFIGS) as PeriodKey[]).map((pKey) => {
                  const cfg = PERIOD_CONFIGS[pKey];
                  const isActive = selectedPeriod === pKey;
                  return (
                    <button
                      key={pKey}
                      type="button"
                      onClick={() => setSelectedPeriod(pKey)}
                      disabled={fetchStatus === 'loading' && isActive}
                      className={`py-1.5 px-2 rounded-full text-xs font-semibold transition-all cursor-pointer text-center sb-btn-active ${
                        isActive
                          ? 'bg-[#00754A] text-white shadow-xs font-bold'
                          : 'text-[rgba(0,0,0,0.70)] hover:text-[#006241] hover:bg-white/80'
                      }`}
                    >
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
              <span className="text-[11px] text-[rgba(0,0,0,0.58)]">
                {currentPeriodConfig.description}
              </span>
            </div>

            {/* 2. 최소 규모 선택 */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-[#1E3932]">
                <label htmlFor="min-mag-select">2. 최소 규모(M) 선택</label>
                <span className="text-[11px] font-bold text-[#006241]">
                  M {minMagnitude.toFixed(1)} 이상
                </span>
              </div>

              <div className="relative">
                <select
                  id="min-mag-select"
                  value={minMagnitude}
                  onChange={(e) => setMinMagnitude(parseFloat(e.target.value))}
                  className="w-full bg-[#f9f9f9] border border-[#d6dbde] rounded-full px-4 py-2 text-xs font-medium text-[rgba(0,0,0,0.87)] shadow-2xs focus:ring-2 focus:ring-[#00754A] focus:outline-none cursor-pointer appearance-none"
                >
                  {MIN_MAG_OPTIONS.map((val) => (
                    <option key={val} value={val}>
                      규모 M {val.toFixed(1)} 이상{' '}
                      {val === 2.5
                        ? '(기본 전체)'
                        : val >= 6.0
                        ? '(대규모 지진)'
                        : ''}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-[rgba(0,0,0,0.58)]">
                  <Filter className="w-3.5 h-3.5" />
                </div>
              </div>

              <span className="text-[11px] text-[rgba(0,0,0,0.58)]">
                피드 기준이 M2.5 이상이므로 2.5 미만 지진은 미포함됩니다.
              </span>
            </div>

            {/* 3. 진원 깊이 선택 */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-[#1E3932]">
                <label htmlFor="depth-select">3. 진원 깊이 선택</label>
                <span className="text-[11px] font-bold text-[#00754A]">
                  {currentDepthConfig.shortLabel}
                </span>
              </div>

              <div className="relative">
                <select
                  id="depth-select"
                  value={depthFilter}
                  onChange={(e) =>
                    setDepthFilter(e.target.value as DepthFilterKey)
                  }
                  className="w-full bg-[#f9f9f9] border border-[#d6dbde] rounded-full px-4 py-2 text-xs font-medium text-[rgba(0,0,0,0.87)] shadow-2xs focus:ring-2 focus:ring-[#00754A] focus:outline-none cursor-pointer appearance-none"
                >
                  {DEPTH_FILTER_OPTIONS.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-[rgba(0,0,0,0.58)]">
                  <Layers className="w-3.5 h-3.5" />
                </div>
              </div>

              <span className="text-[11px] text-[rgba(0,0,0,0.58)]">
                {currentDepthConfig.description}
              </span>
            </div>
          </div>

          {/* 현재 조건 표시 바 (Warm Ceramic #edebe9 Wash) */}
          <div className="bg-[#edebe9] p-3 rounded-[12px] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="font-bold text-[#1E3932] flex items-center gap-1">
                <Check className="w-3.5 h-3.5 text-[#00754A]" />
                현재 적용 조건:
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-white text-[#006241] font-semibold text-[11px] shadow-2xs">
                {currentPeriodConfig.label}
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-white text-[#1E3932] font-semibold text-[11px] shadow-2xs">
                규모 M {minMagnitude.toFixed(1)} 이상
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-white text-[#00754A] font-semibold text-[11px] shadow-2xs">
                깊이: {currentDepthConfig.label}
              </span>
            </div>

            <div className="text-right sm:self-center">
              <div className="text-xs">
                <span className="text-[rgba(0,0,0,0.58)]">조건 일치 지진: </span>
                <span className="text-sm font-bold text-[#006241]">
                  {filteredEarthquakes.length.toLocaleString()}건
                </span>
                <span className="text-[rgba(0,0,0,0.58)] text-[11px] ml-1">
                  / 전체 {rawEarthquakes.length.toLocaleString()}건
                </span>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-[rgba(0,0,0,0.58)] leading-tight">
            ※ 이 수치는 현재 지도 화면 안쪽만의 개수가 아니라, 선택하신 발생
            기간·최소 규모·진원 깊이 조건 전체에 부합하는 전 세계 지진의 총
            개수입니다.
          </p>
        </section>

        {/* 요약 카드 영역 (White Cards, 12px Radius, Whisper-Soft Shadow) */}
        <section
          aria-label="데이터 요약 카드"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {/* 1. 조건에 맞는 지진 수 */}
          <div className="bg-white p-5 rounded-[12px] sb-card-shadow flex items-start gap-3.5 border border-[#edebe9]">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                fetchStatus === 'success'
                  ? 'bg-[#d4e9e2] text-[#006241]'
                  : fetchStatus === 'loading'
                  ? 'bg-[#edebe9] text-[#00754A]'
                  : fetchStatus === 'error'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-amber-100 text-amber-700'
              }`}
            >
              {fetchStatus === 'loading' ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : fetchStatus === 'success' ? (
                <Activity className="w-5 h-5" />
              ) : fetchStatus === 'error' ? (
                <XCircle className="w-5 h-5" />
              ) : (
                <AlertTriangle className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-xs font-semibold text-[rgba(0,0,0,0.58)] block uppercase tracking-wider">
                조건 일치 지진 수
              </span>
              <p className="text-xl font-bold text-[#006241] truncate mt-0.5">
                {fetchStatus === 'loading'
                  ? '수신 중...'
                  : fetchStatus === 'error'
                  ? '수신 실패'
                  : `${stats.total.toLocaleString()}건`}
              </p>
              <div className="text-[11px] text-[rgba(0,0,0,0.58)] mt-0.5">
                전체 수신 {stats.rawTotal.toLocaleString()}건 중 일치
                {stats.missingMagCount > 0 && (
                  <span className="block text-[rgba(0,0,0,0.58)]">
                    (규모 미제공 {stats.missingMagCount}건 포함)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 2. 최대 규모 (0건이면 0이 아닌 '해당 없음') */}
          <div className="bg-white p-5 rounded-[12px] sb-card-shadow flex items-start gap-3.5 border border-[#edebe9]">
            <div className="w-10 h-10 rounded-full bg-[#faf6ee] text-[#cba258] border border-[#dfc49d]/60 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-xs font-semibold text-[rgba(0,0,0,0.58)] block uppercase tracking-wider">
                조건 내 최대 규모
              </span>
              <p className="text-xl font-bold text-[#1E3932] truncate mt-0.5">
                {fetchStatus === 'loading'
                  ? '계산 중...'
                  : fetchStatus === 'error'
                  ? '해당 없음'
                  : stats.maxMagnitude !== null
                  ? `M ${stats.maxMagnitude.toFixed(1)}`
                  : '해당 없음'}
              </p>
              <span className="text-[11px] text-[rgba(0,0,0,0.58)] block mt-0.5">
                {stats.total === 0
                  ? '조건 만족 지진 없음'
                  : '결측값은 계산에서 제외'}
              </span>
            </div>
          </div>

          {/* 3. 깊이 구간별 건수 요약 */}
          <div className="bg-white p-5 rounded-[12px] sb-card-shadow flex items-start gap-3.5 border border-[#edebe9]">
            <div className="w-10 h-10 rounded-full bg-[#d4e9e2] text-[#006241] flex items-center justify-center shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-xs font-semibold text-[rgba(0,0,0,0.58)] block uppercase tracking-wider">
                진원 깊이 구간별 건수
              </span>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-1 text-xs">
                <span className="text-orange-800 font-medium truncate">
                  천발: {stats.shallowCount.toLocaleString()}건
                </span>
                <span className="text-blue-800 font-medium truncate">
                  중발: {stats.intermediateCount.toLocaleString()}건
                </span>
                <span className="text-purple-800 font-medium truncate">
                  심발: {stats.deepCount.toLocaleString()}건
                </span>
                <span className="text-[rgba(0,0,0,0.58)] truncate">
                  미제공: {stats.unknownDepthCount.toLocaleString()}건
                </span>
              </div>
            </div>
          </div>

          {/* 4. 판 경계 레이어 상태 요약 */}
          <div className="bg-white p-5 rounded-[12px] sb-card-shadow flex items-start gap-3.5 border border-[#edebe9]">
            <div className="w-10 h-10 rounded-full bg-[#f2f0eb] text-[#00754A] flex items-center justify-center shrink-0">
              <Compass className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-xs font-semibold text-[rgba(0,0,0,0.58)] block uppercase tracking-wider">
                판 경계 레이어 상태
              </span>
              <p className="text-sm font-semibold text-[#1E3932] truncate mt-0.5">
                {showPlateBoundaries
                  ? plateFetchStatus === 'loading'
                    ? '판 경계선 수신 중...'
                    : plateFetchStatus === 'error'
                    ? '수신 실패'
                    : '판 경계선 표시 중 (1,175구간)'
                  : '표시 꺼짐 (대기 중)'}
              </p>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-[11px] text-[rgba(0,0,0,0.58)]">
                  위도 {mapState.lat}° · 배율 {mapState.zoom}x
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* 판 경계 오류 안내 */}
        {showPlateBoundaries && plateFetchStatus === 'error' && (
          <div className="rounded-[12px] bg-[#faf6ee] border border-[#dfc49d] p-4 flex items-start gap-3 text-[#1E3932] sb-card-shadow">
            <ShieldAlert className="w-5 h-5 text-[#cba258] shrink-0 mt-0.5" />
            <div className="flex-1 text-xs sm:text-sm">
              <p className="font-bold text-[#006241]">
                USGS 판 경계 데이터를 불러오지 못했습니다.
              </p>
              <p className="text-[rgba(0,0,0,0.87)] mt-0.5 leading-relaxed">
                오류 내용:{' '}
                {plateErrorMessage ||
                  'ArcGIS 서버 통신 상태를 확인한 후 다시 시도해 주세요.'}
              </p>
              <p className="text-[rgba(0,0,0,0.58)] text-[11px] mt-1">
                ※ 판 경계를 가져오지 못해도 기존 지진 데이터 탐구 및 필터 기능은 정상 이용하실 수 있습니다.
              </p>
            </div>
            <button
              type="button"
              onClick={fetchPlateBoundaries}
              className="px-4 py-1.5 bg-[#00754A] hover:bg-[#006241] text-white rounded-full text-xs font-semibold shrink-0 cursor-pointer sb-btn-active"
            >
              다시 시도
            </button>
          </div>
        )}

        {/* 지진 데이터 오류 안내 */}
        {fetchStatus === 'error' && (
          <div className="rounded-[12px] bg-red-50 border border-red-200 p-4 flex items-start gap-3 text-red-950 sb-card-shadow">
            <AlertCircle className="w-5 h-5 text-[#c82014] shrink-0 mt-0.5" />
            <div className="flex-1 text-xs sm:text-sm">
              <p className="font-bold text-[#c82014]">
                USGS 지진 데이터를 불러오지 못했습니다. (네트워크/서버 오류)
              </p>
              <p className="text-red-900 mt-0.5 leading-relaxed">
                오류 원인:{' '}
                {errorMessage ||
                  '네트워크 연결을 확인한 뒤 "데이터 새로고침" 버튼을 눌러주세요.'}
              </p>
              <p className="text-red-800/80 text-xs mt-1">
                ※ 통신 실패를 '0건 발생'으로 왜곡하지 않으며 가상 지진 데이터도 일체 생성하지 않습니다.
              </p>
            </div>
            <button
              type="button"
              onClick={handleManualRefresh}
              className="px-4 py-1.5 bg-[#c82014] hover:bg-red-800 text-white rounded-full text-xs font-semibold shrink-0 cursor-pointer sb-btn-active"
            >
              다시 시도
            </button>
          </div>
        )}

        {/* 0건 결과 안내 */}
        {fetchStatus === 'success' && filteredEarthquakes.length === 0 && (
          <div className="rounded-[12px] bg-[#faf6ee] border border-[#dfc49d] p-5 flex items-start gap-3.5 text-[#1E3932] sb-card-shadow">
            <Info className="w-5 h-5 text-[#cba258] shrink-0 mt-0.5" />
            <div className="flex-1 text-xs sm:text-sm">
              <p className="font-bold text-[#006241] text-base">
                현재 조건에 맞는 지진이 없습니다. 기간을 늘리거나 최소 규모를 낮춰 보세요.
              </p>
              <p className="text-[rgba(0,0,0,0.87)] mt-1 leading-relaxed">
                선택하신 조건 ({currentPeriodConfig.label} · 규모 M
                {minMagnitude.toFixed(1)} 이상 · {currentDepthConfig.label})을
                만족하는 지진이 전 세계에 존재하지 않습니다. 상단의 필터 패널에서
                기간을 '최근 30일'로 늘리거나 최소 규모를 M 2.5로 낮추어 탐구해
                보세요.
              </p>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setSelectedPeriod('month')}
                  className="px-4 py-1.5 bg-[#00754A] hover:bg-[#006241] text-white rounded-full text-xs font-semibold cursor-pointer sb-btn-active"
                >
                  기간을 최근 30일로 늘리기
                </button>
                <button
                  type="button"
                  onClick={() => setMinMagnitude(2.5)}
                  className="px-4 py-1.5 bg-white border border-[#00754A] text-[#00754A] hover:bg-[#d4e9e2]/30 rounded-full text-xs font-semibold cursor-pointer sb-btn-active"
                >
                  최소 규모를 M 2.5로 낮추기
                </button>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="px-4 py-1.5 bg-[#edebe9] text-[rgba(0,0,0,0.87)] hover:bg-[#d6dbde] rounded-full text-xs font-semibold cursor-pointer sb-btn-active"
                >
                  필터 전체 초기화
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 모바일 화면용 탭 전환 버튼 (50px Full-Pill) */}
        <div className="flex sm:hidden items-center justify-between bg-white p-1 rounded-full sb-card-shadow border border-[#edebe9]">
          <button
            type="button"
            onClick={() => setMobileTab('all')}
            className={`flex-1 py-2 px-3 text-xs font-bold rounded-full transition-all cursor-pointer text-center sb-btn-active ${
              mobileTab === 'all'
                ? 'bg-[#00754A] text-white shadow-xs'
                : 'text-[rgba(0,0,0,0.70)] hover:text-[#006241]'
            }`}
          >
            함께 보기
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('map')}
            className={`flex-1 py-2 px-3 text-xs font-bold rounded-full transition-all cursor-pointer text-center flex items-center justify-center gap-1 sb-btn-active ${
              mobileTab === 'map'
                ? 'bg-[#00754A] text-white shadow-xs'
                : 'text-[rgba(0,0,0,0.70)] hover:text-[#006241]'
            }`}
          >
            <MapIcon className="w-3.5 h-3.5" />
            지도만
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('list')}
            className={`flex-1 py-2 px-3 text-xs font-bold rounded-full transition-all cursor-pointer text-center flex items-center justify-center gap-1 sb-btn-active ${
              mobileTab === 'list'
                ? 'bg-[#00754A] text-white shadow-xs'
                : 'text-[rgba(0,0,0,0.70)] hover:text-[#006241]'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            목록만 ({totalItems})
          </button>
        </div>

        {/* 메인 작업 영역: 지도 + 범례 + 판 경계 설정 + 지진 목록 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* 지도 및 범례 영역 (8/12 컬럼) */}
          <div
            className={`lg:col-span-8 flex flex-col gap-6 ${
              mobileTab === 'list' ? 'hidden sm:flex' : 'flex'
            }`}
          >
            {/* 세계 지도 카드 */}
            <section
              aria-label="세계 지진 지도"
              className="bg-white rounded-[12px] sb-card-shadow overflow-hidden flex flex-col border border-[#edebe9]"
            >
              <div className="px-5 py-3.5 border-b border-[#edebe9] bg-[#f9f9f9] flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#006241]" />
                  <h2 className="text-sm font-bold text-[#006241]">
                    인터랙티브 세계 지진 및 판 경계 지도
                  </h2>
                  {fetchStatus === 'success' && (
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#d4e9e2] text-[#006241] font-semibold">
                      지진: {filteredEarthquakes.length.toLocaleString()}건
                    </span>
                  )}
                  {showPlateBoundaries && plateFetchStatus === 'success' && (
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#edebe9] text-[#1E3932] font-semibold">
                      판 경계 활성
                    </span>
                  )}
                </div>
                <div className="text-xs text-[rgba(0,0,0,0.58)]">
                  원: 지진(크기=규모, 색=깊이) | 선: 판 경계선
                </div>
              </div>

              {/* 지도 컨테이너 - 560px 고정 높이 */}
              <div className="relative w-full">
                <div
                  ref={mapContainerRef}
                  style={{ height: '560px', width: '100%' }}
                  className="z-10 focus:outline-none"
                />
              </div>
            </section>

            {/* 판 경계 제어 및 선 범례 패널 (White Card, 12px Radius) */}
            <section
              aria-label="판 경계 레이어 제어 및 범례"
              className="bg-white rounded-[12px] p-5 sb-card-shadow flex flex-col gap-4 border border-[#edebe9]"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#edebe9] pb-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#d4e9e2] text-[#006241] flex items-center justify-center shrink-0">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-[#006241] flex items-center gap-2">
                      USGS 판 경계(Tectonic Plate Boundaries) 레이어
                    </h3>
                    <p className="text-[11px] text-[rgba(0,0,0,0.58)]">
                      판 구조론의 4대 경계(수렴·발산·보존·기타) 선을 지도에 중첩합니다
                    </p>
                  </div>
                </div>

                {/* 전체 판 경계 켜기/끄기 50px Pill Toggle */}
                <button
                  type="button"
                  onClick={handleTogglePlateBoundaries}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer self-start sm:self-auto sb-btn-active ${
                    showPlateBoundaries
                      ? 'bg-[#00754A] text-white shadow-xs hover:bg-[#006241]'
                      : 'bg-[#edebe9] text-[rgba(0,0,0,0.87)] hover:bg-[#d6dbde] border border-[#d6dbde]'
                  }`}
                >
                  {showPlateBoundaries ? (
                    <>
                      <ToggleRight className="w-4 h-4 text-white" />
                      판 경계 표시 중 (켜짐)
                    </>
                  ) : (
                    <>
                      <ToggleLeft className="w-4 h-4 text-[rgba(0,0,0,0.58)]" />
                      판 경계 표시 켜기 (현재 꺼짐)
                    </>
                  )}
                </button>
              </div>

              {/* 판 경계 활성화 시 노출되는 경계 종류별 선택 UI */}
              {showPlateBoundaries ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-semibold text-[#1E3932]">
                    <span>경계 종류별 개별 표시 선택:</span>
                    <span className="text-[11px] text-[#00754A] font-semibold">
                      {plateFetchStatus === 'loading'
                        ? '1,175개 구간 불러오는 중...'
                        : '구간별 체크 해제 시 즉시 숨김'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                    {/* 1. 수렴 경계 */}
                    <label
                      className={`flex items-start gap-2.5 p-3 rounded-[12px] border transition-all cursor-pointer select-none ${
                        plateTypeFilters.convergent
                          ? 'bg-red-50/60 border-red-200 shadow-2xs'
                          : 'bg-[#f9f9f9] border-[#edebe9] opacity-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={plateTypeFilters.convergent}
                        onChange={(e) =>
                          setPlateTypeFilters((prev) => ({
                            ...prev,
                            convergent: e.target.checked,
                          }))
                        }
                        className="mt-0.5 rounded text-[#b91c1c] focus:ring-[#b91c1c] cursor-pointer"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 font-bold text-red-950">
                          <span
                            className="inline-block w-4 h-[3.5px] rounded-full shrink-0"
                            style={{ backgroundColor: '#b91c1c' }}
                          ></span>
                          <span>수렴 경계</span>
                        </div>
                        <span className="text-[10px] text-red-800/80 block mt-0.5">
                          짙은 붉은 실선 (충돌·섭입대)
                        </span>
                      </div>
                    </label>

                    {/* 2. 발산 경계 */}
                    <label
                      className={`flex items-start gap-2.5 p-3 rounded-[12px] border transition-all cursor-pointer select-none ${
                        plateTypeFilters.divergent
                          ? 'bg-teal-50/60 border-teal-200 shadow-2xs'
                          : 'bg-[#f9f9f9] border-[#edebe9] opacity-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={plateTypeFilters.divergent}
                        onChange={(e) =>
                          setPlateTypeFilters((prev) => ({
                            ...prev,
                            divergent: e.target.checked,
                          }))
                        }
                        className="mt-0.5 rounded text-[#0f766e] focus:ring-[#0f766e] cursor-pointer"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 font-bold text-teal-950">
                          <span className="inline-block w-4 text-[10px] font-bold text-[#0f766e] tracking-tighter shrink-0">
                            ╌╌
                          </span>
                          <span>발산 경계</span>
                        </div>
                        <span className="text-[10px] text-teal-800/80 block mt-0.5">
                          짙은 청록색 긴 점선 (해령 등)
                        </span>
                      </div>
                    </label>

                    {/* 3. 보존 경계 */}
                    <label
                      className={`flex items-start gap-2.5 p-3 rounded-[12px] border transition-all cursor-pointer select-none ${
                        plateTypeFilters.transform
                          ? 'bg-[#edebe9] border-[#d6dbde] shadow-2xs'
                          : 'bg-[#f9f9f9] border-[#edebe9] opacity-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={plateTypeFilters.transform}
                        onChange={(e) =>
                          setPlateTypeFilters((prev) => ({
                            ...prev,
                            transform: e.target.checked,
                          }))
                        }
                        className="mt-0.5 rounded text-[#374151] focus:ring-[#374151] cursor-pointer"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 font-bold text-[rgba(0,0,0,0.87)]">
                          <span className="inline-block w-4 text-[10px] font-bold text-[#374151] tracking-widest shrink-0">
                            ┄┄
                          </span>
                          <span>보존 경계</span>
                        </div>
                        <span className="text-[10px] text-[rgba(0,0,0,0.58)] block mt-0.5">
                          짙은 회색 짧은 점선 (변환 단층)
                        </span>
                      </div>
                    </label>

                    {/* 4. 기타·미분류 */}
                    <label
                      className={`flex items-start gap-2.5 p-3 rounded-[12px] border transition-all cursor-pointer select-none ${
                        plateTypeFilters.other
                          ? 'bg-[#f9f9f9] border-[#d6dbde] shadow-2xs'
                          : 'bg-[#f9f9f9] border-[#edebe9] opacity-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={plateTypeFilters.other}
                        onChange={(e) =>
                          setPlateTypeFilters((prev) => ({
                            ...prev,
                            other: e.target.checked,
                          }))
                        }
                        className="mt-0.5 rounded text-slate-500 focus:ring-slate-400 cursor-pointer"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 font-bold text-[rgba(0,0,0,0.70)]">
                          <span className="inline-block w-4 text-[10px] text-slate-400 tracking-widest shrink-0">
                            ····
                          </span>
                          <span>기타·미분류</span>
                        </div>
                        <span className="text-[10px] text-[rgba(0,0,0,0.58)] block mt-0.5">
                          옅은 회색 점선 (복합 변형대)
                        </span>
                      </div>
                    </label>
                  </div>

                  <p className="text-[11px] text-[rgba(0,0,0,0.58)] leading-relaxed">
                    ※ 선을 마우스로 클릭하면 원문의 판 이름(NAME)과 번역된 경계 종류를 확인할 수 있습니다.
                  </p>
                </div>
              ) : (
                <div className="p-3.5 bg-[#f9f9f9] rounded-[12px] border border-[#edebe9] text-xs text-[rgba(0,0,0,0.58)] flex items-center justify-between">
                  <span>
                    현재 판 경계선이 꺼져 있습니다. 상단 '판 경계 표시 켜기' 버튼을 누르면 세계지도에 4대 판 경계선이 로드됩니다.
                  </span>
                </div>
              )}

              {/* 필수 과학 안내 및 원자료 출처 명시 */}
              <div className="mt-1 pt-3 border-t border-[#edebe9] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-[rgba(0,0,0,0.58)]">
                <p className="font-medium text-[#1E3932]">
                  <span className="text-[#cba258] font-bold mr-1">
                    ⚠️ 필수 안내:
                  </span>
                  판 경계는 참고 모델입니다. 지진은 판 내부에서도 발생할 수
                  있으며, 이 지도는 미래 지진을 예측하지 않습니다.
                </p>
                <div className="shrink-0 text-[10px]">
                  원자료:{' '}
                  <a
                    href="https://earthquake.usgs.gov/arcgis/rest/services/eq/map_plateboundaries/MapServer/1"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#00754A] font-medium hover:underline"
                  >
                    USGS Tectonic Plate Boundaries
                  </a>{' '}
                  / Peter Bird(2003)
                </div>
              </div>
            </section>

            {/* 지진 원 범례 2개 가로 배치 (깊이 색상 & 규모 크기) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 1. 깊이 색 범례 */}
              <div className="bg-white rounded-[12px] p-5 sb-card-shadow border border-[#edebe9]">
                <div className="flex items-center justify-between border-b border-[#edebe9] pb-2.5 mb-3">
                  <h3 className="text-xs font-bold text-[#006241] flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#00754A]"></span>
                    진원 깊이 색상 범례 (원 색상)
                  </h3>
                  <span className="text-[11px] text-[rgba(0,0,0,0.58)]">깊이별 구분</span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between p-2 rounded-[8px] bg-orange-50/70 border border-orange-100">
                    <div className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 rounded-full bg-orange-500 border border-orange-700 shadow-2xs"></span>
                      <span className="font-semibold text-orange-950">
                        70km 미만 (천발 지진)
                      </span>
                    </div>
                    <span className="text-[11px] font-bold text-orange-800">
                      {stats.shallowCount.toLocaleString()}건
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-[8px] bg-blue-50/70 border border-blue-100">
                    <div className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 rounded-full bg-blue-500 border border-blue-700 shadow-2xs"></span>
                      <span className="font-semibold text-blue-950">
                        70~300km 미만 (중발 지진)
                      </span>
                    </div>
                    <span className="text-[11px] font-bold text-blue-800">
                      {stats.intermediateCount.toLocaleString()}건
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-[8px] bg-purple-50/70 border border-purple-100">
                    <div className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 rounded-full bg-purple-500 border border-purple-700 shadow-2xs"></span>
                      <span className="font-semibold text-purple-950">
                        300km 이상 (심발 지진)
                      </span>
                    </div>
                    <span className="text-[11px] font-bold text-purple-800">
                      {stats.deepCount.toLocaleString()}건
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-[8px] bg-[#edebe9] border border-[#d6dbde]">
                    <div className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 rounded-full bg-slate-400 border border-slate-600 shadow-2xs"></span>
                      <span className="font-semibold text-[rgba(0,0,0,0.87)]">
                        깊이 정보 없음
                      </span>
                    </div>
                    <span className="text-[11px] font-bold text-[rgba(0,0,0,0.58)]">
                      {stats.unknownDepthCount.toLocaleString()}건
                    </span>
                  </div>
                </div>

                <p className="mt-2.5 text-[10px] text-[rgba(0,0,0,0.58)]">
                  ※ 깊이 색상은 위험 등급이 아닌 물리적 발생 깊이 분류입니다.
                </p>
              </div>

              {/* 2. 규모 크기 범례 */}
              <div className="bg-white rounded-[12px] p-5 sb-card-shadow border border-[#edebe9]">
                <div className="flex items-center justify-between border-b border-[#edebe9] pb-2.5 mb-3">
                  <h3 className="text-xs font-bold text-[#006241] flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#1E3932]"></span>
                    지진 규모 크기 범례 (원 반지름)
                  </h3>
                  <span className="text-[11px] text-[rgba(0,0,0,0.58)]">화면상 크기</span>
                </div>

                <div className="flex items-end justify-between px-3 py-2.5 bg-[#f2f0eb] rounded-[12px] border border-[#edebe9] mb-2.5">
                  <div className="flex flex-col items-center gap-1">
                    <div className="h-8 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-slate-400 border border-slate-600"></div>
                    </div>
                    <span className="text-[10px] text-[rgba(0,0,0,0.70)] font-medium">M2.5 (4px)</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <div className="h-8 flex items-center justify-center">
                      <div className="w-4 h-4 rounded-full bg-slate-400 border border-slate-600"></div>
                    </div>
                    <span className="text-[10px] text-[rgba(0,0,0,0.70)] font-medium">M4.5 (10px)</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <div className="h-8 flex items-center justify-center">
                      <div className="w-6 h-6 rounded-full bg-slate-400 border border-slate-600"></div>
                    </div>
                    <span className="text-[10px] text-[rgba(0,0,0,0.70)] font-medium">M6.5 (16px)</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <div className="h-8 flex items-center justify-center">
                      <div className="w-8 h-8 rounded-full bg-[#006241] border border-[#1E3932]"></div>
                    </div>
                    <span className="text-[10px] text-[#006241] font-bold">M8.5+ (22px)</span>
                  </div>
                </div>

                <p className="text-[10px] text-[rgba(0,0,0,0.58)] leading-tight">
                  ※ 이 식은 시각적 비교를 위한 것이며 실제 에너지 비율이나 피해 반경을 뜻하지 않습니다.
                </p>
              </div>
            </div>
          </div>

          {/* 지진 목록 패널 (4/12 컬럼) (White Card, 12px Radius) */}
          <aside
            aria-label="지진 목록 영역"
            className={`lg:col-span-4 flex flex-col gap-4 ${
              mobileTab === 'map' ? 'hidden sm:flex' : 'flex'
            }`}
          >
            <div className="bg-white rounded-[12px] sb-card-shadow overflow-hidden flex flex-col border border-[#edebe9]">
              {/* 목록 헤더 & 정렬 옵션 */}
              <div className="p-4 border-b border-[#edebe9] bg-[#f9f9f9] flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <List className="w-4 h-4 text-[#00754A]" />
                    <h2 className="text-sm font-bold text-[#006241]">
                      조건 일치 지진 목록
                    </h2>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <ArrowUpDown className="w-3.5 h-3.5 text-[rgba(0,0,0,0.58)]" />
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as SortKey)}
                      aria-label="지진 목록 정렬 기준"
                      className="text-xs bg-white border border-[#d6dbde] rounded-full px-3 py-1 font-semibold text-[rgba(0,0,0,0.87)] focus:outline-none focus:ring-1 focus:ring-[#00754A] cursor-pointer"
                    >
                      <option value="latest">최신순</option>
                      <option value="magnitude">규모 큰 순</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-[rgba(0,0,0,0.58)]">
                  <span>
                    전체{' '}
                    <strong className="text-[#006241] font-bold">
                      {totalItems.toLocaleString()}
                    </strong>
                    건 중{' '}
                    {totalItems === 0
                      ? '0건'
                      : `${startIndex + 1}~${Math.min(
                          startIndex + itemsPerPage,
                          totalItems
                        ).toLocaleString()}건 표시`}
                  </span>
                  <span className="text-[11px]">
                    페이지 {currentPage} / {totalPages}
                  </span>
                </div>
              </div>

              {/* 목록 아이템 리스트 */}
              <div
                className="divide-y divide-[#edebe9] max-h-[580px] overflow-y-auto"
                tabIndex={0}
                aria-label="지진 목록 스크롤 영역"
              >
                {paginatedList.length === 0 ? (
                  <div className="p-8 text-center text-xs text-[rgba(0,0,0,0.58)]">
                    <AlertCircle className="w-6 h-6 mx-auto mb-2 text-[rgba(0,0,0,0.40)]" />
                    <p className="font-semibold text-[#1E3932]">
                      표시할 지진이 없습니다.
                    </p>
                    <p className="mt-1 text-[rgba(0,0,0,0.58)]">
                      필터 조건을 변경하거나 새로고침해 보세요.
                    </p>
                  </div>
                ) : (
                  paginatedList.map((eq) => {
                    const depthInfo = getDepthInfo(eq.depthKm);
                    const isSelected = selectedEarthquake?.id === eq.id;

                    return (
                      <div
                        key={eq.id}
                        role="button"
                        tabIndex={0}
                        aria-pressed={isSelected}
                        aria-label={`${eq.place || '위치 설명 정보 없음'}, 규모 ${
                          eq.mag !== null ? `M ${eq.mag.toFixed(1)}` : '정보 없음'
                        }, 깊이 ${
                          eq.depthKm !== null ? `${eq.depthKm.toFixed(1)}km` : '정보 없음'
                        }`}
                        onClick={() => handleSelectEarthquakeFromList(eq)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleSelectEarthquakeFromList(eq);
                          }
                        }}
                        className={`p-3.5 transition-all cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-[#00754A] ${
                          isSelected
                            ? 'bg-[#d4e9e2]/30 border-l-4 border-[#00754A]'
                            : 'hover:bg-[#f2f0eb]/70'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="min-w-0 flex-1">
                            <h3 className="text-xs font-bold text-[rgba(0,0,0,0.87)] truncate leading-snug">
                              {eq.place || '위치 설명 정보 없음'}
                            </h3>

                            <div className="flex items-center gap-2 mt-1 text-[11px] text-[rgba(0,0,0,0.58)] flex-wrap">
                              <span className="flex items-center gap-1">
                                <span
                                  className="w-2 h-2 rounded-full inline-block shrink-0"
                                  style={{ backgroundColor: depthInfo.fillColor }}
                                ></span>
                                깊이:{' '}
                                {eq.depthKm !== null
                                  ? `${eq.depthKm.toFixed(1)} km`
                                  : '정보 없음'}
                              </span>
                              <span>·</span>
                              <span>{formatToKST(eq.time)}</span>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold shadow-2xs ${
                                eq.mag !== null && eq.mag >= 6.0
                                  ? 'bg-[#b91c1c] text-white'
                                  : eq.mag !== null && eq.mag >= 4.5
                                  ? 'bg-[#cba258] text-[#1E3932]'
                                  : 'bg-[#edebe9] text-[#1E3932]'
                              }`}
                            >
                              {eq.mag !== null
                                ? `M ${eq.mag.toFixed(1)}`
                                : '값 없음'}
                            </span>
                          </div>
                        </div>

                        {isSelected && (
                          <div className="mt-2 pt-1.5 border-t border-[#d4e9e2] flex items-center justify-between text-[11px] text-[#006241] font-semibold">
                            <span className="flex items-center gap-1">
                              <Eye className="w-3 h-3" />
                              지도 팝업 및 위치 열림
                            </span>
                            <span>위도 {eq.lat.toFixed(2)}°, 경도 {eq.lng.toFixed(2)}°</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* 페이지네이션 컨트롤 (50px Pill Buttons) */}
              {totalPages > 1 && (
                <div className="p-3.5 border-t border-[#edebe9] bg-[#f9f9f9] flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(1)}
                      aria-label="첫 페이지로"
                      className="p-1.5 rounded-full bg-white border border-[#d6dbde] text-[rgba(0,0,0,0.87)] hover:bg-[#edebe9] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer sb-btn-active"
                    >
                      <ChevronsLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      aria-label="이전 페이지"
                      className="p-1.5 rounded-full bg-white border border-[#d6dbde] text-[rgba(0,0,0,0.87)] hover:bg-[#edebe9] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer sb-btn-active"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <span className="text-[11px] font-bold text-[#1E3932]">
                    {currentPage} / {totalPages}
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={currentPage === totalPages}
                      onClick={() =>
                        setCurrentPage((p) => Math.min(totalPages, p + 1))
                      }
                      aria-label="다음 페이지"
                      className="p-1.5 rounded-full bg-white border border-[#d6dbde] text-[rgba(0,0,0,0.87)] hover:bg-[#edebe9] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer sb-btn-active"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(totalPages)}
                      aria-label="마지막 페이지로"
                      className="p-1.5 rounded-full bg-white border border-[#d6dbde] text-[rgba(0,0,0,0.87)] hover:bg-[#edebe9] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer sb-btn-active"
                    >
                      <ChevronsRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>

        {/* 선택한 지진 상세 정보 카드 */}
        {selectedEarthquake && selectedDepthInfo && (
          <section
            aria-label="선택된 지진 상세 정보"
            className="bg-white rounded-[12px] border-2 border-[#00754A] p-5 sb-card-shadow transition-all"
          >
            <div className="flex items-start justify-between gap-3 border-b border-[#edebe9] pb-3.5">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white font-bold text-xs shadow-xs"
                  style={{ backgroundColor: selectedDepthInfo.fillColor }}
                >
                  <MapPin className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-[#006241] uppercase tracking-wider">
                      선택한 지진 상세 정보
                    </span>
                    <span
                      className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${selectedDepthInfo.badgeClass}`}
                    >
                      {selectedDepthInfo.label}
                    </span>
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-[#1E3932] leading-snug mt-0.5">
                    {selectedEarthquake.place || '위치 설명 정보 없음'}
                  </h3>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSelectEarthquakeFromList(selectedEarthquake)}
                  className="px-3.5 py-1.5 rounded-full bg-[#edebe9] hover:bg-[#d6dbde] text-[rgba(0,0,0,0.87)] text-xs font-semibold cursor-pointer transition-all sb-btn-active"
                >
                  지도 중심 확대
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedEarthquake(null)}
                  className="p-1 rounded-full text-[rgba(0,0,0,0.40)] hover:text-[rgba(0,0,0,0.87)] hover:bg-[#edebe9] cursor-pointer"
                  title="닫기"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4 text-xs sm:text-sm">
              <div className="p-4 rounded-[12px] bg-[#f9f9f9] border border-[#edebe9]">
                <span className="text-xs text-[rgba(0,0,0,0.58)] block mb-1">
                  지진 규모 (Magnitude)
                </span>
                <span className="text-xl font-bold text-[#006241]">
                  {selectedEarthquake.mag !== null
                    ? `M ${selectedEarthquake.mag.toFixed(1)}`
                    : '값 없음 (정보 없음)'}
                </span>
                <span className="text-xs text-[rgba(0,0,0,0.58)] block mt-0.5">
                  {selectedEarthquake.magType
                    ? `종류: ${selectedEarthquake.magType}`
                    : '규모 종류 정보 없음'}
                </span>
              </div>

              <div className="p-4 rounded-[12px] bg-[#f9f9f9] border border-[#edebe9]">
                <span className="text-xs text-[rgba(0,0,0,0.58)] block mb-1">
                  진원 깊이 (Focal Depth)
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span
                    className="text-xl font-bold"
                    style={{ color: selectedDepthInfo.borderColor }}
                  >
                    {selectedEarthquake.depthKm !== null
                      ? `${selectedEarthquake.depthKm.toFixed(1)} km`
                      : '깊이 정보 없음'}
                  </span>
                </div>
                <span className="text-xs text-[rgba(0,0,0,0.58)] block mt-0.5">
                  {selectedDepthInfo.label}
                </span>
                {selectedEarthquake.depthKm !== null &&
                  selectedEarthquake.depthKm < 0 && (
                    <p className="text-[10px] text-amber-800 mt-1 leading-snug">
                      ※ 음수 깊이는 평균 해수면 기준 지표 고도나 관측 모델 추정치와 관련된 원자료 값입니다.
                    </p>
                  )}
              </div>

              <div className="p-4 rounded-[12px] bg-[#f9f9f9] border border-[#edebe9]">
                <span className="text-xs text-[rgba(0,0,0,0.58)] block mb-1">
                  발생 시각 (한국시간 KST 변환)
                </span>
                <span className="font-semibold text-[rgba(0,0,0,0.87)] block text-xs leading-relaxed">
                  {formatToKST(selectedEarthquake.time)}
                </span>
                <span className="text-[11px] text-[rgba(0,0,0,0.58)] block mt-0.5">
                  Asia/Seoul 기준 시간
                </span>
              </div>

              <div className="p-4 rounded-[12px] bg-[#f9f9f9] border border-[#edebe9] flex flex-col justify-between">
                <div>
                  <span className="text-xs text-[rgba(0,0,0,0.58)] block mb-1">
                    발생 좌표
                  </span>
                  <span className="text-xs font-semibold text-[rgba(0,0,0,0.87)] block">
                    위도 {selectedEarthquake.lat.toFixed(3)}°, 경도{' '}
                    {selectedEarthquake.lng.toFixed(3)}°
                  </span>
                </div>
                <div className="mt-2">
                  {selectedEarthquake.url ? (
                    <a
                      href={selectedEarthquake.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-bold text-[#00754A] hover:underline"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      USGS 공식 상세 정보 열기
                    </a>
                  ) : (
                    <span className="text-xs text-[rgba(0,0,0,0.58)] italic">
                      USGS 상세 페이지 링크 없음
                    </span>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 수업 탐구 가이드 (White Cards) */}
        <section aria-label="수업 가이드" className="space-y-4">
          <div className="rounded-[12px] bg-white p-5 sm:p-6 sb-card-shadow border border-[#edebe9] flex items-start gap-4">
            <div className="p-2.5 rounded-full bg-[#d4e9e2] text-[#006241] shrink-0 mt-0.5">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="space-y-1.5 flex-1">
              <h3 className="text-sm sm:text-base font-bold text-[#006241]">
                중학교 과학 수업 탐구: 판의 경계선과 지진 발생 지점의 일치 비교
              </h3>
              <p className="text-xs sm:text-sm text-[rgba(0,0,0,0.87)] leading-relaxed">
                상단의 <strong>‘판 경계 표시 켜기’</strong> 버튼을 눌러보세요.
                붉은색 실선으로 표시되는 <strong>수렴 경계(섭입대/충돌대)</strong> 주변에
                천발·중발·심발 지진이 띠 모양으로 밀집되어 나타나는 것을 직접
                확인할 수 있습니다. 반면 대서양 중앙을 가로지르는 <strong>발산 경계(해령, 청록색 긴 점선)</strong>에서는
                대부분 주황색의 얕은 천발 지진만 발생하는 판 구조론의 핵심 원리를
                학생들과 함께 생생하게 탐구할 수 있습니다.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 rounded-[12px] bg-white sb-card-shadow border border-[#edebe9]">
              <div className="flex items-center gap-2 text-[#006241] font-bold text-xs sm:text-sm mb-1.5">
                <BookOpen className="w-4 h-4 text-[#00754A]" />
                <span>규모(Magnitude) vs 진도(Seismic Intensity)</span>
              </div>
              <p className="text-xs text-[rgba(0,0,0,0.87)] leading-relaxed">
                <strong>규모</strong>는 지진 발생 시 방출되는 절대적인 에너지의
                크기를 나타내는 척도로 단 하나의 고유한 값입니다. 반면{' '}
                <strong>진도</strong>는 진앙으로부터의 거리와 지반 상태에 따라
                사람이 느끼는 흔들림이나 피해 정도를 나타내므로 장소마다 다르게
                측정됩니다.
              </p>
            </div>

            <div className="p-5 rounded-[12px] bg-white sb-card-shadow border border-[#edebe9]">
              <div className="flex items-center gap-2 text-[#006241] font-bold text-xs sm:text-sm mb-1.5">
                <Layers className="w-4 h-4 text-[#00754A]" />
                <span>판 경계 데이터 및 판 구조론 모델 안내</span>
              </div>
              <p className="text-xs text-[rgba(0,0,0,0.87)] leading-relaxed">
                판 경계는 지구 표면의 십여 개 판들의 상대적 운동을 설명하는
                과학적 연구 모델(Peter Bird, 2003)에 기반합니다. 지진은 판의 경계에
                가장 집중되지만 지각 내 응력 축적에 의해 판 내부에서도 발생할 수
                있으며, 과거 데이터에 근거하므로 미래 지진을 확정 예측하지는
                않습니다.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* 4. Starbucks Signature Floating "Frap" Circular Button (56px Green Accent with double shadow stack) */}
      <button
        type="button"
        onClick={handleResetMapView}
        aria-label="지도 초기 위치 복귀 및 중심 이동"
        title="지도 중심을 초기 위치(위도 20, 줌 2)로 복귀"
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-[#00754A] hover:bg-[#006241] text-white flex items-center justify-center sb-frap-shadow sb-btn-active cursor-pointer transition-all duration-200"
      >
        <Navigation className="w-6 h-6 rotate-45" />
      </button>

      {/* 5. 에스프레소 다크 푸터 (House Green #1E3932 with Gold & White Soft text) */}
      <footer className="bg-[#1E3932] text-[rgba(255,255,255,0.70)] py-8 px-4 sm:px-6 text-center text-xs border-t border-[#2b5148] mt-8">
        <div className="max-w-7xl mx-auto space-y-2">
          <p>
            지진 데이터 출처:{' '}
            <a
              href="https://earthquake.usgs.gov/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#cba258] hover:underline font-semibold"
            >
              USGS (U.S. Geological Survey)
            </a>{' '}
            · 판 경계선 출처:{' '}
            <a
              href="https://earthquake.usgs.gov/arcgis/rest/services/eq/map_plateboundaries/MapServer/1"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#cba258] hover:underline font-semibold"
            >
              USGS Tectonic Plate Boundaries
            </a>{' '}
            (원자료: Peter Bird, 2003) · 지도 타일: ©{' '}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white hover:underline"
            >
              OpenStreetMap
            </a>{' '}
            contributors
          </p>
          <p className="text-[rgba(255,255,255,0.50)] text-[11px]">
            ‘지구의 지진 알아보기’ - 중학교 과학 수업용 인터랙티브 정적 웹 애플리케이션
          </p>
        </div>
      </footer>
    </div>
  );
}
