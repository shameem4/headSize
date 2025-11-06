import React, { useEffect, useRef, useCallback, useState } from 'react';

// --- Helper Functions (from holistic.js) ---
// These are defined globally, just like in the demo script.

function removeElements(landmarks, elements) {
  for (const element of elements) {
    delete landmarks[element];
  }
}

function removeLandmarks(results) {
  if (window.mpHolistic && results.poseLandmarks) {
    removeElements(
      results.poseLandmarks,
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 16, 17, 18, 19, 20, 21, 22]
    );
  }
}

function connect(ctx, connectors) {
  const canvas = ctx.canvas;
  const NormalizedLandmark = window.NormalizedLandmark; 
  if (!NormalizedLandmark) return; 

  for (const connector of connectors) {
    const from = connector[0];
    const to = connector[1];
    if (from && to) {
      if (from.visibility && to.visibility &&
        (from.visibility < 0.1 || to.visibility < 0.1)) {
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(from.x * canvas.width, from.y * canvas.height);
      ctx.lineTo(to.x * canvas.width, to.y * canvas.height);
      ctx.stroke();
    }
  }
}

// Global variable for the effect
let activeEffect = 'mask';


export default function HolisticDemoComponent() {
  // --- Refs for DOM Elements ---
  // These refs must point to the elements in your HTML
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const controlsRef = useRef(null);
  
  // --- Refs for MediaPipe Instances ---
  const holisticRef = useRef(null);
  const cameraRef = useRef(null);
  
  // Ref for the canvas context
  const canvasCtxRef = useRef(null);
  // Ref for the FPS control
  const fpsControlRef = useRef(null);
  
  const [isLoading, setIsLoading] = useState(true);

  /**
   * The main callback for MediaPipe. This is called every time
   * a new frame has been processed.
   */
  const onResults = useCallback((results) => {
    // Hide spinner
    setIsLoading(prevState => (prevState ? false : prevState));
    
    // Tick FPS output
    if (fpsControlRef.current) {
      fpsControlRef.current.tick('output');
    }

    // Get all the dynamically loaded classes from `window`
    const drawingUtils = window.drawingUtils;
    const mpHolistic = window;
    const canvasElement = canvasRef.current;
    const canvasCtx = canvasCtxRef.current;

    if (!drawingUtils || !mpHolistic.POSE_LANDMARKS || !canvasElement || !canvasCtx) {
      return;
    }

    // --- Start Drawing (Exactly as in holistic.js) ---
    
    // 1. Set canvas size
    canvasElement.width = results.image.width;
    canvasElement.height = results.image.height;

    // 2. Clear the canvas
    removeLandmarks(results);
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    // 3. Draw the video (results.image) or segmentation mask
    //    `selfieMode: true` flips `results.image` for us.
    if (results.segmentationMask) {
      canvasCtx.drawImage(
        results.segmentationMask, 0, 0, canvasElement.width,
        canvasElement.height);

      if (activeEffect === 'mask' || activeEffect === 'both') {
        canvasCtx.globalCompositeOperation = 'source-in';
        canvasCtx.fillStyle = '#00FF007F';
        canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);
      } else {
        canvasCtx.globalCompositeOperation = 'source-out';
        canvasCtx.fillStyle = '#0000FF7F';
        canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);
      }

      canvasCtx.globalCompositeOperation = 'destination-atop';
      canvasCtx.drawImage(
        results.image, 0, 0, canvasElement.width, canvasElement.height);

      canvasCtx.globalCompositeOperation = 'source-over';
    } else {
      // Draw the main video image
      canvasCtx.drawImage(
        results.image, 0, 0, canvasElement.width, canvasElement.height);
    }

    // 4. Draw all the landmarks on top
    canvasCtx.lineWidth = 5;
    if (results.poseLandmarks) {
      if (results.rightHandLandmarks) {
        canvasCtx.strokeStyle = 'white';
        connect(canvasCtx, [[
          results.poseLandmarks[mpHolistic.POSE_LANDMARKS.RIGHT_ELBOW],
          results.rightHandLandmarks[0]
        ]]);
      }
      if (results.leftHandLandmarks) {
        canvasCtx.strokeStyle = 'white';
        connect(canvasCtx, [[
          results.poseLandmarks[mpHolistic.POSE_LANDMARKS.LEFT_ELBOW],
          results.leftHandLandmarks[0]
        ]]);
      }
    }
    drawingUtils.drawConnectors(
      canvasCtx, results.poseLandmarks, mpHolistic.POSE_CONNECTIONS,
      { color: 'white' });
    drawingUtils.drawLandmarks(
      canvasCtx,
      Object.values(mpHolistic.POSE_LANDMARKS_LEFT)
        .map(index => results.poseLandmarks[index]),
      { visibilityMin: 0.65, color: 'white', fillColor: 'rgb(255,138,0)' });
    drawingUtils.drawLandmarks(
      canvasCtx,
      Object.values(mpHolistic.POSE_LANDMARKS_RIGHT)
        .map(index => results.poseLandmarks[index]),
      { visibilityMin: 0.65, color: 'white', fillColor: 'rgb(0,217,231)' });
    drawingUtils.drawConnectors(
      canvasCtx, results.rightHandLandmarks, mpHolistic.HAND_CONNECTIONS,
      { color: 'white' });
    drawingUtils.drawLandmarks(canvasCtx, results.rightHandLandmarks, {
      color: 'white',
      fillColor: 'rgb(0,217,231)',
      lineWidth: 2,
      radius: (data) => {
        return drawingUtils.lerp(data.from.z, -0.15, .1, 10, 1);
      }
    });
    drawingUtils.drawConnectors(
      canvasCtx, results.leftHandLandmarks, mpHolistic.HAND_CONNECTIONS,
      { color: 'white' });
    drawingUtils.drawLandmarks(canvasCtx, results.leftHandLandmarks, {
      color: 'white',
      fillColor: 'rgb(255,138,0)',
      lineWidth: 2,
      radius: (data) => {
        return drawingUtils.lerp(data.from.z, -0.15, .1, 10, 1);
      }
    });
    drawingUtils.drawConnectors(
      canvasCtx, results.faceLandmarks, mpHolistic.FACEMESH_TESSELATION,
      { color: '#C0C0C070', lineWidth: 1 });
    drawingUtils.drawConnectors(
      canvasCtx, results.faceLandmarks, mpHolistic.FACEMESH_RIGHT_EYE,
      { color: 'rgb(0,217,231)' });
    drawingUtils.drawConnectors(
      canvasCtx, results.faceLandmarks, mpHolistic.FACEMESH_RIGHT_EYEBROW,
      { color: 'rgb(0,217,231)' });
    drawingUtils.drawConnectors(
      canvasCtx, results.faceLandmarks, mpHolistic.FACEMESH_LEFT_EYE,
      { color: 'rgb(255,138,0)' });
    drawingUtils.drawConnectors(
      canvasCtx, results.faceLandmarks, mpHolistic.FACEMESH_LEFT_EYEBROW,
      { color: 'rgb(255,138,0)' });
    drawingUtils.drawConnectors(
      canvasCtx, results.faceLandmarks, mpHolistic.FACEMESH_FACE_OVAL,
      { color: '#E0E0E0', lineWidth: 5 });
    drawingUtils.drawConnectors(
      canvasCtx, results.faceLandmarks, mpHolistic.FACEMESH_LIPS,
      { color: '#E0E0E0', lineWidth: 5 });


    canvasCtx.restore();
  }, []); // onResults is stable

  /**
   * Main setup effect
   */
  useEffect(() => {
    // --- 1. Scripts are pre-loaded, so access them from `window` ---
    const Holistic = window.Holistic;
    const Camera = window.Camera;
    const ControlPanel = window.ControlPanel; // The demo uses this
    
    // --- 2. Get DOM elements ---
    const videoElement = videoRef.current;
    const canvasElement = canvasRef.current;
    const controlsElement = controlsRef.current;
    
    if (!videoElement || !canvasElement || !controlsElement || !Holistic || !Camera || !ControlPanel) {
      console.error("Setup failed: One or more dependencies are missing.");
      return;
    }
    
    const canvasCtx = canvasElement.getContext('2d');
    canvasCtxRef.current = canvasCtx;

    // --- 3. Initialize Holistic ---
    const holistic = new Holistic({
      locateFile: (file) => {
        // Use the same version from your script tags
        return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5/${file}`;
      }
    });
    holistic.setOptions({
      selfieMode: true,
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: true,
      smoothSegmentation: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    activeEffect = 'mask'; // Default effect

    holistic.onResults(onResults);
    holisticRef.current = holistic;
    
    // --- 4. Setup ControlPanel (from holistic.js) ---
    const fpsControl = new ControlPanel.FPS();
    fpsControlRef.current = fpsControl; // Store for onResults
    
    new ControlPanel(controlsElement, {
      selfieMode: true,
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: true, // Corresponds to `activeEffect = 'mask'`
      smoothSegmentation: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
      effect: 'mask' // Set default effect
    })
    .add([
      new ControlPanel.StaticText({title: 'MediaPipe Holistic'}),
      fpsControl,
      new ControlPanel.Toggle({title: 'Selfie Mode', field: 'selfieMode'}),
      // Note: The demo doesn't use SourcePicker, it just uses the <video>
      // ... adding the rest of the controls from holistic.js
      new ControlPanel.Slider({
        title: 'Model Complexity',
        field: 'modelComplexity',
        discrete: ['Lite', 'Full', 'Heavy'],
      }),
      new ControlPanel.Toggle(
          {title: 'Smooth Landmarks', field: 'smoothLandmarks'}),
      new ControlPanel.Toggle(
          {title: 'Enable Segmentation', field: 'enableSegmentation'}),
      new ControlPanel.Toggle(
          {title: 'Smooth Segmentation', field: 'smoothSegmentation'}),
      new ControlPanel.Slider({
        title: 'Min Detection Confidence',
        field: 'minDetectionConfidence',
        range: [0, 1],
        step: 0.01
      }),
      new ControlPanel.Slider({
        title: 'Min Tracking Confidence',
        field: 'minTrackingConfidence',
        range: [0, 1],
        step: 0.01
      }),
      new ControlPanel.Slider({
        title: 'Effect',
        field: 'effect',
        discrete: {'background': 'Background', 'mask': 'Foreground'},
      }),
    ])
    .on(options => {
      // This listener updates holistic and the activeEffect
      videoElement.classList.toggle('selfie', options.selfieMode);
      activeEffect = options.effect;
      holistic.setOptions(options);
    });

    // --- 5. Setup Camera (from holistic.js) ---
    const camera = new Camera(videoElement, {
      onFrame: async () => {
        // Tick FPS input
        fpsControl.tick('input');
        // Send to holistic
        await holistic.send({ image: videoElement });
      },
      width: 1280,
      height: 720
    });
    camera.start();
    cameraRef.current = camera;
    
    // --- 6. Cleanup ---
    return () => {
      camera.stop();
      holistic.close();
    };
  }, [onResults]);

  return (
    <>
      <style>{`
        /* This CSS is from the demo site */
        html, body {
          margin: 0;
          background-color: #000;
        }
        .container {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .loading {
          display: flex;
          position: absolute;
          top: 0;
          right: 0;
          bottom: 0;
          left: 0;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 2em;
          font-family: sans-serif;
        }
        .input_video {
          display: none;
        }
        .output_canvas {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          transform: scale(-1, 1);
        }
        .control-panel {
          position: absolute;
          top: 10px;
          left: 10px;
          z-index: 10;
        }
        .selfie {
          /* This class is toggled by the controls */
          transform: scale(-1, 1);
        }
      `}</style>
      
      {/* This JSX assumes your main HTML file looks like this:
        <body>
          <div id="root"></div>
          
          <div class="container">
            <video class="input_video" playsinline></video>
            <canvas class="output_canvas"></canvas>
            <div class="control-panel"></div>
          </div>
        </body>
      */}

      {/* This React component will attach its logic to the elements
        in your HTML. We just need to render the spinner.
      */}
      
      {/* Find the elements in the HTML and attach refs */}
      <video ref={videoRef} className="input_video" style={{display: 'none'}} playsInline></video>
      <canvas ref={canvasRef} className="output_canvas"></canvas>
      <div ref={controlsRef} className="control-panel"></div>
      
      {isLoading && (
        <div className="loading">
          <p>Loading model...</p>
        </div>
      )}
    </>
  );
}