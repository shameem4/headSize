# Three.js 3D Implementation

## Overview

The headSize application now supports **three rendering modes**:

1. **Canvas 2D** (default) - Traditional 2D overlay measurements
2. **Three.js 3D** - Interactive 3D head mesh visualization
3. **Hybrid** - Both 2D overlays and 3D model simultaneously

## Features

### 3D Visualization
- **Real-time 3D head mesh** generated from MediaPipe face landmarks
- **Interactive camera controls** (orbit, zoom, pan)
- **Landmark point cloud** visualization
- **Configurable materials** (color, opacity, wireframe)

### User Controls
- **View Mode Toggle**: Switch between 2D, 3D, and Hybrid modes
- **Wireframe Mode**: Toggle mesh wireframe display
- **Landmark Visibility**: Show/hide landmark points
- **Opacity Slider**: Adjust head mesh transparency (0-100%)
- **Reset Camera**: Return to default camera position

### Visual Features
- Phong material with emissive lighting
- Grid and axes helpers for spatial reference
- Ambient, directional, and point lighting
- Smooth camera controls with damping

## Architecture

### File Structure
```
graphics-3d.js          # Three.js 3D renderer module
main.js                 # Updated with 3D integration
config.js               # Added THREEJS_CONFIG
index.html              # Added 3D canvas and controls
style.css               # Added 3D-specific styles
```

### Key Components

#### 1. graphics-3d.js
```javascript
export function createGraphics3D(canvasElement)
```
Creates Three.js renderer with:
- Scene, camera, renderer setup
- OrbitControls for interaction
- Lighting configuration
- Head mesh generation from landmarks
- Landmark point cloud visualization

#### 2. Configuration (config.js)
```javascript
export const THREEJS_CONFIG = {
  enabled: true,
  headModel: { ... },
  landmarks: { ... },
  camera: { ... },
  lights: { ... },
  scene: { ... },
}
```

#### 3. Main Integration (main.js)
- Dual render loop supporting both 2D and 3D
- Mode switching logic
- Event listeners for 3D controls
- Canvas visibility management

## Usage

### Toggle View Modes
Use the "View Mode" radio buttons in the metrics panel:
- **2D Overlay**: Traditional flat measurements
- **3D Model**: Interactive 3D head mesh
- **Hybrid**: Both overlaid (recommended for advanced users)

### 3D Controls (when 3D mode enabled)
- **Orbit**: Left-click + drag
- **Zoom**: Scroll wheel
- **Pan**: Right-click + drag (or Shift + left-click)
- **Wireframe**: Toggle mesh wireframe mode
- **Landmarks**: Show/hide landmark points
- **Opacity**: Adjust mesh transparency
- **Reset Camera**: Return to default view

## Configuration

### Enable/Disable 3D
```javascript
// config.js
export const THREEJS_CONFIG = {
  enabled: true,  // Set to false to disable 3D entirely
}
```

### Customize Head Model
```javascript
// config.js
THREEJS_CONFIG.headModel = {
  opacity: 0.85,
  wireframe: false,
  color: 0x88ccff,        // Light blue
  emissive: 0x223344,     // Dark blue glow
  emissiveIntensity: 0.2,
  shininess: 30,
}
```

### Adjust Camera
```javascript
// config.js
THREEJS_CONFIG.camera = {
  fov: 45,
  position: { x: 0, y: 0, z: 500 },
  controls: {
    rotateSpeed: 0.5,
    zoomSpeed: 1.2,
    panSpeed: 0.8,
    minDistance: 100,
    maxDistance: 1000,
  },
}
```

### Customize Lighting
```javascript
// config.js
THREEJS_CONFIG.lights = {
  ambient: {
    enabled: true,
    color: 0xffffff,
    intensity: 0.6,
  },
  directional: {
    enabled: true,
    color: 0xffffff,
    intensity: 0.8,
    position: { x: 100, y: 100, z: 100 },
  },
}
```

## Technical Details

### Landmark Mesh Generation

The 3D head mesh is constructed using:
1. **478 MediaPipe face landmarks** converted to 3D coordinates
2. **Face mesh triangulation** connecting landmarks into triangles
3. **Automatic vertex normal computation** for smooth shading
4. **Real-time updates** (60 FPS) as face moves

### Coordinate System
- MediaPipe: `x` (horizontal), `y` (vertical), `z` (depth, normalized)
- Three.js: `x` (horizontal), `y` (vertical inverted), `z` (depth scaled)
- Scale factor: `300` for optimal visibility

### Performance
- **Bundle Size**: ~600KB (Three.js + OrbitControls from CDN)
- **Frame Rate**: 60 FPS on modern hardware
- **GPU Acceleration**: WebGL rendering
- **Memory**: Mesh geometry recreated each frame for real-time tracking

### Browser Compatibility
- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support (WebGL 1.0+)
- Mobile: Supported but may have performance limitations

## API Reference

### createGraphics3D(canvasElement)
Creates a 3D graphics renderer instance.

**Methods:**
- `updateFaceMesh(landmarks, width, height)` - Update 3D mesh from landmarks
- `render()` - Render the scene
- `handleResize(width, height)` - Handle canvas resize
- `clear()` - Clear all scene objects
- `dispose()` - Clean up resources
- `resetCamera()` - Reset camera to default position
- `setWireframe(enabled)` - Toggle wireframe mode
- `setOpacity(opacity)` - Set mesh opacity (0-1)
- `setLandmarksVisible(visible)` - Toggle landmark visibility

**Exposed Properties:**
- `scene` - Three.js Scene object
- `camera` - Three.js PerspectiveCamera
- `renderer` - Three.js WebGLRenderer
- `controls` - OrbitControls instance

## Future Enhancements

### Planned Features
1. **3D Measurement Overlays**: Display measurements in 3D space
2. **Model Export**: Export head mesh as OBJ/STL
3. **Multiple Faces**: Support multiple faces in 3D scene
4. **Animation Recording**: Record and replay head movements
5. **Comparison Mode**: Compare multiple face scans side-by-side
6. **Texture Mapping**: Apply video texture to 3D mesh
7. **AR Integration**: WebXR support for augmented reality
8. **Point Cloud Export**: Export raw landmark data

### Optimization Opportunities
1. Geometry pooling (avoid recreation each frame)
2. Level-of-detail (LOD) for distant meshes
3. Instanced rendering for multiple faces
4. Web Workers for mesh generation

## Troubleshooting

### 3D view not showing
- Check `THREEJS_CONFIG.enabled = true` in config.js
- Ensure browser supports WebGL
- Check console for Three.js import errors

### Performance issues
- Disable landmarks (`THREEJS_CONFIG.landmarks.enabled = false`)
- Reduce grid divisions (`THREEJS_CONFIG.grid.divisions = 10`)
- Use wireframe mode for better performance

### Controls not responding
- Ensure `THREEJS_CONFIG.camera.controls.enabled = true`
- Check if canvas has `pointer-events: auto` in CSS
- Verify OrbitControls imported correctly from CDN

## Credits

- **Three.js**: https://threejs.org/
- **MediaPipe Face Landmarker**: https://developers.google.com/mediapipe
- **OrbitControls**: Three.js examples

## License

Same as parent project (headSize application).
