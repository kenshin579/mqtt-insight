import { useId } from "react";

// 앱 로고 — 랜딩 페이지 로고와 동일 지오메트리 + 데이터 점 ("라이브 포인트").
// gradient id는 인스턴스마다 useId로 발급 (동일 화면에 여러 개 렌더돼도 충돌 없음).
export function Logo({ size }: { size: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4f8cff" />
          <stop offset="1" stopColor="#9f6bff" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="5" fill={`url(#${id})`} />
      <path
        d="M6 15.5 9.5 10l3 4 2.5-5 2.5 5.4"
        stroke="#fff"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="17.9" cy="15.2" r="1.7" fill="#fff" />
    </svg>
  );
}
