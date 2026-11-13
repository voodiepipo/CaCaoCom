export default function PlotMap({ variant = "legacy", label, className = "" }) {
  const gps = variant === "gps";
  return (
    <div className={`plot-map ${gps ? "gps" : "legacy"} ${className}`}>
      <svg viewBox="0 0 200 130" preserveAspectRatio="xMidYMid slice" role="img" aria-label={`${variant} plot map`}>
        <defs>
          <pattern id={`tex-${variant}`} width="6" height="6" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1" fill="rgba(0,0,0,.18)" />
          </pattern>
        </defs>
        <rect width="200" height="130" fill={gps ? "#3d4a2c" : "#6b6a45"} />
        <rect width="200" height="130" fill={`url(#tex-${variant})`} />
        
        {/* ครอบเฉพาะเส้นถนนและแปลงที่ดินด้วย <g> แล้วหมุนข้างในนี้ ขนาดกรอบด้านนอกจะไม่เพี้ยนครับ */}
        <g transform="rotate(-15 100 65)">
          <path d="M150 0 L120 130" stroke="#c9b98a" strokeWidth="4" opacity=".7" />
          {gps ? (
            <polygon
              points="55,25 120,15 150,55 165,95 110,120 45,105"
              fill="rgba(255,255,255,.18)"
              stroke="#f4d03f"
              strokeWidth="2.5"
            />
          ) : (
            <polygon
              points="110,25 150,35 160,90 120,105 100,70"
              fill="rgba(255,255,255,.06)"
              stroke="#f4d03f"
              strokeWidth="1.2"
            />
          )}
        </g>
      </svg>
      {label && <span className="map-badge">{label}</span>}
    </div>
  );
}