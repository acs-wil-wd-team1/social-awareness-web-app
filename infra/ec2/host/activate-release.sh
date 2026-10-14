#!/usr/bin/env bash

# Sourced by deploy.sh. The second argument is used only by isolated regression tests.
activate_release() {
  local release_dir=$1 app_root=${2:-/srv/causeconnect}
  local previous='' healthy=0 _attempt
  local compatibility_checker
  compatibility_checker="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/check-release-compatibility.py"
  [[ -d "$release_dir" && "$release_dir" == "$app_root/releases/"* && ! -L "$release_dir" ]] || {
    echo 'Candidate must be a managed release directory; refusing activation.' >&2; return 1;
  }
  [[ $(readlink -e "$release_dir") == "$release_dir" ]] || {
    echo 'Candidate release path is not canonical; refusing activation.' >&2; return 1;
  }
  if [[ -L "$app_root/current" ]]; then
    previous=$(readlink -e "$app_root/current") || {
      echo 'Current release symlink is broken; inspect before deployment.' >&2; return 1;
    }
    [[ -d "$previous" && "$previous" == "$app_root/releases/"* ]] || {
      echo 'Current release points outside the managed releases directory.' >&2; return 1;
    }
  elif [[ -e "$app_root/current" ]]; then
    echo 'Current release must be a symlink; refusing to overwrite it.' >&2
    return 1
  fi
  # Check before changing the symlink or touching a healthy running service.
  local schema_sources=(--schema-source "$release_dir")
  if [[ -n "$previous" ]]; then schema_sources+=(--schema-source "$previous"); fi
  python3 "$compatibility_checker" --candidate "$release_dir" "${schema_sources[@]}" || return 1
  ln -sfn "$release_dir" "$app_root/current.next"
  mv -Tf "$app_root/current.next" "$app_root/current"
  if systemctl restart causeconnect.service; then
    for _attempt in {1..20}; do
      if curl --fail --silent --max-time 2 http://127.0.0.1:3000/health >/dev/null; then healthy=1; break; fi
      sleep 1
    done
  fi
  if [[ "$healthy" != 1 ]]; then
    if [[ -n "$previous" && "$previous" != "$release_dir" ]] && \
      python3 "$compatibility_checker" --candidate "$previous" "${schema_sources[@]}"; then
      ln -sfn "$previous" "$app_root/current.next"
      mv -Tf "$app_root/current.next" "$app_root/current"
      systemctl restart causeconnect.service || echo 'Previous release selected, but its service restart also failed.' >&2
    else
      systemctl stop causeconnect.service || echo 'Service stop failed; inspect systemd state.' >&2
      echo 'No schema-compatible previous release is available; API stopped rather than restoring unsafe reads.' >&2
    fi
    echo 'API startup/health failed. Previous code restored only when schema-compatible. Database migrations were NOT reversed; inspect before proceeding.' >&2
    return 1
  fi
  if [[ -n "$previous" && "$previous" != "$release_dir" ]]; then ln -sfn "$previous" "$app_root/previous"; fi
}
