/**
 * Three.js 3D Overlay Module
 * @module graphics-3d
 *
 * Draws a triangulated face mesh, landmark points, and pupil lines from
 * MediaPipe landmarks, aligned pixel-for-pixel over the video.
 */

import * as THREE from 'three';
import { THREEJS_CONFIG } from './config.js';
import { FACE_MESH_TRIANGLES, RIGHT_PUPIL, LEFT_PUPIL } from './face-mesh-triangles.js';

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
 * Write landmark xyz positions into a buffer attribute in place
 * @param {boolean} offsetIris - Push iris landmarks forward
 */
function writePositions(attribute, landmarks, canvasWidth, canvasHeight, offsetIris) {
  for (let i = 0; i < landmarks.length; i++) {
    const zOffset = offsetIris && i >= 468 && i <= 477 ? IRIS_Z_OFFSET : 0;
    const pos = landmarkTo3D(landmarks[i], canvasWidth, canvasHeight, zOffset);
    attribute.setXYZ(i, pos.x, pos.y, pos.z);
  }
  attribute.needsUpdate = true;
}

/**
 * Compute pupil line segments: each pupil extended along the face normal,
 * plus a line joining the two extension points
 * @returns {Float32Array} 3 line segments (18 floats)
 */
function pupilLinePositions(landmarks, canvasWidth, canvasHeight) {
  // "left"/"right" here are the line's two ends; the face normal only needs a consistent order
  const leftPos = landmarkTo3D(landmarks[RIGHT_PUPIL], canvasWidth, canvasHeight, IRIS_Z_OFFSET);
  const rightPos = landmarkTo3D(landmarks[LEFT_PUPIL], canvasWidth, canvasHeight, IRIS_Z_OFFSET);

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
  const LANDMARK_COUNT = 478;
  const newPositionAttribute = (count) =>
    new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage);

  const headGeometry = new THREE.BufferGeometry();
  headGeometry.setIndex(FACE_MESH_TRIANGLES.flat());
  headGeometry.setAttribute('position', newPositionAttribute(LANDMARK_COUNT));
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
  const pointsGeometry = new THREE.BufferGeometry();
  pointsGeometry.setAttribute('position', newPositionAttribute(LANDMARK_COUNT));
  const landmarkPoints = new THREE.Points(
    pointsGeometry,
    new THREE.PointsMaterial({
      size: pointsConfig.size,
      color: pointsConfig.color,
      transparent: true,
      opacity: pointsConfig.opacity,
      sizeAttenuation: true,
    })
  );

  // Pupil lines
  const pupilGeometry = new THREE.BufferGeometry();
  pupilGeometry.setAttribute('position', newPositionAttribute(6));
  const pupilLines = new THREE.LineSegments(
    pupilGeometry,
    new THREE.LineBasicMaterial({
      color: 0x00ff00,
      linewidth: 2,
      transparent: true,
      opacity: 0.8,
    })
  );

  // Everything is shown or hidden together (hidden when no face)
  const face = new THREE.Group();
  face.add(headMesh, landmarkPoints, pupilLines);
  face.visible = false;
  landmarkPoints.visible = pointsConfig.visible;
  scene.add(face);

  // ========================================================================
  // PUBLIC API
  // ========================================================================

  /**
   * Update scene with new face landmarks
   * @param {Array|null} landmarks - MediaPipe face landmarks (null hides the face)
   * @param {number} canvasWidth - Canvas width
   * @param {number} canvasHeight - Canvas height
   */
  function updateFaceMesh(landmarks, canvasWidth, canvasHeight) {
    face.visible = Boolean(landmarks);
    if (!landmarks) return;

    writePositions(headGeometry.attributes.position, landmarks, canvasWidth, canvasHeight, true);
    headGeometry.computeVertexNormals();
    headGeometry.computeBoundingSphere();

    writePositions(pointsGeometry.attributes.position, landmarks, canvasWidth, canvasHeight, false);
    pointsGeometry.computeBoundingSphere();

    pupilGeometry.attributes.position.array.set(pupilLinePositions(landmarks, canvasWidth, canvasHeight));
    pupilGeometry.attributes.position.needsUpdate = true;
    pupilGeometry.computeBoundingSphere();
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
