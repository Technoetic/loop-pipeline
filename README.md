# PIPE / RUSH

반복을 흐름으로. Martin Fowler의 **Replace Loop with Pipeline**을 추상화한 한국어 액션 퍼즐입니다. 결제된 주문을 고르고, 필요한 값으로 바꾸고, 합계를 만드는 처리 라인을 연결하면서 원래 반복문의 결과를 유지합니다.

[게임 플레이](https://technoetic.github.io/loop-pipeline/)

## 실행

Node22 이상, 추가 패키지 설치 없음.

```sh
npm test
npm start
```

로컬 실행 주소는 `http://127.0.0.1:8796/loop-pipeline/`입니다. `npm run build`는 `dist/`에 정적 웹앱을 만듭니다. GitHub Actions가 테스트 후 GitHub Pages에 배포합니다.

## 플레이

- 90초 챌린지 또는 시간 제한 없는 연습을 선택합니다.
- 연산 카드를 골라 처리 라인에 배치하고 실행해 원본 결과와 비교합니다.
- 단계 순서, 중복 주문, 빈 주문표도 결과의 일부입니다.
- 마지막 재고 문제는 제공된 카드로 동작을 유지할 수 없어 반복문을 유지해야 합니다. 상태를 전달하는 다른 설계로 표현할 가능성까지 부정하는 문제는 아닙니다.
- 오답과 힌트는 챌린지에서5초를 사용합니다. 일시정지·진행 저장·이어하기·로컬 기록을 지원합니다.

브라우저 저장은 접속 주소별로 분리됩니다. 온라인 계정이나 온라인 순위는 없습니다. 주어진 문제/입력 표본의 비교이며 임의 프로그램의 일반적 동치 증명, 자동 성능 향상 또는 병렬 처리를 의미하지 않습니다.

## 구조

`src/game`은 제한된 연산과 세션 상태/시계, `src/screens`는 화면과 조작, `src/services`는 데이터·저장·화면 이동·버전·소리, `src/shared`는 공통 함수를 담당합니다. 스타일은 tokens/base/components/effects로 분리합니다. URL의 해시 경로로 직접 링크·뒤로·앞으로 이동하며, 새 build를 감지하면 진행을 보호하고 다음 안전한 이동에서 새 문서를 받습니다. 문제 데이터도 build 식별자에 포함합니다.

## GitHub Pages

배포 파일명에 build 식별자를 넣습니다. 현재 공개된 build의 자산 한 세대를 SHA-256으로 검증해 함께 보존합니다. 한도는 128개, 파일당 2 MiB, 합계 8 MiB이며 이전 HTML과 문제 데이터는 복사하지 않습니다. 첫 저장소 push에서만 이전 매니페스트의 404를 허용하고 이후 검증 실패는 배포를 중단합니다.

`node scripts/manifest.mjs`는 배포 파일의 SHA-256 매니페스트를 만듭니다. GitHub Pages의 캐시 헤더는 호스팅 정책을 따릅니다. 앱은 버전 조회에 캐시 방지 요청과 고유 쿼리를 사용하고 다음 안전한 이동에서 새 문서를 받습니다.

## 출처

- [Martin Fowler — Replace Loop with Pipeline](https://refactoring.com/catalog/replaceLoopWithPipeline.html)
- [MDN Array filter](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter)
- [MDN Array map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map)
- [MDN Array reduce](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/reduce)

카페 주문 문제와 비주얼은 이 게임을 위한 자체 설계이며 원문 도표나 벤치마크 재현이 아닙니다. 이전 LOOP / SPLIT의 자체 화면 이동·저장·빌드 기반을 새 앱 키로 분리해 사용했습니다.
