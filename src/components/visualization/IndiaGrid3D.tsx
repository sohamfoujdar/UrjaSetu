import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as topojson from 'topojson-client';
import {
  latLngToSphere,
  latLngToPlanar,
  createCorridorCurve,
  EARTH_RADIUS,
} from '../../utils/geoProjection';
import {
  STATE_TO_REGION_MAP,
  GRID_REGIONS_CONFIG,
  REGIONAL_GRID_NODES,
  TRANSMISSION_CORRIDORS,
} from '../../constants/gridData';
import type { GridNode, GridRegionCode, HoveredEntity } from '../../types/grid';
import { GridControls } from './GridControls';
import { GridLegend } from './GridLegend';
import { GridTooltip } from './GridTooltip';
import { NodeDetailCard } from './NodeDetailCard';
import type { SelectedStateData } from './StateDetailCard';
import { Loader2, AlertCircle } from 'lucide-react';
import { preloadGeoData } from '../../utils/geoCache';

interface GeoFeature {
  type: string;
  properties: {
    name: string;
    shapeName: string;
    shapeISO?: string;
  };
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
}

interface GeoData {
  type: string;
  features: GeoFeature[];
}

type Coordinate2D = [number, number];
type PolygonRings = Coordinate2D[][];

// Edge rounding for identifying shared internal borders vs exterior coastline (4 decimal places ~11m precision)
function getEdgeKey(p1: Coordinate2D, p2: Coordinate2D): string {
  const x1 = Math.round(p1[0] * 10000) / 10000;
  const y1 = Math.round(p1[1] * 10000) / 10000;
  const x2 = Math.round(p2[0] * 10000) / 10000;
  const y2 = Math.round(p2[1] * 10000) / 10000;
  const k1 = `${x1},${y1}`;
  const k2 = `${x2},${y2}`;
  return k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
}

interface IndiaGrid3DProps {
  onStateSelect?: (state: SelectedStateData | null) => void;
  showFLOverlay?: boolean;
  onToggleFLOverlay?: () => void;
}

export const IndiaGrid3D = ({ onStateSelect, showFLOverlay = false, onToggleFLOverlay }: IndiaGrid3DProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // UI state
  const [loading, setLoading] = useState<boolean>(true);
  const [webGLError, setWebGLError] = useState<string | null>(null);
  const [is3D, setIs3D] = useState<boolean>(true);
  const [showCorridors, setShowCorridors] = useState<boolean>(true);
  const [showNodes, setShowNodes] = useState<boolean>(true);
  const [showFLLinks, setShowFLLinks] = useState<boolean>(true);
  const [showHeatmap, setShowHeatmap] = useState<boolean>(true);
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [regionFilter, setRegionFilter] = useState<GridRegionCode | 'ALL'>('ALL');
  const [hoveredEntity, setHoveredEntity] = useState<HoveredEntity | null>(null);
  const [selectedNode, setSelectedNode] = useState<GridNode | null>(null);
  const [cameraPreset, setCameraPreset] = useState<'india' | 'overview'>('india');

  // Use external state if provided, otherwise manage internally for backward compatibility
  const setSelectedState = onStateSelect || (() => {});

  // Track pointer down coordinates to distinguish click vs rotate drag
  const pointerDownPosRef = useRef<{ x: number; y: number } | null>(null);

  // Scene references for interaction and animation
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const geoDataRef = useRef<GeoData | null>(null);
  const worldLandRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const mapGroupRef = useRef<THREE.Group | null>(null);
  const corridorGroupRef = useRef<THREE.Group | null>(null);
  const nodesGroupRef = useRef<THREE.Group | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  // Telemetry flow particles
  const flowParticlesRef = useRef<{ curve: THREE.QuadraticBezierCurve3; mesh: THREE.Mesh; speed: number; offset: number }[]>([]);
  const pulsingRingsRef = useRef<THREE.Mesh[]>([]);
  const stateMeshesRef = useRef<THREE.Mesh[]>([]);
  const nodeMarkersRef = useRef<THREE.Object3D[]>([]);

  // Track reduced motion preference
  const prefersReducedMotion = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  // Dynamic Camera Framing: Computes distance from actual geographic bounds with ~8-12% visual padding
  const setFramedCameraView = useCallback((mode3D: boolean, preset: 'india' | 'overview' = 'india') => {
    if (!cameraRef.current || !controlsRef.current) return;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const container = canvasWrapperRef.current || containerRef.current;
    if (!container) return;

    camera.up.set(0, 1, 0);

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 540;
    const aspect = width / height;

    // Actual geographic bounds of the complete Indian subcontinent (including Ladakh, Arunachal Pradesh,
    // Gujarat, Andaman & Nicobar, and Lakshadweep) on the elevated sphere (elevation = 2.4):
    // minX = -23.334, maxX = +23.263, minY = -26.182, maxY = +26.920, maxZ = 102.40
    const halfSpanX = 23.334;
    const halfSpanY = 26.920;
    const midX = -0.035;
    const midY = 0.369;

    const vFovRad = (camera.fov * Math.PI) / 180;

    if (mode3D) {
      if (preset === 'india') {
        // Center OrbitControls target at subcontinental center
        controls.target.set(midX, midY, 0);

        // Target ~10% visual padding (coverage = 0.80) guaranteeing full visibility of northern Himalayas,
        // northeastern states, southern peninsula, and islands with 8-12% safe padding
        const targetCoverage = 0.80;

        const distY = halfSpanY / (targetCoverage * Math.tan(vFovRad / 2));
        const distX = halfSpanX / (targetCoverage * aspect * Math.tan(vFovRad / 2));
        const distFromSurface = Math.max(distY, distX);
        const rCam = 102.4 + distFromSurface;

        // Position camera facing India centered
        camera.position.set(midX, midY, rCam);

        // Clamped zoom bounds and polar angles:
        // Cannot penetrate Earth surface, cannot zoom out so India disappears, cannot flip upside down
        controls.minDistance = 135;
        controls.maxDistance = 550;
        controls.minPolarAngle = Math.PI * 0.15;
        controls.maxPolarAngle = Math.PI * 0.85;
      } else {
        // Earth Overview preset: pulls back to reveal the full curved Earth globe with India prominently centered
        controls.target.set(0, 0, 0);
        const rOverview = EARTH_RADIUS / (Math.tan(vFovRad / 2) * 0.72);

        camera.position.set(0, 0, rOverview);

        controls.minDistance = 135;
        controls.maxDistance = 600;
        controls.minPolarAngle = Math.PI * 0.12;
        controls.maxPolarAngle = Math.PI * 0.88;
      }
    } else {
      // 2.5D Planar top-down view centered on subcontinental expanse
      controls.target.set(0, 0, 0);

      // Geographic planar half-spans with standard parallel at 22°N
      const planarHalfSpanX = 33.0;
      const planarHalfSpanY = 37.0;
      const targetCoverage = 0.80;

      const distY = planarHalfSpanY / (targetCoverage * Math.tan(vFovRad / 2));
      const distX = planarHalfSpanX / (targetCoverage * aspect * Math.tan(vFovRad / 2));
      const dist = Math.max(distY, distX);

      camera.position.set(0, 0, dist);
      controls.minDistance = 50;
      controls.maxDistance = 280;
      controls.minPolarAngle = 0;
      controls.maxPolarAngle = Math.PI * 0.35;
    }
    controls.update();
  }, []);

  // Re-build map layers with artifact-free clean 3D extrusion
  const rebuildSceneLayers = useCallback(() => {
    if (!sceneRef.current || !geoDataRef.current || !mapGroupRef.current) return;
    const mapGroup = mapGroupRef.current;
    const corridorGroup = corridorGroupRef.current;
    const nodesGroup = nodesGroupRef.current;

    // Clear previous dynamic meshes
    while (mapGroup.children.length > 0) {
      const child = mapGroup.children[0];
      mapGroup.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material?.dispose();
      }
    }
    stateMeshesRef.current = [];

    if (nodesGroup) {
      while (nodesGroup.children.length > 0) {
        const child = nodesGroup.children[0];
        nodesGroup.remove(child);
      }
      pulsingRingsRef.current = [];
      nodeMarkersRef.current = [];
    }

    if (corridorGroup) {
      while (corridorGroup.children.length > 0) {
        const child = corridorGroup.children[0];
        corridorGroup.remove(child);
      }
      flowParticlesRef.current = [];
    }

    const geoData = geoDataRef.current;
    const worldLand = worldLandRef.current;
    const mode3D = is3D;

    // 1. Build Earth / Floor Plate Background
    if (mode3D) {
      // Curved deep midnight ocean Earth sphere
      const sphereGeom = new THREE.SphereGeometry(EARTH_RADIUS, 80, 80);
      const earthMat = new THREE.MeshStandardMaterial({
        color: 0x051325, // Deep oceanic navy
        roughness: 0.65,
        metalness: 0.25,
      });
      const earthMesh = new THREE.Mesh(sphereGeom, earthMat);
      mapGroup.add(earthMesh);

      // Atmospheric Rayleigh scattering outer Fresnel rim (subtle, non-overpowering glow)
      const atmoShader = {
        vertexShader: `
          varying vec3 vNormal;
          varying vec3 vPosition;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            vPosition = mvPosition.xyz;
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        fragmentShader: `
          varying vec3 vNormal;
          varying vec3 vPosition;
          void main() {
            vec3 normal = normalize(vNormal);
            vec3 viewDir = normalize(-vPosition);
            float fresnel = dot(normal, viewDir);
            float intensity = pow(1.0 - max(fresnel, 0.0), 3.6);
            vec3 atmoColor = mix(vec3(0.02, 0.12, 0.36), vec3(0.14, 0.52, 0.85), intensity);
            gl_FragColor = vec4(atmoColor, intensity * 0.38);
          }
        `,
      };
      const atmoMat = new THREE.ShaderMaterial({
        vertexShader: atmoShader.vertexShader,
        fragmentShader: atmoShader.fragmentShader,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
      });
      const atmoMesh = new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS * 1.018, 64, 64), atmoMat);
      mapGroup.add(atmoMesh);

      // Inner atmospheric limb haze on ocean surface
      const innerAtmoShader = {
        vertexShader: `
          varying vec3 vNormal;
          varying vec3 vPosition;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            vPosition = mvPosition.xyz;
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        fragmentShader: `
          varying vec3 vNormal;
          varying vec3 vPosition;
          void main() {
            vec3 normal = normalize(vNormal);
            vec3 viewDir = normalize(-vPosition);
            float fresnel = dot(normal, viewDir);
            float intensity = pow(1.0 - max(fresnel, 0.0), 4.2);
            vec3 glowColor = vec3(0.12, 0.44, 0.78);
            gl_FragColor = vec4(glowColor, intensity * 0.22);
          }
        `,
      };
      const innerAtmoMat = new THREE.ShaderMaterial({
        vertexShader: innerAtmoShader.vertexShader,
        fragmentShader: innerAtmoShader.fragmentShader,
        blending: THREE.AdditiveBlending,
        side: THREE.FrontSide,
        transparent: true,
        depthWrite: false,
      });
      mapGroup.add(new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS * 1.006, 64, 64), innerAtmoMat));

      // Global latitude / longitude graticule circles on ocean
      const graticuleLines = new THREE.Group();
      for (let lat = -60; lat <= 80; lat += 10) {
        const points: THREE.Vector3[] = [];
        for (let lng = -180; lng <= 180; lng += 3) {
          points.push(latLngToSphere(lng, lat, EARTH_RADIUS, 0.05));
        }
        const lineGeom = new THREE.BufferGeometry().setFromPoints(points);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x102845, transparent: true, opacity: 0.45 });
        graticuleLines.add(new THREE.Line(lineGeom, lineMat));
      }
      for (let lng = -180; lng <= 180; lng += 15) {
        const points: THREE.Vector3[] = [];
        for (let lat = -80; lat <= 80; lat += 3) {
          points.push(latLngToSphere(lng, lat, EARTH_RADIUS, 0.05));
        }
        const lineGeom = new THREE.BufferGeometry().setFromPoints(points);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x102845, transparent: true, opacity: 0.30 });
        graticuleLines.add(new THREE.Line(lineGeom, lineMat));
      }
      mapGroup.add(graticuleLines);

      // Render surrounding global continents on Earth surface from worldLand TopoJSON
      if (worldLand && worldLand.features) {
        const worldGroup = new THREE.Group();
        worldLand.features.forEach((feat) => {
          const geom = feat.geometry as GeoJSON.MultiPolygon | GeoJSON.Polygon;
          if (!geom) return;
          const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
          polys.forEach((poly) => {
            const outer = poly[0];
            if (!outer || outer.length < 3) return;
            const pts: THREE.Vector3[] = outer.map(([lng, lat]) =>
              latLngToSphere(lng, lat, EARTH_RADIUS, 0.10)
            );
            const lineGeom = new THREE.BufferGeometry().setFromPoints(pts);
            const lineMat = new THREE.LineBasicMaterial({
              color: 0x163252, // Continental shelf boundary
              transparent: true,
              opacity: 0.40,
            });
            worldGroup.add(new THREE.LineLoop(lineGeom, lineMat));
          });
        });
        mapGroup.add(worldGroup);
      }
    } else {
      // 2.5D Planar dark technical base plate
      const floorGeom = new THREE.PlaneGeometry(140, 130, 32, 32);
      const floorMat = new THREE.MeshStandardMaterial({
        color: 0x061120,
        roughness: 0.9,
        metalness: 0.1,
      });
      const floorMesh = new THREE.Mesh(floorGeom, floorMat);
      mapGroup.add(floorMesh);

      // Planar technical grid wireframe
      const gridHelper = new THREE.GridHelper(140, 28, 0x1C3B61, 0x0E2038);
      gridHelper.rotation.x = Math.PI / 2;
      gridHelper.position.z = 0.02;
      mapGroup.add(gridHelper);
    }

    // 2. Precompute Boundary Edges: Detect exterior edges vs shared internal borders
    // This allows extruding walls ONLY for exterior coastlines/national boundaries,
    // completely eliminating vertical strip artifacts, internal spikes, and cliffs between states!
    const edgeMap = new Map<string, number>();
    geoData.features.forEach((feat) => {
      const geom = feat.geometry;
      const polys: PolygonRings[] =
        geom.type === 'Polygon'
          ? [geom.coordinates as unknown as PolygonRings]
          : (geom.coordinates as unknown as PolygonRings[]);

      polys.forEach((poly) => {
        const ring = poly[0];
        if (!ring || ring.length < 3) return;
        for (let i = 0; i < ring.length - 1; i++) {
          const k = getEdgeKey(ring[i], ring[i + 1]);
          edgeMap.set(k, (edgeMap.get(k) || 0) + 1);
        }
      });
    });

    // Unified clean extrusion elevation:
    // Having a consistent top elevation ensures state tops meet seamlessly without cliffs!
    const baseElevation = mode3D ? 0.6 : 0.2;
    const topElevation = mode3D ? 2.4 : 1.2;

    // 3. Render Each Indian State with Correct Hole-Aware Triangulation
    geoData.features.forEach((feat) => {
      const stateName = feat.properties.name || feat.properties.shapeName || 'State';
      const region = STATE_TO_REGION_MAP[stateName] || 'NR';

      // Check if matches active region filter
      const isRegionActive = regionFilter === 'ALL' || regionFilter === region;
      const opacityMultiplier = isRegionActive ? 1.0 : 0.22;

      // Simulated risk indicators for specific demo testbeds
      const isWarning = stateName === 'Uttar Pradesh';
      const isAlert = stateName === 'Odisha';
      const isSyncing = stateName === 'Karnataka' || stateName === 'Maharashtra';

      // Surface color tokens
      let stateFillColor = 0x0E2A48; // Rich technical deep cyan-navy
      let stateBorderColor = 0x38BDF8; // Electric cyan
      const wallColor = 0x183D68; // Metallic chiseled side wall

      if (isAlert) {
        stateFillColor = 0x361219;
        stateBorderColor = 0xEF4444;
      } else if (isWarning) {
        stateFillColor = 0x2E2009;
        stateBorderColor = 0xF59E0B;
      } else if (isSyncing) {
        stateFillColor = 0x0C2D4F;
        stateBorderColor = 0x38BDF8;
      } else if (region === 'NR') {
        stateFillColor = 0x12365A; // Northern frost tint
        stateBorderColor = 0x7DD3FC;
      } else if (region === 'WR') {
        stateFillColor = 0x0F2E50;
        stateBorderColor = 0x38BDF8;
      } else if (region === 'SR') {
        stateFillColor = 0x112B4C;
        stateBorderColor = 0x818CF8;
      } else if (region === 'ER') {
        stateFillColor = 0x0E2C48;
        stateBorderColor = 0x2DD4BF;
      } else if (region === 'NER') {
        stateFillColor = 0x153556;
        stateBorderColor = 0xF472B6;
      }

      const geom = feat.geometry;
      const polys: PolygonRings[] =
        geom.type === 'Polygon'
          ? [geom.coordinates as unknown as PolygonRings]
          : (geom.coordinates as unknown as PolygonRings[]);

      polys.forEach((poly) => {
        let outerRing: Coordinate2D[] = [...poly[0]];
        // Skip degenerate slivers and micro-specks
        if (!outerRing || outerRing.length < 4) return;

        // Remove closing duplicate point if present so vertex count matches Earcut triangulation
        if (outerRing.length > 1) {
          const first = outerRing[0];
          const last = outerRing[outerRing.length - 1];
          if (first[0] === last[0] && first[1] === last[1]) {
            outerRing.pop();
          }
        }
        if (outerRing.length < 3) return;

        // Clean hole rings
        const holes: Coordinate2D[][] = poly.slice(1);
        const cleanedHoles: Coordinate2D[][] = [];
        holes.forEach((h) => {
          const hClean = [...h];
          if (hClean.length > 1) {
            const first = hClean[0];
            const last = hClean[hClean.length - 1];
            if (first[0] === last[0] && first[1] === last[1]) {
              hClean.pop();
            }
          }
          if (hClean.length >= 3) {
            cleanedHoles.push(hClean);
          }
        });

        // Ensure proper winding order for triangulation:
        // Outer contour MUST be counter-clockwise (CCW); holes MUST be clockwise (CW)
        let contour2D = outerRing.map(pt => new THREE.Vector2(pt[0], pt[1]));
        if (THREE.ShapeUtils.isClockWise(contour2D)) {
          outerRing.reverse();
          contour2D = outerRing.map(pt => new THREE.Vector2(pt[0], pt[1]));
        }

        const holes2D: THREE.Vector2[][] = [];
        const processedHoles: Coordinate2D[][] = [];
        cleanedHoles.forEach((h) => {
          let h2d = h.map(pt => new THREE.Vector2(pt[0], pt[1]));
          let hCoords = [...h];
          if (!THREE.ShapeUtils.isClockWise(h2d)) {
            hCoords.reverse();
            h2d = hCoords.map(pt => new THREE.Vector2(pt[0], pt[1]));
          }
          holes2D.push(h2d);
          processedHoles.push(hCoords);
        });

        // Safe triangulation handling holes with exact 1:1 vertex index mapping
        const triangleIndices = THREE.ShapeUtils.triangulateShape(contour2D, holes2D);

        // Build vertex position buffer in exact sequential order matching Earcut indices
        const allVertexPoints: Coordinate2D[] = [...outerRing];
        processedHoles.forEach((h) => {
          allVertexPoints.push(...h);
        });

        const positions: number[] = [];
        const positions3D: THREE.Vector3[] = [];
        allVertexPoints.forEach(([lng, lat]) => {
          const pt = mode3D
            ? latLngToSphere(lng, lat, EARTH_RADIUS, topElevation)
            : latLngToPlanar(lng, lat, 2.5, topElevation);
          positions.push(pt.x, pt.y, pt.z);
          positions3D.push(pt);
        });

        // A. Top polygon surface mesh
        if (triangleIndices && triangleIndices.length > 0) {
          const flatIndices: number[] = [];
          for (let [i0, i1, i2] of triangleIndices) {
            const p0 = positions3D[i0];
            const p1 = positions3D[i1];
            const p2 = positions3D[i2];
            if (!p0 || !p1 || !p2) continue;

            const vA = new THREE.Vector3().subVectors(p1, p0);
            const vB = new THREE.Vector3().subVectors(p2, p0);
            const normal = new THREE.Vector3().crossVectors(vA, vB);

            // Discard zero-area degenerate slivers that corrupt vertex normals
            if (normal.lengthSq() < 1e-10) continue;

            // In 3D spherical mode, ensure the face normal points outward from the globe
            if (mode3D) {
              const outward = p0.clone().normalize();
              if (normal.dot(outward) < 0) {
                // Invert face winding to guarantee outward-facing normal
                const tmp = i1; i1 = i2; i2 = tmp;
              }
            }

            flatIndices.push(i0, i1, i2);
          }

          if (flatIndices.length > 0) {
            const topGeom = new THREE.BufferGeometry();
            topGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            topGeom.setIndex(flatIndices);
            topGeom.computeVertexNormals();

            const topMat = new THREE.MeshStandardMaterial({
              color: stateFillColor,
              roughness: 0.45,
              metalness: 0.35,
              transparent: true,
              opacity: 0.98 * opacityMultiplier,
              side: THREE.DoubleSide,
            });

            const stateMesh = new THREE.Mesh(topGeom, topMat);
            stateMesh.userData = {
              isState: true,
              stateName,
              region,
              status: isAlert ? 'alert' : isWarning ? 'warning' : isSyncing ? 'syncing' : 'optimal',
            };
            mapGroup.add(stateMesh);
            stateMeshesRef.current.push(stateMesh);
          }
        }

        // B. Extruded side walls:
        // ONLY extrude walls for exterior boundary edges (coastline / national border)!
        // This eliminates vertical strip artifacts, internal spikes, and cliffs between states!
        const wallPositions: number[] = [];
        const numPts = outerRing.length;
        for (let i = 0; i < numPts; i++) {
          const p1 = outerRing[i];
          const p2 = outerRing[(i + 1) % numPts];
          const k = getEdgeKey(p1, p2);

          // Only extrude if this is an exterior edge (appears once in the entire dataset)
          if (edgeMap.get(k) === 1) {
            const b1 = mode3D ? latLngToSphere(p1[0], p1[1], EARTH_RADIUS, baseElevation) : latLngToPlanar(p1[0], p1[1], 2.5, baseElevation);
            const b2 = mode3D ? latLngToSphere(p2[0], p2[1], EARTH_RADIUS, baseElevation) : latLngToPlanar(p2[0], p2[1], 2.5, baseElevation);
            const t1 = mode3D ? latLngToSphere(p1[0], p1[1], EARTH_RADIUS, topElevation) : latLngToPlanar(p1[0], p1[1], 2.5, topElevation);
            const t2 = mode3D ? latLngToSphere(p2[0], p2[1], EARTH_RADIUS, topElevation) : latLngToPlanar(p2[0], p2[1], 2.5, topElevation);

            // Clean quad with outward-facing normals (b1 -> t1 -> t2 and b1 -> t2 -> b2):
            wallPositions.push(
              b1.x, b1.y, b1.z,  t1.x, t1.y, t1.z,  t2.x, t2.y, t2.z,
              b1.x, b1.y, b1.z,  t2.x, t2.y, t2.z,  b2.x, b2.y, b2.z
            );
          }
        }

        if (wallPositions.length > 0) {
          const wallGeom = new THREE.BufferGeometry();
          wallGeom.setAttribute('position', new THREE.Float32BufferAttribute(wallPositions, 3));
          wallGeom.computeVertexNormals();

          const wallMat = new THREE.MeshStandardMaterial({
            color: wallColor,
            roughness: 0.60,
            metalness: 0.35,
            transparent: true,
            opacity: 0.95 * opacityMultiplier,
            side: THREE.DoubleSide,
          });
          mapGroup.add(new THREE.Mesh(wallGeom, wallMat));
        }

        // C. Illuminated boundary line loop for outer contour
        const ringPositions: THREE.Vector3[] = outerRing.map(([lng, lat]) =>
          mode3D ? latLngToSphere(lng, lat, EARTH_RADIUS, topElevation + 0.04) : latLngToPlanar(lng, lat, 2.5, topElevation + 0.04)
        );
        const borderGeom = new THREE.BufferGeometry().setFromPoints(ringPositions);
        const borderMat = new THREE.LineBasicMaterial({
          color: stateBorderColor,
          transparent: true,
          opacity: (isAlert || isWarning ? 0.95 : 0.85) * opacityMultiplier,
          linewidth: 1.5,
        });
        mapGroup.add(new THREE.LineLoop(borderGeom, borderMat));

        // D. Also outline holes (enclaves) cleanly
        processedHoles.forEach((hole) => {
          const holePts: THREE.Vector3[] = hole.map(([lng, lat]) =>
            mode3D ? latLngToSphere(lng, lat, EARTH_RADIUS, topElevation + 0.04) : latLngToPlanar(lng, lat, 2.5, topElevation + 0.04)
          );
          const holeBorderGeom = new THREE.BufferGeometry().setFromPoints(holePts);
          const holeBorderMat = new THREE.LineBasicMaterial({
            color: stateBorderColor,
            transparent: true,
            opacity: 0.70 * opacityMultiplier,
          });
          mapGroup.add(new THREE.LineLoop(holeBorderGeom, holeBorderMat));
        });
      });
    });

    // 4. Render Regional Nodes: Refined, Compact, Restrained Markers
    // Keeps markers visible without blocking states or covering city boundaries
    if (nodesGroup) {
      REGIONAL_GRID_NODES.forEach((node) => {
        const isNodeActive = regionFilter === 'ALL' || regionFilter === node.region;
        const opacity = isNodeActive ? 1.0 : 0.25;

        const alt = topElevation + 0.35;

        const nodePos = mode3D
          ? latLngToSphere(node.lng, node.lat, EARTH_RADIUS, alt)
          : latLngToPlanar(node.lng, node.lat, 2.5, alt);

        const nodeObj = new THREE.Group();
        nodeObj.position.copy(nodePos);

        // Align node orientation to surface normal
        const normal = mode3D ? nodePos.clone().normalize() : new THREE.Vector3(0, 0, 1);
        nodeObj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);

        // Color mapping
        const nodeColor =
          node.simulatedRisk === 'alert'
            ? 0xEF4444
            : node.simulatedRisk === 'warning'
            ? 0xF59E0B
            : node.simulatedRisk === 'syncing'
            ? 0x38BDF8
            : 0xB8FF65;

        // Elegant, compact center beacon pin (refined radius prevents border occlusion)
        const beaconRadius = node.type === 'regional-hub' ? 0.20 : 0.14;
        const beaconGeom = new THREE.OctahedronGeometry(beaconRadius);
        const beaconMat = new THREE.MeshStandardMaterial({
          color: nodeColor,
          emissive: nodeColor,
          emissiveIntensity: 0.60,
          roughness: 0.20,
          metalness: 0.80,
          transparent: true,
          opacity,
        });
        const beaconMesh = new THREE.Mesh(beaconGeom, beaconMat);
        beaconMesh.position.z = 0.22;
        nodeObj.add(beaconMesh);

        // Subtle pulsing radar ring
        const ringGeom = new THREE.RingGeometry(0.22, 0.34, 24);
        const ringMat = new THREE.MeshBasicMaterial({
          color: nodeColor,
          transparent: true,
          opacity: 0.50 * opacity,
          side: THREE.DoubleSide,
        });
        const ringMesh = new THREE.Mesh(ringGeom, ringMat);
        ringMesh.position.z = 0.05;
        nodeObj.add(ringMesh);
        pulsingRingsRef.current.push(ringMesh);

        // Restrained, thin needle beam
        const pillarGeom = new THREE.CylinderGeometry(0.012, 0.03, 0.40, 8);
        const pillarMat = new THREE.MeshBasicMaterial({
          color: nodeColor,
          transparent: true,
          opacity: 0.25 * opacity,
        });
        const pillarMesh = new THREE.Mesh(pillarGeom, pillarMat);
        pillarMesh.rotation.x = Math.PI / 2;
        pillarMesh.position.z = 0.25;
        nodeObj.add(pillarMesh);

        // Attach node metadata for raycasting
        beaconMesh.userData = { isNode: true, node };
        ringMesh.userData = { isNode: true, node };

        nodesGroup.add(nodeObj);
        nodeMarkersRef.current.push(beaconMesh);
      });
    }

    // 5. Render 3D High-Voltage Transmission Arcs: Subtle, Refined Flow Arcs
    if (corridorGroup && showCorridors) {
      const nodeMap = new Map(REGIONAL_GRID_NODES.map(n => [n.id, n]));

      TRANSMISSION_CORRIDORS.forEach((corr, idx) => {
        const fromNode = nodeMap.get(corr.fromNodeId);
        const toNode = nodeMap.get(corr.toNodeId);
        if (!fromNode || !toNode) return;

        const isCorrActive =
          regionFilter === 'ALL' ||
          regionFilter === fromNode.region ||
          regionFilter === toNode.region;

        const opacity = isCorrActive ? 1.0 : 0.20;

        const p1 = mode3D
          ? latLngToSphere(fromNode.lng, fromNode.lat, EARTH_RADIUS, topElevation + 0.45)
          : latLngToPlanar(fromNode.lng, fromNode.lat, 2.5, topElevation + 0.45);

        const p2 = mode3D
          ? latLngToSphere(toNode.lng, toNode.lat, EARTH_RADIUS, topElevation + 0.45)
          : latLngToPlanar(toNode.lng, toNode.lat, 2.5, topElevation + 0.45);

        // Controlled, subtle arc height
        const curve = createCorridorCurve(p1, p2, mode3D ? 3.0 : 2.2);
        const curvePoints = curve.getPoints(40);

        const arcGeom = new THREE.BufferGeometry().setFromPoints(curvePoints);
        const corrColor =
          corr.voltageKV === 765
            ? 0x38BDF8 // Vivid cyan for 765kV
            : corr.voltageKV === 800
            ? 0xB8FF65 // Electric lime for HVDC 800kV
            : 0x818CF8; // Blue-indigo for 400kV

        const arcMat = new THREE.LineBasicMaterial({
          color: corrColor,
          transparent: true,
          opacity: 0.42 * opacity,
          linewidth: 1.2,
        });
        corridorGroup.add(new THREE.Line(arcGeom, arcMat));

        // Refined tiny telemetry packet flow particle
        const particleGeom = new THREE.SphereGeometry(0.12, 8, 8);
        const particleMat = new THREE.MeshBasicMaterial({
          color: corrColor,
          transparent: true,
          opacity: 0.85 * opacity,
        });
        const particleMesh = new THREE.Mesh(particleGeom, particleMat);
        corridorGroup.add(particleMesh);

        flowParticlesRef.current.push({
          curve,
          mesh: particleMesh,
          speed: 0.20 + (idx % 4) * 0.05,
          offset: (idx * 0.17) % 1.0,
        });
      });
    }
  }, [is3D, regionFilter, showCorridors]);

  // Initialize Three.js Scene, Lighting, Camera, and Canvas
  useEffect(() => {
    const canvasWrapper = canvasWrapperRef.current || containerRef.current;
    const canvas = canvasRef.current;
    if (!canvasWrapper || !canvas) return;

    const width = canvasWrapper.clientWidth || 800;
    const height = canvasWrapper.clientHeight || 540;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setTimeout(() => {
        setWebGLError('Unable to initialize WebGL context. Please verify hardware acceleration.');
        setLoading(false);
      }, 0);
      return;
    }

    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 1000);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.65;
    controls.zoomSpeed = 0.85;
    controls.panSpeed = 0.6;
    controls.enablePan = true;
    controlsRef.current = controls;

    // Apply exact bounding-box-calculated camera framing
    setFramedCameraView(is3D, cameraPreset);

    // Realistic Cinematic Lighting Setup
    // 1. Ambient navy fill to illuminate shadows cleanly
    const ambientLight = new THREE.AmbientLight(0x1E334D, 1.8);
    scene.add(ambientLight);

    // 2. Primary directional sunlight positioned from North-West across the Himalayas
    const sunLight = new THREE.DirectionalLight(0xF2F8FF, 2.8);
    sunLight.position.set(-70, 95, 80);
    scene.add(sunLight);

    // 3. Cyan rim light from the South-East over the Bay of Bengal catching coastlines & extruded edges
    const rimLight = new THREE.DirectionalLight(0x38BDF8, 1.5);
    rimLight.position.set(90, -50, 45);
    scene.add(rimLight);

    // 4. Soft blue fill light from the South-West over the Indian Ocean
    const oceanFill = new THREE.DirectionalLight(0x1E40AF, 0.9);
    oceanFill.position.set(-40, -70, 30);
    scene.add(oceanFill);

    // 5. Localized PointLight beacon illumination at the 5 regional load despatch centers
    const delPoint = new THREE.PointLight(0xB8FF65, 1.2, 28);
    delPoint.position.set(0, 12, 104);
    scene.add(delPoint);

    const mumPoint = new THREE.PointLight(0x38BDF8, 1.0, 26);
    mumPoint.position.set(-16, -6, 103);
    scene.add(mumPoint);

    const blrPoint = new THREE.PointLight(0x818CF8, 1.0, 26);
    blrPoint.position.set(-8, -18, 103);
    scene.add(blrPoint);

    const kolPoint = new THREE.PointLight(0x2DD4BF, 1.0, 26);
    kolPoint.position.set(12, 0, 103);
    scene.add(kolPoint);

    // Cosmic background starfield
    const starGeom = new THREE.BufferGeometry();
    const starCount = 1100;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i += 3) {
      starPositions[i] = (Math.random() - 0.5) * 550;
      starPositions[i + 1] = (Math.random() - 0.5) * 550;
      starPositions[i + 2] = -140 - Math.random() * 220;
    }
    starGeom.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0x94A3B8,
      size: 0.95,
      transparent: true,
      opacity: 0.55,
    });
    scene.add(new THREE.Points(starGeom, starMat));

    // Groups
    const mapGroup = new THREE.Group();
    mapGroupRef.current = mapGroup;
    scene.add(mapGroup);

    const corridorGroup = new THREE.Group();
    corridorGroupRef.current = corridorGroup;
    scene.add(corridorGroup);

    const nodesGroup = new THREE.Group();
    nodesGroupRef.current = nodesGroup;
    scene.add(nodesGroup);

    // ResizeObserver: Dynamically re-adjusts aspect ratio & camera framing on any viewport resize
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: newWidth, height: newHeight } = entry.contentRect;
        if (newWidth > 0 && newHeight > 0) {
          camera.aspect = newWidth / newHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(newWidth, newHeight);
          setFramedCameraView(is3D, cameraPreset);
        }
      }
    });
    resizeObserver.observe(canvasWrapper);

    // Fetch GeoJSON geographic boundaries (Election Commission / DataMeet ADM1) & World Land TopoJSON
    preloadGeoData()
      .then(([indiaData, worldData]) => {
        if (!indiaData) {
          throw new Error('No India geo boundary data available');
        }
        geoDataRef.current = indiaData as GeoData;
        if (worldData && worldData.objects && worldData.objects.land) {
          const landFeatures = topojson.feature(
            worldData,
            worldData.objects.land
          ) as unknown as GeoJSON.FeatureCollection;
          worldLandRef.current = landFeatures;
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error loading geojson:', err);
        setWebGLError('Failed to load India boundary geometries.');
        setLoading(false);
      });

    // Animation Loop
    const startTime = performance.now();
    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);

      const elapsedTime = (performance.now() - startTime) / 1000;
      controls.update();

      // Toggle layer group visibility each frame (cheap .visible flag)
      if (nodesGroupRef.current) nodesGroupRef.current.visible = showNodes;
      if (corridorGroupRef.current) corridorGroupRef.current.visible = showCorridors || showFLLinks;

      // Animate pulsing radar rings on regional nodes
      if (!prefersReducedMotion) {
        const pulseScale = 1.0 + 0.28 * Math.sin(elapsedTime * 2.8);
        pulsingRingsRef.current.forEach((ring) => {
          ring.scale.set(pulseScale, pulseScale, 1.0);
        });

        // Animate telemetry flow particles along transmission corridors
        flowParticlesRef.current.forEach((item) => {
          item.mesh.visible = showFLLinks;
          if (showFLLinks) {
            const t = (elapsedTime * item.speed + item.offset) % 1.0;
            const pos = item.curve.getPoint(t);
            item.mesh.position.copy(pos);
          }
        });
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      resizeObserver.disconnect();
      renderer.dispose();
    };
  }, [setFramedCameraView, prefersReducedMotion, is3D, cameraPreset]);

  // Re-build layers whenever geoData finishes loading or is3D / filter toggles
  useEffect(() => {
    if (!loading && geoDataRef.current) {
      rebuildSceneLayers();
      setFramedCameraView(is3D, cameraPreset);
    }
  }, [loading, rebuildSceneLayers, setFramedCameraView, is3D, cameraPreset]);

  // Raycasting for Mouse Hover & Selection
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const camera = cameraRef.current;
    if (!canvas || !camera) return;

    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

    // 1. First test intersection with regional nodes
    const nodeHits = raycaster.intersectObjects(nodeMarkersRef.current, true);
    if (nodeHits.length > 0) {
      const hit = nodeHits[0];
      const nodeData = hit.object.userData.node as GridNode;
      if (nodeData) {
        setHoveredEntity({
          type: 'node',
          id: nodeData.id,
          title: nodeData.name,
          subtitle: `${nodeData.code} • ${nodeData.regionName}`,
          region: nodeData.region,
          status: nodeData.simulatedRisk,
          metrics: [
            { label: 'Voltage', value: `${nodeData.voltageKV} kV` },
            { label: 'Simulated Load', value: `${nodeData.simulatedLoadGW} GW` },
            { label: 'Edge Clients', value: `${nodeData.activeDiscoms} DISCOMs` },
            { label: 'DP Budget', value: `ε = ${nodeData.dpEpsilon.toFixed(2)}` },
          ],
          x: e.clientX,
          y: e.clientY,
        });
        canvas.style.cursor = 'pointer';
        return;
      }
    }

    // 2. Test intersection with state polygons
    const stateHits = raycaster.intersectObjects(stateMeshesRef.current, false);
    if (stateHits.length > 0) {
      const hit = stateHits[0];
      const { stateName, region, status } = hit.object.userData;
      if (stateName) {
        setHoveredEntity({
          type: 'state',
          id: stateName,
          title: stateName,
          subtitle: `${GRID_REGIONS_CONFIG[region as GridRegionCode]?.name || 'State'} Boundary`,
          region: region as GridRegionCode,
          status: status || 'optimal',
          metrics: [
            { label: 'Grid Region', value: region },
            { label: 'Telemetry Stream', value: status === 'alert' ? 'SIMULATED OUTAGE' : 'STABLE' },
            { label: 'DP Guarantee', value: 'Active (ε ≤ 1.3)' },
          ],
          x: e.clientX,
          y: e.clientY,
        });
        canvas.style.cursor = 'pointer';
        return;
      }
    }

    setHoveredEntity(null);
    canvas.style.cursor = 'default';
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointerDownPosRef.current) return;
    const dist = Math.hypot(e.clientX - pointerDownPosRef.current.x, e.clientY - pointerDownPosRef.current.y);
    pointerDownPosRef.current = null;

    // Distinguish click from rotate drag: if dragged more than 5px, it was a globe rotation gesture
    if (dist > 5) return;

    // Genuine click event: perform raycasting
    const canvas = canvasRef.current;
    const camera = cameraRef.current;
    if (!canvas || !camera) return;

    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

    // 1. Check regional node clicks
    const nodeHits = raycaster.intersectObjects(nodeMarkersRef.current, true);
    if (nodeHits.length > 0) {
      const nodeData = nodeHits[0].object.userData.node as GridNode;
      if (nodeData) {
        setSelectedNode(nodeData);
        setSelectedState(null);
        return;
      }
    }

    // 2. Check state polygon clicks: open dedicated state inspector card
    const stateHits = raycaster.intersectObjects(stateMeshesRef.current, false);
    if (stateHits.length > 0) {
      const hit = stateHits[0];
      const { stateName, region, status } = hit.object.userData;
      if (stateName && region) {
        setSelectedState({
          name: stateName,
          region: region as GridRegionCode,
          status: status || 'optimal',
        });
        setSelectedNode(null);
        return;
      }
    }

    // Clicked background or ocean: dismiss inspectors
    setSelectedNode(null);
    setSelectedState(null);
  };

  const handleResetCamera = () => {
    setCameraPreset('india');
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0);
    }
    setFramedCameraView(is3D, 'india');
  };

  const handleTogglePreset = () => {
    const next = cameraPreset === 'india' ? 'overview' : 'india';
    setCameraPreset(next);
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0);
    }
    setFramedCameraView(is3D, next);
  };

  const handleZoom = (delta: number) => {
    if (!cameraRef.current || !controlsRef.current) return;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const dir = new THREE.Vector3().subVectors(controls.target, camera.position);
    const currentDist = dir.length();
    const newDist = THREE.MathUtils.clamp(currentDist - delta, controls.minDistance, controls.maxDistance);
    dir.normalize();
    camera.position.copy(controls.target).addScaledVector(dir, -newDist);
    controls.update();
  };

  const handleToggle3D = () => {
    const nextMode = !is3D;
    setIs3D(nextMode);
    setFramedCameraView(nextMode, cameraPreset);
  };

  return (
    <div
      ref={containerRef}
      className="relative flex-1 min-h-[480px] lg:min-h-[550px] rounded-lg border border-[#14263D] bg-[#050C16] overflow-hidden flex flex-col justify-between group shadow-2xl select-none"
    >
      {/* Top HUD Telemetry Bar */}
      <div className="relative z-10 flex items-center justify-between p-3.5 border-b border-[#14243A]/90 bg-[#060E1A]/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-[#0A1828] border border-[#1A3350]">
            <span className="w-2 h-2 rounded-full bg-[#B8FF65] animate-pulse" />
            <span className="text-[11px] font-mono font-medium text-slate-200">
              NATIONAL GRID 3D INTEL
            </span>
          </div>
          <span className="text-[11px] font-mono text-slate-400 hidden sm:inline">
            SYNCHRONOUS SUB-CONTINENTAL MESH • WGS84 REAL BOUNDARIES
          </span>
        </div>

        <div className="flex items-center gap-2 font-mono text-[10px] text-slate-400">
          <span className="px-2 py-0.5 rounded bg-[#0A1626] border border-[#182F4B] text-[#38BDF8]">
            {is3D ? `PROJECTION: CURVED SPHERICAL [${cameraPreset.toUpperCase()}]` : 'PROJECTION: 2.5D PLANAR'}
          </span>
          <span className="hidden md:inline text-slate-500">
            DATA: DATAMEET / GEOBOUNDARIES ADM1
          </span>
        </div>
      </div>

      {/* 3D WebGL Canvas Layer */}
      <div ref={canvasWrapperRef} className="relative flex-1 w-full h-full min-h-[420px]">
        {/* Loading Indicator */}
        {loading && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#050B14]/85 backdrop-blur-sm text-slate-300 font-mono text-xs space-y-2">
            <Loader2 className="w-6 h-6 text-[#B8FF65] animate-spin" />
            <span>INITIALIZING 3D GEOMETRY • ELEVATING ADM1 BOUNDARIES...</span>
            <span className="text-[10px] text-slate-500">[DATAMEET / SURVEY OF INDIA ALIGNED]</span>
          </div>
        )}

        {/* WebGL Error fallback */}
        {webGLError && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-6 bg-[#050B14]/90 text-center font-mono text-xs space-y-2">
            <AlertCircle className="w-8 h-8 text-[#EF4444]" />
            <span className="text-white font-bold">3D Rendering Pipeline Unavailable</span>
            <p className="text-slate-400 max-w-md">{webGLError}</p>
          </div>
        )}

        {/* Floating Interaction Hint */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-[#07111F]/85 backdrop-blur-md border border-[#14263D]/80 text-[10px] font-mono text-slate-400 pointer-events-none select-none shadow-lg">
          <span className="w-1.5 h-1.5 rounded-full bg-[#38BDF8] animate-pulse" />
          <span>Drag to rotate · Scroll to zoom · Select a region to inspect</span>
        </div>

        <canvas
          ref={canvasRef}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoveredEntity(null)}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          style={{ touchAction: 'none' }}
          className="absolute inset-0 w-full h-full block focus:outline-none"
        />

        {/* Interactive Controls Overlay */}
        <GridControls
          is3D={is3D}
          onToggle3D={handleToggle3D}
          showCorridors={showCorridors}
          onToggleCorridors={() => setShowCorridors(!showCorridors)}
          showNodes={showNodes}
          onToggleNodes={() => setShowNodes(!showNodes)}
          showFLLinks={showFLLinks}
          onToggleFLLinks={() => setShowFLLinks(!showFLLinks)}
          showHeatmap={showHeatmap}
          onToggleHeatmap={() => setShowHeatmap(!showHeatmap)}
          showLabels={showLabels}
          onToggleLabels={() => setShowLabels(!showLabels)}
          showFLOverlay={showFLOverlay}
          onToggleFLOverlay={onToggleFLOverlay}
          selectedRegionFilter={regionFilter}
          onSelectRegionFilter={setRegionFilter}
          onResetView={handleResetCamera}
          onZoomIn={() => handleZoom(14)}
          onZoomOut={() => handleZoom(-14)}
          cameraPreset={cameraPreset}
          onTogglePreset={handleTogglePreset}
        />

        {/* Compact Legend (hidden when node inspector card is open to prevent overlap) */}
        {!selectedNode && <GridLegend />}

        {/* Mouse Hover Tooltip */}
        <GridTooltip hovered={hoveredEntity} />

        {/* Selected Node Inspector Flyout */}
        <NodeDetailCard node={selectedNode} onClose={() => setSelectedNode(null)} />
      </div>

      {/* Bottom Status / Citation Footer inside canvas frame */}
      <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-2 p-2.5 px-4 border-t border-[#14243A]/90 bg-[#060E1A]/85 backdrop-blur-md font-mono text-[10px] text-slate-400">
        <div className="flex items-center gap-3">
          <span className="text-slate-300 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#B8FF65]" />
            18 SYNCHRONOUS NODES ACTIVE
          </span>
          <span>•</span>
          <span className="text-[#38BDF8]">
            16 INTER-REGIONAL 765kV / HVDC CORRIDORS
          </span>
        </div>

        <div className="text-slate-500 text-[9px] flex items-center gap-2">
          <span>BOUNDARIES: CC BY 2.5 IN (DATAMEET / ECI)</span>
          <span>•</span>
          <span className="text-slate-400">SIMULATED BENCHMARK DATA</span>
        </div>
      </div>

      {/* Aerospace corner brackets */}
      <div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-[#1E3B60] pointer-events-none" />
      <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-[#1E3B60] pointer-events-none" />
      <div className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-[#1E3B60] pointer-events-none" />
      <div className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-[#1E3B60] pointer-events-none" />
    </div>
  );
};
