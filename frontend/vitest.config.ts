import { defineConfig } from "vitest/config";

// vitest 전용 설정. vite.config.ts의 @vitejs/plugin-react(v2)는 테스트 환경에서
// HMR preamble을 주입하지 못해 .tsx 렌더가 실패한다. 테스트에서는 플러그인 없이
// vitest 기본 트랜스폼(tsconfig의 jsx: react-jsx)으로 JSX를 변환한다.
export default defineConfig({});
