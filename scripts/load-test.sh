#!/usr/bin/env bash
# drives CPU on the backend pods so the HPA has something to react to.
# runs the load *inside* the cluster (no dependence on your laptop's network/ingress)
#   ./scripts/load-test.sh            # 3 min, 8 workers
#   DURATION=300 WORKERS=12 ./scripts/load-test.sh
# watch it in another terminal:  kubectl get hpa -n stockpilot -w
set -euo pipefail
NS="${NS:-stockpilot}"
DURATION="${DURATION:-180}"
WORKERS="${WORKERS:-8}"
TARGET="${TARGET:-http://stockpilot-backend:8000}"

kubectl -n "$NS" delete pod loadgen --ignore-not-found >/dev/null
# /api/products and /api/stats both hit postgres and serialise JSON = real CPU work
kubectl -n "$NS" apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: loadgen
  labels: {app.kubernetes.io/name: loadgen}
spec:
  restartPolicy: Never
  securityContext:
    runAsNonRoot: true
    runAsUser: 65534
    seccompProfile: {type: RuntimeDefault}
  containers:
    - name: loadgen
      image: busybox:1.37
      securityContext:
        allowPrivilegeEscalation: false
        capabilities: {drop: [ALL]}
      command:
        - sh
        - -c
        - |
          end=\$((\$(date +%s) + $DURATION))
          for w in \$(seq $WORKERS); do
            ( while [ \$(date +%s) -lt \$end ]; do
                wget -q -O /dev/null $TARGET/api/products
                wget -q -O /dev/null $TARGET/api/stats
              done ) &
          done
          wait
          echo load finished
EOF
echo "load generator started for ${DURATION}s with ${WORKERS} workers"
echo "watch:   kubectl get hpa -n $NS -w"
echo "cleanup: kubectl -n $NS delete pod loadgen"
