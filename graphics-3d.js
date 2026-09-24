/**
 * Three.js 3D Overlay Module
 * @module graphics-3d
 *
 * Draws a triangulated face mesh, landmark points, and pupil lines from
 * MediaPipe landmarks, aligned pixel-for-pixel over the video.
 */

import * as THREE from 'three';
import { THREEJS_CONFIG } from './config.js';
import { FACE_MESH_TRIANGLES, IRIS_LEFT_CENTER, IRIS_RIGHT_CENTER } from './face-mesh-triangles.js';

// Iris/pupil landmarks (468-477) are pushed forward so they render in front
const IRIS_Z_OFFSET = 20;

// ============================================================================
// COORDINATE TRANSFORMATION UTILITIES
// ============================================================================

/**
 * Convert MediaPipe landmark to 3D coordinates
 * MediaPipe: x(0-1) left-to-right, y(0-1) top-to-bottom, z(depth around 0)
 * Three.js: Direct mapping to canvas pixel coordinates
 * @param {Object} landmark - MediaPipe landmark {x, y, z}
 * @param {number} canvasWidth - Canvas width
 * @param {number} canvasHeight - Canvas height
 * @param {number} zOffset - Optional Z offset to apply
 * @returns {Object} {x, y, z} in Three.js coordinate system
 */
function landmarkTo3D(landmark, canvasWidth, canvasHeight, zOffset = 0) {
  return {
    x: landmark.x * canvasWidth,
    y: landmark.y * canvasHeight, // Direct mapping, no flip
    z: -landmark.z * canvasWidth + zOffset
  };
}

/**
 * Flatten landmarks into an xyz position array
 * @param {boolean} offsetIris - Push iris landmarks forward
 * @returns {number[]}
 */
function landmarkPositions(landmarks, canvasWidth, canvasHeight, offsetIris) {
  const positions = [];
  for (let i = 0; i < landmarks.length; i++) {
    const zOffset = offsetIris && i >= 468 && i <= 477 ? IRIS_Z_OFFSET : 0;
    const pos = landmarkTo3D(landmarks[i], canvasWidth, canvasHeight, zOffset);
    positions.push(pos.x, pos.y, pos.z);
  }
  return positions;
}

/**
 * Compute pupil line segments: each pupil extended along the face normal,
 * plus a line joining the two extension points
 * @returns {Float32Array|null} 3 line segments (18 floats)
 */
function pupilLinePositions(landmarks, canvasWidth, canvasHeight) {
  const leftPupil = landmarks[IRIS_LEFT_CENTER];
  const rightPupil = landmarks[IRIS_RIGHT_CENTER];
  if (!leftPupil || !rightPupil) return null;

  const leftPos = landmarkTo3D(leftPupil, canvasWidth, canvasHeight, IRIS_Z_OFFSET);
  const rightPos = landmarkTo3D(rightPupil, canvasWidth, canvasHeight, IRIS_Z_OFFSET);

  // Face normal = eyeVec × up, with up = (0, 1, 0) in screen coords
  let normalX = -(rightPos.z - leftPos.z);
  let normalZ = rightPos.x - leftPos.x;
  const normalLength = Math.hypot(normalX, normalZ);
  if (normalLength > 0) {
    normalX /= normalLength;
    normalZ /= normalLength;
  }

  // Scale extension by 1/|normalZ| so the lines look equally long when the
  // face is turned (minimum 0.3 to avoid blowing up)
  const extension = 100 / Math.max(0.3, Math.abs(normalZ));

  const leftExt = { x: leftPos.x + normalX * extension, y: leftPos.y, z: leftPos.z + normalZ * extension };
  const rightExt = { x: rightPos.x + normalX * extension, y: rightPos.y, z: rightPos.z + normalZ * extension };

  return new Float32Array([
    leftPos.x, leftPos.y, leftPos.z, leftExt.x, leftExt.y, leftExt.z,
    rightPos.x, rightPos.y, rightPos.z, rightExt.x, rightExt.y, rightExt.z,
    leftExt.x, leftExt.y, leftExt.z, rightExt.x, rightExt.y, rightExt.z,
  ]);
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
  const scene = new THREE.Scene(); // background stays null (transparent)

  // Orthographic camera maps world units 1:1 to canvas pixels
  const camera = new THREE.OrthographicCamera(0, 1, 0, 1, -2000, 2000);

  const renderer = new THREE.WebGLRenderer({
    canvas: canvasElement,
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(window.devicePixelRatio);

  // Lighting
  const { ambient, directional, point } = THREEJS_CONFIG.lights;
  scene.add(new THREE.AmbientLight(ambient.color, ambient.intensity));
  const directionalLight = new THREE.DirectionalLight(directional.color, directional.intensity);
  directionalLight.position.set(directional.position.x, directional.position.y, directional.position.z);
  scene.add(directionalLight);
  const pointLight = new THREE.PointLight(point.color, point.intensity);
  pointLight.position.set(point.position.x, point.position.y, point.position.z);
  scene.add(pointLight);

  // Head mesh
  const headConfig = THREEJS_CONFIG.headModel;
  const headGeometry = new THREE.BufferGeometry();
  headGeometry.setIndex(FACE_MESH_TRIANGLES.flat());
  const headMesh = new THREE.Mesh(
    headGeometry,
    new THREE.MeshPhongMaterial({
      color: headConfig.color,
      emissive: headConfig.emissive,
      emissiveIntensity: headConfig.emissiveIntensity,
      shininess: headConfig.shininess,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: headConfig.opacity,
      wireframe: headConfig.wireframe,
    })
  );

  // Landmark points
  const pointsConfig = THREEJS_CONFIG.landmarks;
  const landmarkPoints = new THREE.Points(
    new THREE.BufferGeometry(),
    new THREE.PointsMaterial({
      size: pointsConfig.size,
      color: pointsConfig.color,
      transparent: true,
      opacity: pointsConfig.opacity,
      sizeAttenuation: true,
    })
  );
  landmarkPoints.visible = pointsConfig.visible;

  // Pupil lines
  const pupilLines = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({
      color: 0x00ff00,
      linewidth: 2,
      transparent: true,
      opacity: 0.8,
    })
  );

  scene.add(headMesh, landmarkPoints, pupilLines);

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
    headGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(landmarkPositions(landmarks, canvasWidth, canvasHeight, true), 3)
    );
    headGeometry.computeVertexNormals();

    landmarkPoints.geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(landmarkPositions(landmarks, canvasWidth, canvasHeight, false), 3)
    );

    const pupilPositions = pupilLinePositions(landmarks, canvasWidth, canvasHeight);
    pupilLines.visible = Boolean(pupilPositions);
    if (pupilPositions) {
      pupilLines.geometry.setAttribute('position', new THREE.BufferAttribute(pupilPositions, 3));
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
    camera.left = 0;
    camera.right = Math.max(1, width);
    camera.top = 0;
    camera.bottom = Math.max(1, height);
    camera.position.set(0, 0, 1000);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  handleResize(canvasElement.width, canvasElement.height);

  return {
    updateFaceMesh,
    render,
    handleResize,
    setWireframe: (enabled) => { headMesh.material.wireframe = enabled; },
    setOpacity: (opacity) => { headMesh.material.opacity = Math.max(0, Math.min(1, opacity)); },
    setLandmarksVisible: (visible) => { landmarkPoints.visible = visible; },
  };
}
