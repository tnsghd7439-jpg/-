#!/usr/bin/env bash
# 클라우드 세션에서 수집기 실행 환경 준비 (Playwright + 브라우저 인증서)
set -euo pipefail
python3 -c "import playwright" 2>/dev/null || pip install -q playwright
# 세션 프록시 CA를 Chromium(NSS) 신뢰 목록에 등록 — TLS 검증은 유지
if [ -f /root/.ccr/ca-bundle.crt ] && ! certutil -L -d sql:/root/.pki/nssdb 2>/dev/null | grep -q ccr-0; then
  command -v certutil >/dev/null || apt-get install -y -q libnss3-tools >/dev/null 2>&1 \
    || (apt-get update -q >/dev/null 2>&1 && apt-get install -y -q libnss3-tools >/dev/null 2>&1)
  mkdir -p /root/.pki/nssdb
  [ -f /root/.pki/nssdb/cert9.db ] || certutil -N -d sql:/root/.pki/nssdb --empty-password
  tmp=$(mktemp -d)
  csplit -s -z -f "$tmp/c-" /root/.ccr/ca-bundle.crt '/-----BEGIN CERTIFICATE-----/' '{*}'
  n=0; for f in "$tmp"/c-*; do certutil -A -d sql:/root/.pki/nssdb -t "C,," -n "ccr-$n" -i "$f" 2>/dev/null && n=$((n+1)); done
  rm -rf "$tmp"
fi
