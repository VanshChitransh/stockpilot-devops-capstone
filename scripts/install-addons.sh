#!/usr/bin/env bash
# cluster add-ons the app depends on. same script for kind and EKS:
#   ./scripts/install-addons.sh kind   # ingress uses host ports 80/443 on the kind node
#   ./scripts/install-addons.sh eks    # ingress gets an AWS load balancer
set -euo pipefail
TARGET="${1:-kind}"
cd "$(dirname "$0")/.."

helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx >/dev/null
helm repo add metrics-server https://kubernetes-sigs.github.io/metrics-server/ >/dev/null
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts >/dev/null
helm repo update >/dev/null

echo "==> ingress-nginx (implements the Ingress resource)"
if [ "$TARGET" = "kind" ]; then
  helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx -n ingress-nginx --create-namespace \
    --set controller.hostPort.enabled=true \
    --set controller.service.type=NodePort \
    --set-string controller.nodeSelector.ingress-ready=true \
    --set 'controller.tolerations[0].key=node-role.kubernetes.io/control-plane' \
    --set 'controller.tolerations[0].operator=Exists' \
    --set 'controller.tolerations[0].effect=NoSchedule' \
    --set controller.watchIngressWithoutClass=true \
    --wait --timeout 5m
else
  helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx -n ingress-nginx --create-namespace \
    --set controller.service.type=LoadBalancer \
    --wait --timeout 10m
fi

echo "==> metrics-server (feeds CPU numbers to the HPA)"
# kind kubelets use self-signed certs, hence --kubelet-insecure-tls (not needed on EKS)
EXTRA=()
[ "$TARGET" = "kind" ] && EXTRA=(--set 'args={--kubelet-insecure-tls}')
helm upgrade --install metrics-server metrics-server/metrics-server -n kube-system "${EXTRA[@]}" --wait --timeout 5m

echo "==> kube-prometheus-stack (prometheus operator + prometheus + grafana)"
kubectl apply -f k8s/namespace.yaml
helm upgrade --install monitoring prometheus-community/kube-prometheus-stack -n monitoring \
  -f monitoring/kube-prometheus-stack-values.yaml --wait --timeout 10m

echo "add-ons ready"
