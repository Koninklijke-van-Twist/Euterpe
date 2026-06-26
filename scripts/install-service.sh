#!/usr/bin/env bash
# Installeer de Euterpe systemd-service.
# Gebruik: sudo ./scripts/install-service.sh [gebruiker]
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Voer uit met sudo: sudo $0" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE_USER="${1:-${SUDO_USER:-root}}"
UNIT_PATH="/etc/systemd/system/euterpe.service"
ENV_DIR="/etc/euterpe"
ENV_FILE="${ENV_DIR}/env"

chmod +x "${ROOT}/scripts/run.sh" "${ROOT}/scripts/restart.sh"

sed \
  -e "s|@INSTALL_DIR@|${ROOT}|g" \
  -e "s|@SERVICE_USER@|${SERVICE_USER}|g" \
  "${ROOT}/scripts/euterpe.service" > "${UNIT_PATH}"

if [[ ! -f "${ENV_FILE}" ]]; then
  mkdir -p "${ENV_DIR}"
  cat > "${ENV_FILE}" <<EOF
# Euterpe environment (geladen door systemd)
# EUTERPE_PORT=8000
# EUTERPE_DATA_DIR=${ROOT}/data
# EUTERPE_MPV_PATH=mpv
EOF
  chmod 640 "${ENV_FILE}"
  chown root:"${SERVICE_USER}" "${ENV_FILE}" 2>/dev/null || true
fi

systemctl daemon-reload
systemctl enable euterpe.service
systemctl restart euterpe.service

echo "Euterpe service geïnstalleerd."
echo "  Status:  systemctl status euterpe"
echo "  Logs:    journalctl -u euterpe -f"
echo "  Config:  ${ENV_FILE}"
