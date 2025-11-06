import {
  GestureRecognizer,
  FilesetResolver,
  DrawingUtils,

  FaceLandmarker,
//   PoseLandmarker,

} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";



let runningMode = "VIDEO";

const videoHeight = 720;
const videoWidth = 1280;


const vision = await FilesetResolver.forVisionTasks(
"https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
);
const gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
baseOptions: {
    modelAssetPath:
    "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
    delegate: "GPU",
},
runningMode: runningMode,
numHands: 2,
});

const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
      delegate: "GPU"
    },
    outputFaceBlendshapes: true,
    runningMode,
    numFaces: 1
  });



const video = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");
const gestureOutput = document.getElementById("gesture_output");

function calibdb_query(camera_id, imsize, api_key) {
    let data = { "camera": camera_id, "userAgent": navigator.userAgent, "imsize": imsize, "api_key": api_key }

    // send data to server
    let xhttp = new XMLHttpRequest()
    xhttp.responseType = "json"
    xhttp.open("POST", "https://calibdb.net/query", true)

    let promise = new Promise((resolve, reject) => {
        xhttp.onreadystatechange = function () {
            if (this.readyState != XMLHttpRequest.DONE)
                return;

            if (this.status != 200) {
                reject("calibdb query failed with status: " + this.status)
                return
            }
            if ("error" in this.response) {
                reject(this.response.error)
                return
            }

            resolve(this.response)
        }
    })

    xhttp.send(JSON.stringify(data))

    return promise
}

const API_KEY = 0
let calibdata = null;
let IRIS_DIAMETER_MM = 11.7;
let normy=1.4;
let normx=0.8;

let fx = videoWidth*normx;
let fy = videoHeight*normy;



// Enable the live webcam view and start detection.
async function enableCam() {

  let constraints = { audio: false, video: { width: 1280, height: 720, facingMode: "environment", resizeMode: "none" } };
  let mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
  const track = mediaStream.getVideoTracks()[0];
  const cfg = track.getSettings();
//   console.log(track, cfg);
    // try {
    //     let ret = await calibdb_query(track.label, [cfg.width, cfg.height], API_KEY);
    //     if ("calib" in ret) {
    //         // Use the calibration data
    //         // calib_str = JSON.stringify(ret["calib"], undefined, 4)
    //         calibdata = ret["calib"];
    //         // console.log('Loaded calibration data from server:', calibdata);
    //     }    
    // } catch (error) {

        //load calib data from "calib_hd_webcam_c615__046d_082c__1280.json"
        calibdata = await fetch('calib_hd_webcam_c615__046d_082c__1280.json')
        .then(response => response.json())
        .then(localCalib => {
             return localCalib;
            // console.log('Loaded local calibration data:', calibdata);
        })
        .catch(err => {
            console.error('Error loading local calibration data:', err);
            return null;
        });
    // }

    // console.log('Loaded local calibration data:', calibdata);
    if (calibdata != null) {

        fx = calibdata["camera_matrix"][0][0];
        fy = calibdata["camera_matrix"][1][1];
        normx = fx / videoWidth;
        normy = fy / videoHeight;
        // console.log(normx,normy);
    }

  video.srcObject = mediaStream;
  video.addEventListener("loadeddata", predictWebcam);
  video.addEventListener("loadedmetadata", predictWebcam);
}

let lastVideoTime = -1;
let gesture_results;
let hand_results;
let face_results;
let pose_results;
let segment_results;




async function predictWebcam() {
  // Helper to draw iris ellipse and pupil
  function drawIrisEllipse(landmarks, irisIdx, pupilIdx, color='#00FF00', pupilColor='#0000FF') {
    const pupil = landmarks[pupilIdx];
    if (!pupil || !irisIdx || irisIdx.length !== 4) return null;
    const px = pupil.x * canvasElement.width;
    const py = pupil.y * canvasElement.height;
    const irisPts = irisIdx.map(idx => landmarks[idx])
      .map(pt => pt ? [pt.x * canvasElement.width, pt.y * canvasElement.height] : null)
      .filter(Boolean);
    if (irisPts.length !== 4) return null;
    // Major axis: distance between pt0 and pt2
    const dxMajor = irisPts[2][0] - irisPts[0][0];
    const dyMajor = irisPts[2][1] - irisPts[0][1];
    const major = Math.sqrt(dxMajor * dxMajor + dyMajor * dyMajor);
    // Minor axis: distance between pt1 and pt3
    const dxMinor = irisPts[3][0] - irisPts[1][0];
    const dyMinor = irisPts[3][1] - irisPts[1][1];
    const minor = Math.sqrt(dxMinor * dxMinor + dyMinor * dyMinor);
    // Rotation angle of major axis
    const angle = Math.atan2(dyMajor, dxMajor);
    // Draw iris ellipse
    canvasCtx.beginPath();
    canvasCtx.ellipse(px, py, major / 2, minor / 2, angle, 0, 2 * Math.PI);
    canvasCtx.strokeStyle = color;
    canvasCtx.lineWidth = 2;
    canvasCtx.stroke();
    // Draw pupil center
    canvasCtx.beginPath();
    canvasCtx.arc(px, py, 4, 0, 2 * Math.PI);
    canvasCtx.fillStyle = pupilColor;
    canvasCtx.fill();

    let x = fx * (IRIS_DIAMETER_MM / major) / 10.0;
    let y = fy * (IRIS_DIAMETER_MM / minor) / 10.0;

    // console.log((x+y)/2);
    let distance_to_camera = (x + y) / 2.0;


    return distance_to_camera;
  }
  const webcamElement = document.getElementById("webcam");



  const nowInMs = Date.now();
  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    gesture_results = gestureRecognizer.recognizeForVideo(video, nowInMs);
    // hand_results = handLandmarker.detectForVideo(video, nowInMs);
    face_results = faceLandmarker.detectForVideo(video, nowInMs);
    // pose_results = poseLandmarker.detectForVideo(video, nowInMs);
    // segment_results = imageSegmenter.segmentForVideo(video, nowInMs);
  }


  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  // Mirror the canvas horizontally
  canvasCtx.translate(canvasElement.width, 0);
  canvasCtx.scale(-1, 1);
  const drawingUtils = new DrawingUtils(canvasCtx);

  canvasElement.style.height = videoHeight;
  webcamElement.style.height = videoHeight;
  canvasElement.style.width = videoWidth;
  webcamElement.style.width = videoWidth;





 if (face_results.faceLandmarks) {
    for (const landmarks of face_results.faceLandmarks) {
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_TESSELATION,
        { color: "#C0C0C070", lineWidth: 1 }
      );
      // Right eye
      const distance_to_camera_R = drawIrisEllipse(landmarks, [469, 470, 471, 472], 468, '#00FF00', '#0000FF');
      // Left eye
      const distance_to_camera_L = drawIrisEllipse(landmarks, [474, 475, 476, 477], 473, '#FF00FF', '#0000FF');
      let distance_to_camera = (distance_to_camera_R + distance_to_camera_L) / 2.0;
    //   console.log(distance_to_camera);

    }
  }


  if (gesture_results && gesture_results.landmarks) {
    for (const landmarks of gesture_results.landmarks) {
      drawingUtils.drawConnectors(landmarks, GestureRecognizer.HAND_CONNECTIONS, {
        color: "#00FF00",

      });
      drawingUtils.drawLandmarks(landmarks, {
        color: "#FF0000",

      });
    }
  }
  if (pose_results && pose_results.landmarks) {
    for (const landmark of pose_results.landmarks) {
            drawingUtils.drawLandmarks(landmark, {
            radius: (data) => DrawingUtils.lerp(data.from.z, -0.15, 0.1, 2, 1)
            });
            drawingUtils.drawConnectors(landmark, PoseLandmarker.POSE_CONNECTIONS);
        }
    }




  canvasCtx.restore();
  window.requestAnimationFrame(predictWebcam);

}


enableCam();