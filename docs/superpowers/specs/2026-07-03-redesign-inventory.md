# first-redesign 요구사항 레지스트리 (인벤토리)

> 작성일: 2026-07-03 · 원본: `docs/design/first-redesign/` (README.md + MQTT Insight Redesign.dc.html 전수 분석)
> 본 문서는 [first-redesign 스펙](2026-07-03-first-redesign-design.md)의 요구사항 레지스트리다.
> **처분(Disposition) 규칙**: A~E 항목 = `구현(HTML대로)` 기본. `[SIM]` 표기 항목 = `제외`(README 시뮬레이션 제외 목록). F/G 항목 = 스펙 §3 결정 테이블의 결정값을 따름. 어떤 항목도 "미언급" 상태로 남지 않는다.

---

## A. 뷰 인벤토리

- **A1. Welcome (온보딩)** — 첫 실행 안내 + 연결 CTA. 진입: `view==='welcome'`(미연결 && 프로필 0) 또는 타이틀바 `?`(→F6 결정). 이탈: CTA→연결 모달, 연결 성공→Main App. 중앙 정렬 fadeIn .3s, max-width 640. 2단계 카드의 `#`는 별도 mono span.
- **A2. Connection Home (프로필 런처)** — 진입: 미연결 && 프로필≥1 (연결 해제 후·마지막 프로필 아닌 삭제 후 포함). 이탈: 연결(버튼/카드 더블클릭), 마지막 프로필 삭제→Welcome. mount 시 첫 프로필 자동 선택.
- **A3. Main App (3-pane)** — 진입: 연결 성공. 재연결/끊김 중에도 유지(배너). 이탈: 연결 해제→Home(프로필 0이면 Welcome). 레이아웃: 트리 316px | 메시지 flex:1 | 발행 176/316px.
- **A4. 연결 모달 (460px, radius 14)** — 진입: Welcome CTA, 연결 바 버튼, Home "+ 새 연결", Home "편집"(고급 탭 프리필). 이탈: 취소/백드롭/연결 성공. 오류 배너·프로필 칩·빠른/고급 탭 포함.
- **A5. 설정 모달 (480px, radius 14)** — 진입: 타이틀바 ⚙(모든 뷰). 이탈: 완료, 헤더 ✕(26×26 radius 7), 백드롭. 설정 즉시 적용.
- **A6. 토픽 컨텍스트 메뉴** — 진입: 트리 행 ⋯ 클릭 또는 우클릭. 이탈: 항목 클릭/백드롭 클릭·우클릭. min-width 176, radius 9, z-210 (z-200 캐처 위).
- **A7. 기록 최초 토스트** — 기록 최초 활성화 시(세션당 1회→config 영속, G 결정). 6.5초 자동 소멸. 하단 중앙, max-width 430, z-300.
- **A8. 연결 중 오버레이** — status `connecting`. 전면 dim `rgba(10,10,14,.45)` z-90, 스피너+라벨+취소 카드. (F19: 오버레이 방식 채택)
- **A9. 재연결 배너(노랑)** — status `reconnecting`. 연결 바 아래. 스피너+메시지+[지금 재시도][중단].
- **A10. 끊김 배너(빨강)** — `disconnected && view==='app'`. ⚠+메시지+[다시 연결](solid red). 데이터 보존.
- **A11. 공통 크롬** — 타이틀바 38px(트래픽라이트 점, 16px 그라디언트 아이콘+"MQTT Insight" 12.5px/600, `?`·`⚙` 24×24 radius 6) + 연결 바 44px(상태 점 9px+halo 3px, 상태 텍스트 12.5px/600, host:port mono 12px dim, 연결 해제 outline/브로커 연결 accent 버튼 — 연결 중/재연결 중엔 버튼 없음).
- **A12. 구독 empty state**(트리 패널 내) — 연결됨 && 구독 0 && 토픽 0. ↯ 42×42 ringpulse, 타이틀·힌트, "모든 토픽 구독 #" accent 전체폭, 특정 토픽 input+구독, flood 각주.
- **A13. 메시지 패널 empty state 3종** — (a) 토픽 미선택: `←` 아이콘, (b) 선택했지만 메시지 없음: `◇`, (c) 검색 결과 0(피드는 비어있지 않음): `⌕`.
- **A14. Home 미선택 empty state** — `←` + homeSelectTitle/Hint.
- **A15. 트리 1회성 힌트 카드** — 표시 조건: F17 결정(구독 존재 시). ⋯ 아이콘+메시지+✕. 닫으면 config 영속.
- **A16. 프로토타입 데스크 프레임** — **[SIM] 제외** (1160×760 창 목업; 실앱은 Wails 창 채움).

## B. 컴포넌트 인벤토리

**공통 크롬**
- B1. `?` 버튼 — 24×24 radius 6 border --btnborder, tooltip D1.
- B2. ⚙ 버튼 — 동일 스펙, font 14, tooltip D2.
- B3. 상태 점 — 9px; 연결 `#43c463`/연결·재연결 중 `#febc2e`/안 됨 `#6a6a76`; halo 3px: 성공·경고 18% 알파, 끊김 `rgba(120,120,130,.15)`(E9 결정). 프로토타입의 클릭 simDrop은 **[SIM] 제외**.
- B4. 상태 라벨 — 12.5px/600, 4종(D3~D6).
- B5. 브로커 라벨 — mono 12px --dim, `host:port`, 미연결 시 빈 값.
- B6. 연결 해제 버튼 — outline, padding 6/13, radius 7, 12px/500.
- B7. 연결 버튼(바) — accent, padding 7/15, radius 7, 12px/600.

**Welcome**
- B8. 히어로 아이콘 — 60×60 radius 15 `linear-gradient(135deg,#4f8cff,#7b5cff)` ◈ 30px, shadow `0 12px 30px rgba(79,140,255,.35)`.
- B9. H1 25px/700 ls-.4 / 서브 14px/1.6 --dim max-width 470.
- B10. 3단계 카드 — 가로 3열 gap 12, radius 11 padding 16; 번호 뱃지 26×26 radius 8 bg `rgba(79,140,255,.15)` `#6ba0ff` 13px/700; 타이틀 13px/600; 설명 11.5px/1.5 dim. 카드2에 mono `#` span(--text2).
- B11. CTA — accent padding 12/26 radius 9 13.5px/600.

**Connection Home**
- B12. 좌측 패널 — 300px --pane 우측 보더; 헤더 "연결 · N" uppercase 11px/700 --dim3.
- B13. 프로필 카드 — padding 10/11 radius 9 gap 10; 기본 card+--border/선택 `rgba(79,140,255,.12)`+`#4f8cff`/hover 보더 accent. 8px 파란 점, 이름 13px/600 ellipsis, host:port 11px mono dim, 전송 뱃지(uppercase 9px/700 --input bg radius 5). 클릭=선택(+오류 클리어), **더블클릭=즉시 연결**.
- B14. "+ 새 연결" — 전체폭 --chip bg dashed border padding 10 radius 9 12.5px/600, 하단 고정.
- B15. 우측 상세 — max 440 중앙: 52px 아이콘(radius 14), 이름 21px/700, `transport://host:port` 13px mono dim; 정보 카드 2(전송 방식/포트; 라벨 10px uppercase, 값 13px/600, 포트 값 mono).
- B16. 큰 연결 버튼 — 전체폭 accent padding 13 radius 10 14px/600.
- B17. 인라인 오류 배너 — ⚠+메시지, bg `rgba(229,72,77,.09)` border `.35` radius 9 padding 10/12 12px `#e07075` fadeIn .2s.
- B18. 편집/삭제 — outline padding 7/16 radius 8 12px/500; 삭제 `#e5484d`. 삭제 확인 다이얼로그 추가(F27 결정).

**트리 패널**
- B19. 토픽 필터 — 행 padding 9/11; 래퍼 --input radius 7 padding 5/9; ⌕ 12px --dim2; input mono 12px, placeholder D19.
- B20. 구독 칩 행 — padding 8/11 wrap; 라벨 "구독 중" uppercase 10px/700 --dim3.
- B21. 구독 칩 — mono 10.5px bg `rgba(79,140,255,.13)` border `.35` `#6ba0ff` radius 14 padding 3/4/3/8; `pattern` 또는 `pattern · qN`(QoS≠0만); 내부 ✕(tooltip D24).
- B22. "+ 추가" 칩 — dashed --dim 10.5px radius 14; 인라인 추가 행 토글.
- B23. 인라인 추가 행 — bg --input padding 8/11: 패턴 input(mono 11.5 placeholder D24)+QoS select(q0/q1/q2)+accent 구독 버튼. 중복 무시, 제출 후 입력·QoS 리셋.
- B24. 트리 헤더 — "토픽 트리 · N" 10.5px/600 uppercase --dim3.
- B25. 힌트 카드 — bg `rgba(79,140,255,.08)` border `.25` radius 8 margin 8/10/2 padding 9/11; ⋯ `#6ba0ff`; 텍스트 11px/1.55 --dim; ✕.
- B26. 트리 행 — 26px, gap 7, padding-left `8+depth*15`: 캐럿(14px 슬롯 ▾/▸/공백 9px --dim2) → 기록 ●(8px `#e5484d`) → 이름(mono 12px; leaf --treename 400/branch --treebranch 600; 선택 leaf --text) → 카운트 pill(>0만; 9.5px/600 bg `rgba(79,140,255,.18)` `#6ba0ff` radius 10; **브랜치=재귀 합**) → R 뱃지(9px/700 bg `rgba(217,130,43,.2)` `#d9822b` radius 4, cursor:help, tooltip D38) → 미리보기(leaf만, 34자, mono 10.5px --faint) → ⋯(13px --dim opacity .6→1, tooltip D27). 상태: hover --hoverbg / 선택 `rgba(79,140,255,.16)`+좌 2px accent / **비구독 매칭 행 opacity .45**. 레벨별 localeCompare 정렬.
- B27. empty state 위젯 — ↯ 42×42 radius 12 bg `rgba(79,140,255,.12)` border `.3` `#6ba0ff` ringpulse 2s; accent 전체폭 버튼 내 `#` mono 칩(`rgba(255,255,255,.2)` radius 5); input+구독; 각주 10.5px --dim2.

**메시지 패널**
- B28. 툴바 — padding 8/12 gap 8 wrap: 토픽명(mono 12px/600 `#6ba0ff`, 전체 뷰 --dim D32, max 42% ellipsis) · msg/s(10.5px mono --dim2, `X.X msg/s`, 최근 5초 수신>0일 때만, 전역 집계=F4) · 기록 뱃지(`● 기록 중` 10px/700 `#e5484d` bg `rgba(229,72,77,.12)` border `.3` radius 12) · 실시간/기록 세그먼트(--input 래퍼 radius 7 padding 2; 버튼 10.5px/600 radius 5 padding 3/9, 활성 accent 흰 글씨) · 스페이서 · ⌕(활성 시 accent) · 일시정지/재개(일시정지 중 accent) · 지우기. `hasTree` 전까지 버튼 숨김.
- B29. 검색 행 — 툴바 아래 확장(--input bg fadeIn .15s): ⌕+mono 12px input(placeholder D36)+`N / M` 카운터(쿼리 있을 때만)+✕. payload substring 대소문자 무시, 전체 뷰에선 토픽명도 매치.
- B30. 메시지 행 — 23px mono 11.5px gap 9 padding 0/11: 시각(--faint; 절대 HH:MM:SS(en-GB) 또는 상대) → 토픽(`#6ba0ff` 전체 뷰만) → 미리보기(ellipsis --text2) → R 뱃지 → `qN`(--faint cursor:help tooltip D39). hover --hoverbg; 선택 `rgba(79,140,255,.12)`(트리보다 옅음).
- B31. empty state — 아이콘 22px opacity .5, 타이틀 12.5px/600 --dim, 힌트 11.5px max 280 --faint.

**메시지 상세**
- B32. 상세 패널 — flex 0 0 44%, 좌 --line 보더, bg --detail, fadeIn .2s. 메시지 선택 시 표시(토픽 선택 시 최신 자동 선택=F1).
- B33. 헤더(sticky) — "메시지" 10.5px/600 uppercase --dim3; 포맷 탭 JSON/Plain/Hex/Base64(10.5px/600 radius 5 padding 3/8; 활성 accent 흰/비활성 --chip --dim); Diff 버튼(활성 `#d9822b` 흰; tooltip D40).
- B34. 메타 — mono 11px --dim lh 1.7: `topic <v>` / `time <HH:MM:SS> · qos N · <size> B` / 선택적 `props content-type=… · response-topic=… · k=v`(" · " 조인).
- B35. 본문(일반) — pre mono 12px/1.6 --payload pre-wrap break-all. JSON=2칸 pretty / Plain=원문 / Hex=소문자 바이트쌍 공백 조인 / Base64.
- B36. 본문(diff) — 키 단위 행 + `{`/`}` 래퍼, 마지막 외 콤마; 행 radius 4 padding 0/6 margin 0/-6: 변경 `rgba(254,188,46,.14)`+dim ` ← 이전값` / 추가 `rgba(67,196,99,.14)` / 삭제 `rgba(229,72,77,.12)`+취소선+--dim; 미변경 일반 표시. diffOn && fmt JSON && 현재·직전 둘 다 JSON 객체(배열 제외)일 때만; 아니면 일반 폴백(버튼은 활성 유지=F15).

**발행 패널**
- B37. 패널 — bg --pane2 padding 10/12 gap 8, 176px 접힘/316px 펼침.
- B38. 헤더 행 — "발행" uppercase 10.5px/700 --dim3 + 조건부 힌트 D42 pubFilledNote(10.5px `#6ba0ff`; 토픽 직접 수정 시 소멸).
- B39. 발행 행 — 토픽 input(mono 12px placeholder D42, --input radius 7 padding 8/10)+QoS select+retain 체크(accent-color)+발행 버튼(padding 8/18 radius 7 12px/600; 토픽 없음/미연결 시 --btnborder bg 비활성).
- B40. 속성 토글 — `▸/▾ 속성`(+` · N` 개수), 11px/600 --dim; 3.1.1 연결 시 opacity .45 비활성 + D43 안내.
- B41. 속성 섹션 — content-type input(placeholder 로컬라이즈=F34)+response topic input 나란히; user-prop 행(key/value+✕)+`+ user property` dashed. 전부 11.5px mono.
- B42. 페이로드 textarea — flex:1 mono 12px radius 8 padding 9/11 placeholder `{"value": 23.5}` resize none.

**연결 모달**
- B43. 백드롭 — `rgba(10,10,14,.55)` blur 3px z-100 fadeIn .18s; 클릭 닫기.
- B44. 다이얼로그 — 460px max-height 88vh scroll --modal radius 14 shadow `0 30px 80px rgba(0,0,0,.5)`.
- B45. 제목/서브 — D45, 17px/700 / 12px --dim.
- B46. 오류 배너 — B17 스펙; errNoHost/errUnknownHost+`{host}` 치환(+F33 신규 키). 실패 시 모달 유지.
- B47. 저장된 프로필 섹션(0개면 숨김) — 라벨+힌트 D46 + 칩 행: "+ 새 연결" 칩(dashed; 미선택 시 파랑 강조; 클릭 시 폼 리셋) + 프로필 칩(11.5px radius 20 padding 6/12 6px 점; 선택 accent 강조). 필드 직접 수정 시 선택 해제.
- B48. "연결 정보" 구분선 — uppercase 라벨 + 1px --line.
- B49. 탭 세그먼트 — --input 래퍼 radius 9 padding 3; 빠른 연결/고급 설정(12px/600 radius 7 padding 7; 활성 --chip+--text).
- B50. 빠른 탭 — 호스트(mono 13px placeholder localhost)/포트(mono)/전송 방식 select(TCP/TLS/WebSocket/WebSocket Secure); dashed 힌트 박스 D48.
- B51. 고급 탭 — **G1 결정으로 확장**: 프로필(이름 placeholder D49·MQTT 버전 5.0|3.1.1) / 연결(호스트·포트·전송 방식·clientId·keepAlive·cleanSession·자동 재연결) / 인증(아이디·비밀번호) / TLS(tls·wss시: CA 경로·시스템 CA·검증 생략) / WS(ws·wss시: 경로) / LWT(토픽·페이로드·QoS·retained). 편집 시 전 필드 프리필(F14 해소).
- B52. 푸터 — 연결(flex:1 accent padding 11 radius 9)+취소(outline).

**설정 모달**
- B53. 헤더(sticky) — ⚙ 16px+"설정" 17px/700+✕ 26×26 radius 7.
- B54. 섹션 헤더 — 일반/메시지 표시/데이터, 10.5px/700 uppercase --dim3.
- B55. 세그먼트 — --input 래퍼 radius 9 padding 3; 옵션 flex:1 12px/600 radius 7 padding 8/6, 활성 accent 흰. 행: 언어(한국어/English 하드코딩 라벨)/테마(다크/라이트/시스템)/기본 페이로드 형식(+힌트)/타임스탬프(절대/상대+힌트)/메시지 정렬(최신/오래된).
- B56. 버퍼 슬라이더 — 라벨+현재값(12px/600 `#6ba0ff` mono)+힌트; range 50–500 step 10 accent-color. 즉시 적용(G7 결정).
- B57. 푸터 — 전체폭 accent "완료" + --line 구분.

**컨텍스트 메뉴/토스트/배너**
- B58. 메뉴 — --modal radius 9 padding 4 min-width 176 shadow `0 10px 30px rgba(0,0,0,.4)`; 커서 위치(clamp innerWidth−190/innerHeight−130; ⋯ 트리거는 버튼 rect bottom+4). 항목(12px padding 7/11 radius 6 hover --chip): 이 토픽에 발행 · 기록 켜기/끄기(브랜치 숨김=F31) · Retained 삭제(retained만). Unsubscribe 없음(G2 결정).
- B59. 기록 토스트 — --modal radius 11 padding 12/16, 빨간 ● 11px, 12px/1.55, shadow `0 14px 40px rgba(0,0,0,.4)`.
- B60. 연결 중 오버레이 — 카드 radius 12 padding 22/30; 스피너 16px spin .7s; 라벨 13px/500; 취소 outline.
- B61. 재연결 배너 — padding 8/14 bg `rgba(254,188,46,.09)` 하단 border `.3`; 스피너 13px spin .8s 노랑; 텍스트 12px/600 `#e0b24a`; [지금 재시도] 노랑 outline; [중단] 중립 outline.
- B62. 끊김 배너 — padding 8/14 bg `rgba(229,72,77,.09)` border `.3`; ⚠ `#e5484d`; 텍스트 12px/600 `#e07075`; [다시 연결] solid `#e5484d` 흰.
- B63. 스크롤바 — webkit 9px, thumb `rgba(128,128,140,.4)` radius 6, 트랙 투명.

## C. 인터랙션 인벤토리

- C1. `?` → **F6 결정**: 세션 유지, 연결 중이면 Welcome 오버레이(닫기), 미연결이면 뷰 전환. (프로토타입의 세션 초기화는 제외)
- C2. ⚙ → 설정 모달(모든 뷰).
- C3. 연결 바 "브로커 연결" → 연결 모달(빠른 탭, 오류 클리어, **폼 값 유지**=F8).
- C4. 연결 해제 → Home(프로필 0이면 Welcome), 첫 프로필 선택, broker/subs/topics/선택/recording 세트/일시정지/msgSource 초기화. **수동 해제는 데이터 클리어**(끊김만 보존).
- C5. Welcome CTA → 연결 모달.
- C6. Home 카드 클릭=선택+오류 클리어; 더블클릭=즉시 연결.
- C7. Home 연결 → 연결 시작.
- C8. Home "+ 새 연결" → 모달 빠른 탭 **폼 리셋**(host '', port 1883, tcp, 5.0, autoReconnect true).
- C9. Home 편집 → 모달 고급 탭 **전 필드 프리필**(F14 해소; 실제 프로필의 모든 저장 필드).
- C10. Home 삭제 → **확인 후**(F27) 삭제, 첫 남은 프로필 선택, 없으면 Welcome.
- C11. 모달 연결 → 이름 비면 host로 기본값; 연결 시작.
- C12. 연결 로직 — [SIM 1100ms 지연/호스트 화이트리스트 제외] 실제 Connect 호출; 성공 시 view app·모달 닫기·데이터 리셋·msgSource live·프로필 자동 저장(host+port 중복 제외).
- C13. 연결 중 취소 → CancelConnect; 모달 열려 있으면 유지(F29).
- C14. 상태 점 클릭 simDrop — **[SIM] 제외**.
- C15. 재연결 사이클 — [SIM 구조] 실제: 백엔드 구조화 이벤트 `{state:"reconnecting", attempt}` 기반, 카운트다운 없음(질문1 B안). "재연결 시도 중… (시도 n)" 표시.
- C16. [지금 재시도] → 즉시 Connect 재호출; [중단] → Disconnect(→끊김 배너, view 유지).
- C17. 끊김 배너 [다시 연결] → Connect 재호출.
- C18. 끊김/재연결 중: 트리·메시지 보존, 발행만 비활성.
- C19. 구독 추가 3경로: empty state `#` 버튼(q0)/empty state input+구독(q0)/칩 행 "+ 추가"(패턴+QoS). trim, 빈 값 무시, 중복 무시(입력은 클리어).
- C20. 칩 ✕ → 구독 해지(Unsubscribe 패턴). 매칭 잃은 토픽 행 opacity .45(데이터 보존).
- C21. 필터 입력 → **전체 토픽 경로** substring(대소문자 무시), 매칭 토픽 기준 트리 재구성(조상 보존)(F21).
- C22. 트리 행 클릭 → 브랜치면 토글, 항상 selectTopic: selectedTopic 설정, **최신 메시지 자동 선택**(F1), 발행 토픽 채움+힌트, msgSource live 리셋. 브랜치 기본 펼침(G11).
- C23. 행 우클릭/⋯ → 컨텍스트 메뉴(커서 위치 clamp).
- C24. 메뉴 항목 — 발행 토픽 채움 / 기록 토글(최초 1회 토스트 6.5s, config 영속) / Retained 삭제(실구현: 빈 retained 발행 — 기존 deleteRetained 재사용=G9).
- C25. 힌트 ✕ → treeHintDismissed=true, **config 영속**.
- C26. ⌕ 토글 → 검색 행 열기/닫기; 닫으면 쿼리 클리어.
- C27. 검색 입력 → 라이브 필터; 필터 중 신규 매치 유입.
- C28. 일시정지 — **F24 결정**: 표시만 정지(링버퍼·msg/s 계속). 버튼 accent+라벨 재개.
- C29. 지우기 — 토픽 선택 시 해당 토픽만/미선택 시 전체(F3); selectedMsg 클리어; 트리 카운트 유지.
- C30. 메시지 행 클릭 → 선택(상세 열림).
- C31. 실시간/기록 토글(기록 중 토픽만) — 기록=QueryRecorded 스냅샷+Refresh 버튼(F16/G3 결정), 실시간=History.
- C32. 포맷 탭 → fmt 세션 전역(초기=settings.defaultFormat)(G5/G16).
- C33. Diff 토글 → diffOn; 켜면 fmt JSON 강제. 토픽 바꿔도 유지; 비교 불가 시 일반 폴백(버튼 활성 유지).
- C34. 툴팁(native title): R/qN/Diff/⋯/칩 ✕/⌕/?/⚙.
- C35. 발행(토픽+연결 시만) → 실제 Publish; 발행 후 **해당 토픽·새 메시지 자동 선택**(F2, 30ms).
- C36. 속성 토글 → 176→316px 확장; 3.1.1 비활성+안내; content-type/response topic/user-prop 행; 개수 뱃지=채워진 필드 수.
- C37. 발행 토픽 직접 수정 → 힌트 소멸.
- C38. 설정 — 전 항목 즉시 적용+저장(G6/G7); 기본 포맷 변경 시 열린 상세 포맷도 즉시 전환(F7); 언어 즉시 전환; 테마 맵 스왑; 시스템=matchMedia+**change 리스너**.
- C39. 버퍼 슬라이더 → SetCapacity 즉시 적용.
- C40. 애니메이션 — fadeIn(뷰 .3/.25, 상세 .2, 배너·칩 .2, 모달 .18, 검색 .15), ringpulse 2s, spin .7/.8s.
- C41. 타이머 — 데모 생성기/시드/[SIM 지연들] **제외**; 기록 토스트 6.5s·발행 상세 선택 30ms **유지**; 상대시각 1s ticker **추가**(F25).
- C42. 키보드 — **F28 결정으로 추가**: Enter 제출(연결 모달/구독 입력/검색), Esc 닫기(모달/메뉴/검색).
- C43. hover 정의 — home 카드(accent 보더)/트리 행/⋯/메시지 행/메뉴 항목만. 일반 버튼 hover 없음(그대로).

## D. 카피 인벤토리 (`T` 딕셔너리 — 원본은 프로토타입 HTML L638–757)

전 키를 `lib/i18n.ts`로 이식한다(ko/en 패리티 테스트 포함). 키 목록:
- D1~D9: tourTitle, setTitle, statusConnected/Connecting/Reconnecting/Disconnected, btnDisconnect, btnConnectShort, 앱명 "MQTT Insight"(비번역)+◈
- D10~D15: welcomeTitle/Sub, step1~3 Title/Desc, welcomeCta
- D16~D18: homeTitle/New/Connect/Edit/Delete, homeSelectTitle/Hint, lblTransport/lblPort
- D19~D28: filterPh, subEmptyTitle/Hint, subAll, subSpecificPh, subBtn, floodHint, subsLabel, addSub, addSubPh, addSubBtn, unsubTitle, treeHeader, ~~treeAdd(F30 제거)~~, treeHintMsg, rowMenuTitle, 칩 포맷 `pattern · qN`
- D29~D31: menuPublish/RecOn/RecOff/DelRetained, recBadge, srcLive/srcRec, recToastMsg
- D32~D41: headerAll, btnPause/Resume/Clear, msgSelectTitle/Hint, msgEmptyTitle/Hint(+기록 전용 empty 신규 키=G4), searchTitle/Ph/NoRes/NoResHint, detailHeader, 포맷 탭 라벨(비번역), retainedTip, qosTip, diffTip, 메타 리터럴(topic/time/props/qos/B/msg/s 등)
- D42~D44: pubHeader, pubFilledNote, pubTopicPh, pubBtn, pubProps, props311, propAddUser, placeholder들(content-type 로컬라이즈=F34)
- D45~D50: connModalTitle/Sub, tabQuick/Advanced, savedProfiles, newConn, loadHint, detailsLabel, lblHost/Port/Transport, quickHint, lblProfileName/profileNamePh, lblVersion/User/Pass, autoReconnect, btnConnect/Cancel, connecting (+G1 신규 필드 라벨: clientId/keepAlive/cleanSession/TLS 관련/wsPath/LWT 관련 — 신규 집필)
- D51~D56: errNoHost, errUnknownHost(+F33 신규: errAuth/errTls/errRefused/errTimeout/errGeneric), reconnMsg(카운트다운 변형→"(시도 {n})" 버전 채택), retrying, retryNow, stopRetry, droppedMsg, reconnectBtn, ~~simDropTitle(SIM 제거)~~
- D57~D63: secGeneral/Messages/Data, setLanguage(라벨 하드코딩), setTheme+themeDark/Light/System, setDefaultFmt+Hint, setTsFormat+tsAbsolute/Relative+Hint, setSort+sortNew/Old, setBuffer+Hint, setDone, 상대시각 포맷(ko N초 전/en Ns ago)

## E. 디자인 토큰

- E1. 토큰 테이블 20종 — README 표 = HTML DARK/LIGHT 맵 일치. 채택.
- E2. HTML 추가 토큰 — `--treename`(#d6d6de/#2a2a33), `--treebranch`(#c0c0ca/#45454f) **포함**. `--desk`는 [SIM] 제외.
- E3. 고정색 — accent `#4f8cff`, accent-light `#6ba0ff`, 성공 `#43c463`, 경고 `#febc2e`, 오류 `#e5484d`, retained/diff `#d9822b`, 그라디언트 파트너 `#7b5cff`, 배너 텍스트 `#e0b24a`/`#e07075`. 트래픽라이트는 [SIM] 프레임용 — 실앱 타이틀바 점 3개는 장식으로 유지(A11).
- E4. 알파 팔레트 — accent 계열 .08/.12/.13/.15/.16/.18/.25/.3/.35/.45, 오류 .09/.12/.3–.35, 경고 .09/.14/.3/.4, retained .2/.14 — HTML 값 그대로.
- E5. 타이포 — Inter(또는 system-ui) + JetBrains Mono(또는 기존 mono). **외부 폰트 로드 없이 시스템 폴백 우선**(오프라인 데스크톱 앱; Google Fonts 미사용).
- E6. radius 체계 — 4~20px 용도별(HTML 값 그대로).
- E7. 그림자 — 모달/메뉴/토스트/히어로/halo 값 그대로.
- E8. 테마 메커니즘 — `data-theme` 유지 + 토큰 전면 확장, system=matchMedia+리스너.
- E9. 끊김 halo — HTML 값 `rgba(120,120,130,.15)` 채택.
- E10. 인라인 fallback 무시 — 토큰 맵이 정답.

## F. 갭 분석 (34건) — 처분: 스펙 §3 결정 테이블 참조
F1(토픽 선택 시 최신 메시지 자동 선택=채택) F2(발행 후 자동 선택=채택) F3(지우기 범위=채택) F4(msg/s 전역=채택) F5(브랜치 재귀 카운트·선택·미리보기 leaf만=채택) F6(?=세션 유지 결정) F7(설정 ✕·즉시 포맷 반영=채택) F8(모달 진입별 폼 리셋 차이=채택) F9(검색 닫기 클리어·카운터·아이콘=채택) F10(메뉴 위치 clamp=채택) F11(애니/z-index/그림자/스크롤바=채택) F12(전체 피드 150 캡=채택) F13(메타 상세=채택) F14(편집 프리필=전 필드로 해소) F15(diff 폴백 시 버튼 유지=채택) F16(Recorded=Refresh 유지 결정) F17(힌트 표시 조건=HTML 채택: 구독 존재 시) F18(고급 탭=G1 신규 설계) F19(연결 중=오버레이 채택) F20(halo=HTML 채택) F21(필터=전체 경로) F22(반응형=창 크기 대응, 고정폭 패널+flex) F23(diffTip="바뀐 값" 딕셔너리 채택) F24(일시정지=표시만) F25(상대시각 ticker 추가) F26(재구독 un-dim=파생 상태로 자연 해소) F27(삭제 확인 추가) F28(키보드 추가) F29(취소 후 모달 유지) F30(treeAdd 제거) F31(브랜치 기록 숨김) F32(일시정지 중 발행=발행됨) F33(오류 카피 신규 집필) F34(placeholder 로컬라이즈)

## G. 기존 기능 유실 위험 (19건) — 처분: 스펙 §3 결정 테이블 참조
G1(고급 탭 전 필드=신규 설계 포함) G2(정확 토픽 unsub=디자인대로 제거) G3(Recorded Refresh=유지) G4(기록 empty 카피=신규 키) G5(자동 포맷 감지=설정 기본값으로 대체) G6(설정 즉시 적용=채택) G7(버퍼 즉시 적용=SetCapacity 구현) G8(발행 fallback=디자인대로 제거) G9(base64/Wails 심=보존) G10(RecordedTopics 초기화=보존) G11(트리 기본 펼침+경로 필터+높이 수정) G12(History 권위 소스 구조=보존) G13(Recorded stuck 가드=보존) G14(ContextMenu Esc=보존) G15(테마 메커니즘=확장) G16(fmt sticky=디자인대로 변경) G17(props 한 줄 조인=디자인대로 변경) G18(Sub #=empty state에서만) G19(원문 에러=errGeneric에 병기)
