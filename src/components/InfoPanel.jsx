const panels = [
  {
    title: 'Interpupillary distance (IPD)',
    body:
      'Overlayed red guides measure the spacing between iris centers. Average iris diameter is used to give an approximate value in millimeters.',
  },
  {
    title: 'Face breadth',
    body:
      'Green markers track the widest detected points across the face oval, translating pixel distance into a breadth estimate.',
  },
  {
    title: 'Nasal profile',
    body:
      'Blue and orange overlays visualise bridge height and nose flare angle, helping you compare profiles between sessions.',
  },
  {
    title: 'Camera distance',
    body:
      'Purple metric estimates how far you are from the lens using the iris scale and an assumed webcam field of view.',
  },
  {
    title: 'Body anchors',
    body:
      'Yellow joints track shoulders, elbows, wrists, and hips when they are inside the frame, helping you monitor overall posture.',
  },
]

function InfoPanel() {
  return (
    <section className="info-panel">
      <h2 className="section-heading">What the overlay is showing</h2>
      <div className="info-grid">
        {panels.map((panel) => (
          <article className="info-card" key={panel.title}>
            <h3>{panel.title}</h3>
            <p>{panel.body}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

export default InfoPanel
