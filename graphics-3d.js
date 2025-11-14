/**
 * Three.js 3D Graphics Module
 * @module graphics-3d
 *
 * Provides 3D visualization for facial measurements using Three.js.
 *
 * Features:
 * - 3D head mesh from MediaPipe landmarks
 * - Interactive camera controls (orbit, zoom, pan)
 * - Real-time landmark visualization
 * - 3D measurement overlays
 * - Configurable lighting and materials
 */

import * as THREE from 'three';
import { THREEJS_CONFIG, COLOR_CONFIG } from './config.js';
import { FACE_MESH_TRIANGLES } from './face-mesh-triangles.js';

// ============================================================================
// LANDMARK MESH GENERATION
// ============================================================================

/**
 * Create a 3D head mesh from MediaPipe face landmarks
 * @param {Array} landmarks - MediaPipe normalized face landmarks
 * @param {number} canvasWidth - Canvas width for denormalization
 * @param {number} canvasHeight - Canvas height for denormalization
 * @returns {THREE.Mesh} 3D head mesh
 */
function createHeadMesh(landmarks, canvasWidth, canvasHeight) {
  const geometry = new THREE.BufferGeometry();

  // Convert normalized landmarks to 3D positions
  const positions = [];

  // Map directly to canvas pixel coordinates for overlay
  // MediaPipe: x(0-1) left-to-right, y(0-1) top-to-bottom, z(depth around 0)
  // Three.js: match canvas coordinates exactly
  for (const landmark of landmarks) {
    const x = landmark.x * canvasWidth;
    const y = landmark.y * canvasHeight;
    const z = -landmark.z * canvasWidth; // Negative Z so face points toward camera, scale by width for consistent depth

    positions.push(x, y, z);
  }

  // Create triangulated face mesh
  const indices = [];
  for (const triangle of FACE_MESH_TRIANGLES) {
    indices.push(triangle[0], triangle[1], triangle[2]);
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const config = THREEJS_CONFIG.headModel;
  const material = new THREE.MeshPhongMaterial({
    color: config.color,
    emissive: config.emissive,
    emissiveIntensity: config.emissiveIntensity,
    shininess: config.shininess,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: config.opacity,
    wireframe: config.wireframe,
  });

  const mesh = new THREE.Mesh(geometry, material);
  return mesh;
}

/**
 * Create landmark points visualization
 * @param {Array} landmarks - MediaPipe normalized face landmarks
 * @returns {THREE.Points} Landmark points object
 */
function createLandmarkPoints(landmarks, canvasWidth, canvasHeight) {
  const geometry = new THREE.BufferGeometry();
  const positions = [];

  // Use same coordinate mapping as mesh
  for (const landmark of landmarks) {
    const x = landmark.x * canvasWidth;
    const y = landmark.y * canvasHeight;
    const z = -landmark.z * canvasWidth;
    positions.push(x, y, z);
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

  const config = THREEJS_CONFIG.landmarks;
  const material = new THREE.PointsMaterial({
    size: config.size,
    color: config.color,
    transparent: true,
    opacity: config.opacity,
    sizeAttenuation: true,
  });

  return new THREE.Points(geometry, material);
}

// ============================================================================
// GRAPHICS 3D FACTORY
// ============================================================================

/**
 * Create a Three.js 3D renderer instance
 * @param {HTMLCanvasElement} canvasElement - Canvas DOM element
 * @returns {Object} Graphics 3D renderer with public methods
 */
export function createGraphics3D(canvasElement) {
  // Three.js core components
  const scene = new THREE.Scene();

  // Use orthographic camera for exact pixel-to-pixel overlay matching
  // This creates a 2D-like projection that maps directly to canvas coordinates
  const camera = new THREE.OrthographicCamera(
    0,                          // left
    canvasElement.width,        // right
    0,                          // top
    canvasElement.height,       // bottom
    -2000,                      // near (enough depth for face Z-coordinates)
    2000                        // far
  );

  const renderer = new THREE.WebGLRenderer({
    canvas: canvasElement,
    antialias: true,
    alpha: true,
  });

  renderer.setSize(canvasElement.width, canvasElement.height);
  renderer.setPixelRatio(window.devicePixelRatio);

  // Scene setup - transparent background for overlay
  const bgConfig = THREEJS_CONFIG.scene;
  if (bgConfig.background === null || bgConfig.background === 'transparent') {
    scene.background = null; // Transparent
  } else {
    scene.background = new THREE.Color(bgConfig.background);
  }

  // No fog for overlay mode
  // Camera positioned to look at the canvas plane
  const cameraDefaultDistance = 1000;
  let currentCanvasWidth = Math.max(
    1,
    canvasElement.width || canvasElement.clientWidth || 1280
  );
  let currentCanvasHeight = Math.max(
    1,
    canvasElement.height || canvasElement.clientHeight || 720
  );

  function alignCameraToCanvas(width, height) {
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    currentCanvasWidth = safeWidth;
    currentCanvasHeight = safeHeight;
    camera.left = 0;
    camera.right = safeWidth;
    camera.top = 0;
    camera.bottom = safeHeight;
    camera.position.set(safeWidth / 2, safeHeight / 2, cameraDefaultDistance);
    camera.lookAt(safeWidth / 2, safeHeight / 2, 0);
    camera.updateProjectionMatrix();
  }

  alignCameraToCanvas(currentCanvasWidth, currentCanvasHeight);

  // No orbit controls - mesh follows face motion automatically
  const controls = null;

  // Lighting setup
  const lights = [];

  if (THREEJS_CONFIG.lights.ambient.enabled) {
    const ambient = new THREE.AmbientLight(
      THREEJS_CONFIG.lights.ambient.color,
      THREEJS_CONFIG.lights.ambient.intensity
    );
    scene.add(ambient);
    lights.push(ambient);
  }

  if (THREEJS_CONFIG.lights.directional.enabled) {
    const directional = new THREE.DirectionalLight(
      THREEJS_CONFIG.lights.directional.color,
      THREEJS_CONFIG.lights.directional.intensity
    );
    const pos = THREEJS_CONFIG.lights.directional.position;
    directional.position.set(pos.x, pos.y, pos.z);
    scene.add(directional);
    lights.push(directional);
  }

  if (THREEJS_CONFIG.lights.point.enabled) {
    const point = new THREE.PointLight(
      THREEJS_CONFIG.lights.point.color,
      THREEJS_CONFIG.lights.point.intensity
    );
    const pos = THREEJS_CONFIG.lights.point.position;
    point.position.set(pos.x, pos.y, pos.z);
    scene.add(point);
    lights.push(point);
  }

  // Grid helper
  if (THREEJS_CONFIG.grid.enabled) {
    const gridHelper = new THREE.GridHelper(
      THREEJS_CONFIG.grid.size,
      THREEJS_CONFIG.grid.divisions,
      THREEJS_CONFIG.grid.colorCenterLine,
      THREEJS_CONFIG.grid.colorGrid
    );
    scene.add(gridHelper);
  }

  // Axes helper
  if (THREEJS_CONFIG.axes.enabled) {
    const axesHelper = new THREE.AxesHelper(THREEJS_CONFIG.axes.size);
    scene.add(axesHelper);
  }

  // Scene objects
  let headMesh = null;
  let landmarkPoints = null;

  // User settings (persist across mesh updates)
  const userSettings = {
    wireframe: false,
    opacity: THREEJS_CONFIG.headModel.opacity,
    landmarksVisible: THREEJS_CONFIG.landmarks.enabled,
  };

  // ========================================================================
  // PUBLIC API
  // ========================================================================

  /**
   * Update scene with new face landmarks
   * @param {Array} landmarks - MediaPipe face landmarks
   * @param {number} canvasWidth - Canvas width
   * @param {number} canvasHeight - Canvas height
   */
  function updateFaceMesh(landmarks, canvasWidth, canvasHeight) {
    if (!landmarks || landmarks.length === 0) {
      // Clear existing mesh
      if (headMesh) {
        scene.remove(headMesh);
        headMesh.geometry.dispose();
        headMesh.material.dispose();
        headMesh = null;
      }
      if (landmarkPoints) {
        scene.remove(landmarkPoints);
        landmarkPoints.geometry.dispose();
        landmarkPoints.material.dispose();
        landmarkPoints = null;
      }
      return;
    }

    // Update geometry only (reuse material if mesh exists)
    if (headMesh) {
      // Update existing mesh geometry
      const newGeometry = headMesh.geometry;
      const positions = [];

      for (const landmark of landmarks) {
        const x = landmark.x * canvasWidth;
        const y = landmark.y * canvasHeight;
        const z = -landmark.z * canvasWidth;
        positions.push(x, y, z);
      }

      newGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      newGeometry.computeVertexNormals();
    } else if (THREEJS_CONFIG.headModel.enabled) {
      // Create new mesh first time
      headMesh = createHeadMesh(landmarks, canvasWidth, canvasHeight);
      scene.add(headMesh);

      // Apply user settings
      headMesh.material.wireframe = userSettings.wireframe;
      headMesh.material.opacity = userSettings.opacity;
    }

    // Update landmark points
    if (landmarkPoints) {
      const positions = [];
      for (const landmark of landmarks) {
        const x = landmark.x * canvasWidth;
        const y = landmark.y * canvasHeight;
        const z = -landmark.z * canvasWidth;
        positions.push(x, y, z);
      }
      landmarkPoints.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      landmarkPoints.visible = userSettings.landmarksVisible;
    } else if (THREEJS_CONFIG.landmarks.enabled) {
      landmarkPoints = createLandmarkPoints(landmarks, canvasWidth, canvasHeight);
      scene.add(landmarkPoints);
      landmarkPoints.visible = userSettings.landmarksVisible;
    }
  }

  /**
   * Render the scene
   */
  function render() {
    renderer.render(scene, camera);
  }

  /**
   * Handle canvas resize
   * @param {number} width - New width
   * @param {number} height - New height
   */
  function handleResize(width, height) {
    alignCameraToCanvas(width, height);
    renderer.setSize(width, height);
  }

  /**
   * Clear the scene
   */
  function clear() {
    if (headMesh) {
      scene.remove(headMesh);
      headMesh.geometry.dispose();
      headMesh.material.dispose();
      headMesh = null;
    }
    if (landmarkPoints) {
      scene.remove(landmarkPoints);
      landmarkPoints.geometry.dispose();
      landmarkPoints.material.dispose();
      landmarkPoints = null;
    }
  }

  /**
   * Dispose of all resources
   */
  function dispose() {
    clear();
    renderer.dispose();
  }

  /**
   * Reset camera to default position (no-op for overlay mode)
   */
  function resetCamera() {
    alignCameraToCanvas(currentCanvasWidth, currentCanvasHeight);
  }

  /**
   * Toggle wireframe mode
   * @param {boolean} enabled - Enable wireframe
   */
  function setWireframe(enabled) {
    userSettings.wireframe = enabled;
    if (headMesh) {
      headMesh.material.wireframe = enabled;
    }
  }

  /**
   * Set head mesh opacity
   * @param {number} opacity - Opacity value (0-1)
   */
  function setOpacity(opacity) {
    const clampedOpacity = Math.max(0, Math.min(1, opacity));
    userSettings.opacity = clampedOpacity;
    if (headMesh) {
      headMesh.material.opacity = clampedOpacity;
    }
  }

  /**
   * Toggle landmark visibility
   * @param {boolean} visible - Show landmarks
   */
  function setLandmarksVisible(visible) {
    userSettings.landmarksVisible = visible;
    if (landmarkPoints) {
      landmarkPoints.visible = visible;
    }
  }

  return {
    updateFaceMesh,
    render,
    handleResize,
    clear,
    dispose,
    resetCamera,
    setWireframe,
    setOpacity,
    setLandmarksVisible,

    // Expose Three.js objects for advanced usage
    scene,
    camera,
    renderer,
    controls,
  };
}
