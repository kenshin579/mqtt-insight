# mqtt-insight 수동 E2E 체크리스트

릴리스/머지 전 실제 GUI로 확인하는 시나리오. 로컬 브로커 준비:

```bash
docker run -d --name mosq -p 1883:1883 eclipse-mosquitto:2 \
  sh -c "printf 'listener 1883\nallow_anonymous true\n' > /mosquitto/config/mosquitto.conf && exec mosquitto -c /mosquitto/config/mosquitto.conf"
```

앱 실행: `wails dev` (또는 `wails build` 후 `open build/bin/mqtt-insight.app`)

## 연결
- [ ] Connect… → localhost:1883, Version 5.0 → Connect → 상단 점 초록/"Connected"
- [ ] Disconnect → "Disconnected" → Version 3.1.1로 재연결 성공
- [ ] 잘못된 포트(예: 1999)로 연결 → 실패 사유 표시, 앱 정상 동작

## 구독 · 트리
- [ ] "Sub #" 클릭 후 `docker exec mosq mosquitto_pub -t sensors/room1/temp -m 23.4 -r -q 1`
- [ ] 트리에 `sensors/room1/temp` 계층 생성, 카운트/미리보기/retained 표시
- [ ] 필터 입력 시 트리 검색 동작

## 컨텍스트 메뉴 (우클릭)
- [ ] "이 토픽에 발행" → 발행 패널 topic 입력이 해당 토픽으로 채워짐
- [ ] "기록 켜기" → ● 표시 / 다시 "기록 끄기" → ● 사라짐
- [ ] retained 노드에서 "Retained 삭제" → 브로커 재구독 시 해당 retained 미수신
- [ ] "Unsubscribe" → 이후 해당 토픽 발행이 수신되지 않음 (# 재구독으로 복구)
- [ ] 메뉴 밖 클릭/Esc로 닫힘

## 메시지 뷰
- [ ] 토픽 선택 → 히스토리 표시(중복 없음), 메시지 클릭 → 상세
- [ ] 포맷 전환 plain/json/hex/base64 동작, JSON payload 자동 감지
- [ ] 다른 메시지 선택 시 포맷 자동 재감지
- [ ] Pause 중 수신 멈춤 → Resume 후 재개, Clear 동작

## Recorded 뷰
- [ ] 기록 켠 토픽에 메시지 여러 개 발행 → Live/Recorded 토글 표시됨
- [ ] Recorded 전환 → 기록된 메시지 표시(타임스탬프 정상), Refresh 동작
- [ ] 기록 안 켠 토픽에서는 토글 미표시
- [ ] 앱 재시작 후에도 기록 토픽에 ● 표시 유지(RecordedTopics 초기화)

## 발행 + v5 속성
- [ ] 기본 발행(topic/payload/QoS/retain) → 수신 반영
- [ ] "MQTT 5.0 Properties" 펼침 → content-type/response topic/user property 입력 후 발행
- [ ] 수신 메시지 상세에 content-type/response-topic/user property 표시 (5.0 연결)

## 설정
- [ ] 테마 dark ↔ light 전환 즉시 반영, 재시작 후 유지

정리: `docker rm -f mosq`
