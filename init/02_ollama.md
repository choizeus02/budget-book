# 02. Mac Mini Ollama 설정

## 설치

**[ollama.com/download](https://ollama.com/download)** 에서 macOS 앱 다운로드 후 설치.

설치하면 메뉴바에 라마 아이콘이 생기고, 앱 실행 시 서버 자동 시작 + 재부팅 후에도 자동 실행됨.

## 모델 다운로드

앱 실행 상태에서 터미널:

```bash
ollama pull qwen2.5:7b
```

M4 32GB에서 7B 모델은 충분히 빠름. 더 정확도가 필요하면 `qwen2.5:14b`도 가능 (약 9GB).

## 외부 접근 설정 (K3s 파드에서 호출 가능하도록)

기본값은 `localhost`만 수신 → K3s 파드에서 접근 불가. 아래 한 번만 실행:

```bash
launchctl setenv OLLAMA_HOST "0.0.0.0"
```

그 다음 메뉴바 아이콘 → **Restart Ollama**

## 동작 확인

```bash
# 로컬에서
curl http://localhost:11434/api/tags

# 다른 기기에서 (Mac Mini IP로)
curl http://192.168.45.XXX:11434/api/tags
```

`qwen2.5:7b` 모델이 목록에 보이면 완료.

## Mac Mini IP 고정

Ollama URL을 고정 IP로 써야 K8s secret이 유효함.
라우터(공유기) 관리 페이지에서 Mac Mini의 MAC 주소로 고정 IP 할당:

1. 공유기 관리 페이지 접속
2. DHCP 설정 → 고정 IP 할당 (MAC 주소 기반)
3. Mac Mini MAC 주소 확인: `ifconfig en0 | grep ether`
4. `192.168.45.xxx` 대역 중 미사용 IP 지정 (200~210은 MetalLB가 사용 중)
