import './loading.css';

export default function LoadingScreen() {
  return (
    <main className="aog-loading-screen" role="status" aria-live="polite" aria-label="Cargando Age of Geocracy">
      <div className="aog-loading-center">
        <h1 className="aog-loading-brand">
          <span className="aog-loading-age">AGE OF</span>
          <span className="aog-loading-geocracy">GEOCRACY</span>
        </h1>
        <div className="aog-loading-status">
          <span>CARGANDO</span>
          <span className="aog-loading-dots" aria-hidden="true"><i /><i /><i /></span>
        </div>
        <div className="aog-loading-progress" aria-hidden="true"><span /></div>
      </div>
    </main>
  );
}
