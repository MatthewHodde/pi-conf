#!/usr/bin/env bash
cd /tmp/spike/harness || exit 1
rm -rf out2 && mkdir -p out2
for cfg in cfg cfg-hashlinepro cfg-editguard cfg-betteredit cfg-linehash cfg-editfile; do
  (
    for t in tasks/big-file-edit tasks/escaped-json; do
      ./run.sh "/tmp/spike/$cfg" "$t" out2
    done
  ) &
done
# flake probe: repeat the linehash cell that timed out
(
  for i in 1 2 3; do
    ./run.sh /tmp/spike/cfg-linehash tasks/indent-mismatch out2-rep$i
  done
) &
wait
echo "HARD ROUND DONE"
