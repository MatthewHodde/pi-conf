#!/usr/bin/env bash
# drive the full matrix: each config runs its 5 tasks sequentially, configs in parallel
cd /tmp/spike/harness || exit 1
rm -rf out && mkdir -p out
for cfg in cfg cfg-hashlinepro cfg-editguard cfg-betteredit cfg-linehash cfg-editfile; do
  (
    for t in tasks/*/; do
      ./run.sh "/tmp/spike/$cfg" "$t" out
    done
  ) &
done
wait
echo "MATRIX DONE"
