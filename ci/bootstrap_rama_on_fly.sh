#!/usr/bin/env bash
set -euo pipefail

RAMA_URL="${RAMA_URL:-https://redplanetlabs.s3.us-west-2.amazonaws.com/rama/rama-1.1.0.zip}"
RAMA_ROOT="/app/rama"
RAMA_DIR="${RAMA_ROOT}/runtime"
MODULE_JAR="${MODULE_JAR:-/app/rama/rama-playground.jar}"
MODULE_NAME="${RAMA_MODULE_NAME:-sorter.playground-module/PlaygroundModule}"

log() {
  printf '[bootstrap-rama] %s\n' "$*"
}

ensure_prereqs() {
  log "Installing Rama prerequisites"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y --no-install-recommends \
    curl \
    unzip \
    python3 \
    openjdk-17-jre-headless \
    procps
}

install_rama() {
  if [[ -x "${RAMA_DIR}/rama" ]]; then
    log "Rama runtime already present"
    return
  fi

  log "Fetching Rama runtime from ${RAMA_URL}"
  tmpdir=$(mktemp -d)
  curl -fsSL "${RAMA_URL}" -o "${tmpdir}/rama.zip"
  mkdir -p "${tmpdir}/extracted"
  unzip -q "${tmpdir}/rama.zip" -d "${tmpdir}/extracted"
  rm -rf "${RAMA_DIR}"
  mkdir -p "${RAMA_ROOT}"
  mv "${tmpdir}/extracted" "${RAMA_DIR}"
  chmod +x "${RAMA_DIR}/rama"
  rm -rf "${tmpdir}"
  log "Rama runtime installed to ${RAMA_DIR}"
}

run_rama() {
  (cd "${RAMA_DIR}" && ./rama "$@")
}

start_process() {
  local name="$1"
  local pattern="$2"
  local command="$3"

  if pgrep -f "$pattern" >/dev/null 2>&1; then
    log "$name already running"
    return
  fi

  log "Starting $name"
  mkdir -p "${RAMA_ROOT}/logs"
  nohup bash -lc "cd '${RAMA_DIR}' && ${command}" \
    >"${RAMA_ROOT}/logs/${name}.log" 2>&1 &
  # give the process a moment to boot
  sleep 2
}

wait_for_conductor() {
  log "Waiting for conductor to report READY"
  for _ in $(seq 1 60); do
    if run_rama conductorReady | grep -iq "true"; then
      log "Conductor is READY"
      return 0
    fi
    sleep 2
  done
  log "Conductor did not become ready in time"
  return 1
}

module_needs_launch() {
  local status
  if ! status=$(run_rama moduleStatus "${MODULE_NAME}" 2>&1); then
    echo "$status" >&2
    return 0
  fi

  if echo "$status" | grep -q "NOT_ALIVE"; then
    return 0
  fi

  if echo "$status" | grep -q "ALIVE"; then
    return 1
  fi

  # Unknown status, attempt launch
  return 0
}

deploy_module() {
  if [[ ! -f "${MODULE_JAR}" ]]; then
    log "Module jar not found at ${MODULE_JAR}"
    return 1
  fi

  if module_needs_launch; then
    log "Launching Rama module ${MODULE_NAME}"
    if ! output=$(run_rama deploy \
      --action launch \
      --jar "${MODULE_JAR}" \
      --module "${MODULE_NAME}" \
      --tasks 2 \
      --threads 2 \
      --workers 1 2>&1); then
      if echo "$output" | grep -q "Module already launched"; then
        log "Module already launched"
      else
        echo "$output" >&2
        return 1
      fi
    else
      echo "$output"
    fi
  else
    log "Module ${MODULE_NAME} already running"
  fi
}

wait_for_module_alive() {
  log "Waiting for Rama module ${MODULE_NAME} to become ALIVE"
  for _ in $(seq 1 60); do
    status=$(run_rama moduleStatus "${MODULE_NAME}" 2>&1 || true)
    if echo "$status" | grep -q "ALIVE"; then
      log "Module ${MODULE_NAME} is ALIVE"
      return 0
    fi
    sleep 2
  done
  log "Module ${MODULE_NAME} did not become ALIVE"
  return 1
}

main() {
  if [[ ! -f "${MODULE_JAR}" ]]; then
    log "Expected module jar at ${MODULE_JAR} is missing"
    exit 1
  fi

  ensure_prereqs
  install_rama

  start_process "devzookeeper" "rama devZookeeper" "./rama devZookeeper"
  start_process "conductor" "rama conductor" "./rama conductor"
  start_process "supervisor" "rama supervisor" "./rama supervisor"

  wait_for_conductor
  deploy_module
  wait_for_module_alive

  log "Rama runtime ready"
}

main "$@"
