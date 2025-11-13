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

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { THREEJS_CONFIG, COLOR_CONFIG } from './config.js';

// ============================================================================
// LANDMARK MESH GENERATION
// ============================================================================

/**
 * MediaPipe face mesh triangulation indices
 * Defines which landmarks connect to form triangles
 */
const FACE_MESH_TRIANGLES = [
  // Forehead and upper face
  [10, 338, 297], [297, 338, 332], [332, 338, 333], [333, 338, 334],
  [334, 338, 296], [296, 338, 336], [336, 338, 9], [9, 338, 107],
  [107, 338, 66], [66, 338, 105], [105, 338, 63], [63, 338, 70],

  // Nose region
  [168, 6, 197], [197, 195, 5], [5, 4, 1], [1, 19, 94],
  [94, 2, 164], [164, 0, 11], [11, 12, 13], [13, 14, 15],

  // Eye regions
  [33, 246, 161], [161, 160, 159], [159, 158, 157], [157, 173, 133],
  [263, 466, 388], [388, 387, 386], [386, 385, 384], [384, 398, 362],

  // Mouth region
  [61, 185, 40], [40, 39, 37], [37, 0, 267], [267, 269, 270],
  [270, 409, 291], [291, 375, 321], [321, 405, 314], [314, 17, 84],

  // Cheeks and jaw
  [127, 162, 21], [21, 54, 103], [103, 67, 109], [109, 10, 338],
  [356, 389, 251], [251, 284, 332], [332, 297, 338], [338, 10, 109],

  // Additional face structure
  [234, 93, 132], [132, 58, 172], [172, 136, 150], [150, 149, 176],
  [454, 323, 361], [361, 288, 397], [397, 365, 379], [379, 378, 400],
];

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
  const scale = 300; // Scale factor for visibility

  for (const landmark of landmarks) {
    // MediaPipe coordinates: x (horizontal), y (vertical), z (depth)
    // Convert to Three.js coordinates: x (horizontal), y (vertical), z (depth)
    const x = (landmark.x - 0.5) * scale;
    const y = -(landmark.y - 0.5) * scale; // Invert Y for Three.js
    const z = landmark.z * scale;

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
function createLandmarkPoints(landmarks) {
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  const scale = 300;

  for (const landmark of landmarks) {
    const x = (landmark.x - 0.5) * scale;
    const y = -(landmark.y - 0.5) * scale;
    const z = landmark.z * scale;
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
  const camera = new THREE.PerspectiveCamera(
    THREEJS_CONFIG.camera.fov,
    canvasElement.width / canvasElement.height,
    THREEJS_CONFIG.camera.near,
    THREEJS_CONFIG.camera.far
  );

  const renderer = new THREE.WebGLRenderer({
    canvas: canvasElement,
    antialias: true,
    alpha: true,
  });

  renderer.setSize(canvasElement.width, canvasElement.height);
  renderer.setPixelRatio(window.devicePixelRatio);

  // Scene setup
  const bgConfig = THREEJS_CONFIG.scene;
  scene.background = new THREE.Color(bgConfig.background);

  if (bgConfig.fog.enabled) {
    scene.fog = new THREE.Fog(
      bgConfig.fog.color,
      bgConfig.fog.near,
      bgConfig.fog.far
    );
  }

  // Camera setup
  const camPos = THREEJS_CONFIG.camera.position;
  camera.position.set(camPos.x, camPos.y, camPos.z);
  camera.lookAt(0, 0, 0);

  // Orbit controls
  let controls = null;
  if (THREEJS_CONFIG.camera.controls.enabled) {
    controls = new OrbitControls(camera, canvasElement);
    const ctrlConfig = THREEJS_CONFIG.camera.controls;
    controls.enableDamping = ctrlConfig.enableDamping;
    controls.dampingFactor = ctrlConfig.dampingFactor;
    controls.rotateSpeed = ctrlConfig.rotateSpeed;
    controls.zoomSpeed = ctrlConfig.zoomSpeed;
    controls.panSpeed = ctrlConfig.panSpeed;
    controls.minDistance = ctrlConfig.minDistance;
    controls.maxDistance = ctrlConfig.maxDistance;
  }

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

    // Remove old mesh
    if (headMesh) {
      scene.remove(headMesh);
      headMesh.geometry.dispose();
      headMesh.material.dispose();
    }
    if (landmarkPoints) {
      scene.remove(landmarkPoints);
      landmarkPoints.geometry.dispose();
      landmarkPoints.material.dispose();
    }

    // Create new mesh
    if (THREEJS_CONFIG.headModel.enabled) {
      headMesh = createHeadMesh(landmarks, canvasWidth, canvasHeight);
      scene.add(headMesh);
    }

    if (THREEJS_CONFIG.landmarks.enabled) {
      landmarkPoints = createLandmarkPoints(landmarks);
      scene.add(landmarkPoints);
    }
  }

  /**
   * Render the scene
   */
  function render() {
    if (controls) {
      controls.update();
    }
    renderer.render(scene, camera);
  }

  /**
   * Handle canvas resize
   * @param {number} width - New width
   * @param {number} height - New height
   */
  function handleResize(width, height) {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
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
    if (controls) {
      controls.dispose();
    }
  }

  /**
   * Reset camera to default position
   */
  function resetCamera() {
    const pos = THREEJS_CONFIG.camera.position;
    camera.position.set(pos.x, pos.y, pos.z);
    camera.lookAt(0, 0, 0);
    if (controls) {
      controls.reset();
    }
  }

  /**
   * Toggle wireframe mode
   * @param {boolean} enabled - Enable wireframe
   */
  function setWireframe(enabled) {
    if (headMesh) {
      headMesh.material.wireframe = enabled;
    }
  }

  /**
   * Set head mesh opacity
   * @param {number} opacity - Opacity value (0-1)
   */
  function setOpacity(opacity) {
    if (headMesh) {
      headMesh.material.opacity = Math.max(0, Math.min(1, opacity));
    }
  }

  /**
   * Toggle landmark visibility
   * @param {boolean} visible - Show landmarks
   */
  function setLandmarksVisible(visible) {
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
